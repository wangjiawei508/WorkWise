import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemorySessionStore } from '../adapters/in-memory-session-store.js'
import { InMemoryThreadStore } from '../adapters/in-memory-thread-store.js'
import { createThreadRecord } from '../domain/thread.js'
import { TaskController } from './task-controller.js'
import { TaskRunRepository } from './task-run-repository.js'
import { RuntimeSpanService } from './runtime-span-service.js'
import { makeAssistantTextItem, makeToolResultItem } from '../domain/item.js'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture(prompt = '完成可靠性测试。') {
  const root = await mkdtemp(join(tmpdir(), 'workwise-task-controller-'))
  cleanup.push(root)
  const repository = new TaskRunRepository(join(root, 'tasks.sqlite3'))
  const threadStore = new InMemoryThreadStore()
  const sessionStore = new InMemorySessionStore()
  const thread = createThreadRecord({
    id: 'thread_reliability',
    title: 'reliability',
    workspace: root,
    model: 'fixture'
  })
  await threadStore.upsert(thread)
  let now = '2026-07-18T00:00:00.000Z'
  const spans = new RuntimeSpanService(repository, () => now)
  const controller = new TaskController({
    repository,
    threadStore,
    sessionStore,
    nowIso: () => now,
    ownerId: 'test-runtime',
    spans
  })
  const task = controller.ensureTask({
    thread,
    turnId: 'turn_reliability',
    request: { prompt }
  })
  return {
    root,
    thread,
    threadStore,
    repository,
    sessionStore,
    spans,
    controller,
    task,
    setNow(value: string) { now = value }
  }
}

describe('TaskController reliability boundaries', () => {
  it('captures the selected Agent model and bounded budget in a new task', async () => {
    const { repository, controller, thread, threadStore } = await fixture()
    const selectedThread = {
      ...thread,
      id: 'thread_agent_policy',
      agentId: 'review',
      agentProfile: {
        id: 'review', name: 'Review', role: '审查', color: '#f59e0b',
        systemPrompt: '只读审查。', model: 'review-model',
        toolAllowlist: ['read'], mcpAllowlist: [], trustLevel: 'read-only' as const,
        budget: { maxAttempts: 3, maxDurationMs: 60_000, maxCostUsd: 2 }, revision: 1
      },
      costBudgetUsd: 1
    }
    await threadStore.upsert(selectedThread)
    const task = controller.ensureTask({
      thread: selectedThread,
      turnId: 'turn_agent_policy',
      request: { prompt: '审查当前实现。' }
    })
    expect(task).toMatchObject({
      agentId: 'review',
      model: 'review-model',
      budget: { maxAttempts: 3, maxDurationMs: 60_000, maxCostUsd: 1 }
    })
    repository.close()
  })

  it('replans repeated no-progress attempts and stalls with a recoverable checkpoint', async () => {
    const { repository, controller, task } = await fixture()
    let lastKind = ''
    for (let attempt = 0; attempt < 7; attempt += 1) {
      controller.beginAttempt(task.threadId, 'turn_reliability')
      lastKind = controller.recordAttemptFailure(
        task.threadId,
        'turn_reliability',
        'network_unavailable',
        'network unavailable'
      )?.kind ?? ''
    }

    const stored = repository.get(task.id)
    expect(lastKind).toBe('stalled')
    expect(stored).toMatchObject({ status: 'stalled', replans: 2, attempts: 7 })
    expect(repository.events(task.id).filter((event) => event.kind === 'task_replanned')).toHaveLength(1)
    expect(repository.events(task.id).filter((event) => event.kind === 'task_stalled')).toHaveLength(1)
    expect(repository.latestCheckpoint(task.id)?.resumeSummary).toBe('network unavailable')
    repository.close()
  })

  it('fails at a hard attempt budget without ever writing a completion event', async () => {
    const { repository, controller, task } = await fixture()
    let decision
    for (let attempt = 0; attempt < 8; attempt += 1) {
      controller.beginAttempt(task.threadId, 'turn_reliability')
      decision = controller.recordAttemptFailure(
        task.threadId,
        'turn_reliability',
        `fixture_${attempt}`,
        `different failure ${attempt}`
      )
    }

    expect(decision?.kind).toBe('failed')
    expect(repository.get(task.id)?.status).toBe('failed')
    expect(repository.events(task.id).filter((event) => event.kind === 'task_completed')).toHaveLength(0)
    expect(repository.events(task.id).filter((event) => event.kind === 'task_failed')).toHaveLength(1)
    repository.close()
  })

  it('enforces the duration budget and recovers an expired running lease after restart', async () => {
    const { repository, controller, task, setNow } = await fixture()
    const constrained = repository.update(task.id, task.revision, (current) => ({
      ...current,
      budget: { ...current.budget, maxDurationMs: 1 },
      revision: current.revision
    }))
    controller.beginAttempt(constrained.threadId, 'turn_reliability')
    setNow('2026-07-18T00:00:01.000Z')
    const exhausted = controller.recordAttemptFailure(
      constrained.threadId,
      'turn_reliability',
      'temporary',
      'temporary failure'
    )
    expect(exhausted?.task.nodes[0]?.errorCode).toBe('duration_budget_exhausted')

    repository.close()

    const recovery = await fixture()
    recovery.controller.beginAttempt(recovery.task.threadId, 'turn_reliability')
    recovery.setNow('2026-07-18T00:02:00.000Z')
    const recovered = recovery.controller.reconcileStartup()
    expect(recovered).toHaveLength(1)
    expect(recovered[0]).toMatchObject({ status: 'retrying' })
    expect(recovery.repository.latestCheckpoint(recovery.task.id)?.resumeSummary).toContain('自动续跑')
    recovery.repository.close()
  })

  it('records task, turn, and artifact validation spans without storing the absolute artifact path', async () => {
    const { root, repository, sessionStore, spans, controller, task } = await fixture(
      '请生成并交付 result.md Markdown 文件。'
    )
    await writeFile(join(root, 'result.md'), '# Verified deliverable\n', 'utf8')
    await sessionStore.appendItem(task.threadId, makeToolResultItem({
      id: 'item_tool_result',
      threadId: task.threadId,
      turnId: 'turn_reliability',
      callId: 'call_write',
      toolName: 'write',
      output: { path: join(root, 'result.md') }
    }))
    await sessionStore.appendItem(task.threadId, makeAssistantTextItem({
      id: 'item_assistant',
      threadId: task.threadId,
      turnId: 'turn_reliability',
      text: 'Markdown 文档已生成并交付。',
      status: 'completed'
    }))

    controller.beginAttempt(task.threadId, 'turn_reliability')
    await expect(controller.assessCandidate(task.threadId, 'turn_reliability'))
      .resolves.toMatchObject({ kind: 'completed' })

    const diagnostics = spans.diagnostics(task.id)
    expect(diagnostics.spans.map((span) => span.kind)).toEqual(
      expect.arrayContaining(['task', 'turn', 'validation'])
    )
    expect(diagnostics.spans.every((span) => !JSON.stringify(span).includes(root))).toBe(true)
    expect(diagnostics.spans.find((span) => span.kind === 'validation')).toMatchObject({
      status: 'ok',
      attributes: { format: 'md', valid: true }
    })
    repository.close()
  })
})
