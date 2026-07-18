import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryApprovalGate } from '../adapters/in-memory-approval-gate.js'
import { InMemoryEventBus } from '../adapters/in-memory-event-bus.js'
import { InMemorySessionStore } from '../adapters/in-memory-session-store.js'
import { InMemoryThreadStore } from '../adapters/in-memory-thread-store.js'
import { InMemoryUserInputGate } from '../adapters/in-memory-user-input-gate.js'
import { LocalToolHost } from '../adapters/tool/local-tool-host.js'
import { createImmutablePrefix } from '../cache/immutable-prefix.js'
import { createThreadRecord } from '../domain/thread.js'
import { createApprovalRequest } from '../domain/approval.js'
import type { ModelClient } from '../ports/model-client.js'
import { SequentialIdGenerator } from '../ports/id-generator.js'
import { RuntimeEventRecorder } from '../services/runtime-event-recorder.js'
import { TaskController } from '../services/task-controller.js'
import { TaskRunRepository } from '../services/task-run-repository.js'
import { RuntimeSpanService } from '../services/runtime-span-service.js'
import { TurnService } from '../services/turn-service.js'
import { UsageService } from '../services/usage-service.js'
import { ContextCompactor } from './context-compactor.js'
import { AgentLoop } from './agent-loop.js'
import { InflightTracker } from './inflight-tracker.js'
import { SteeringQueue } from './steering-queue.js'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('persistent task acceptance', () => {
  it('continues reasoning-only and transient exception attempts, then emits completion exactly once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-task-recovery-'))
    cleanup.push(root)
    const threadStore = new InMemoryThreadStore()
    const sessionStore = new InMemorySessionStore()
    const eventBus = new InMemoryEventBus()
    const inflight = new InflightTracker()
    const steering = new SteeringQueue()
    const compactor = new ContextCompactor()
    const ids = new SequentialIdGenerator()
    const nowIso = () => new Date().toISOString()
    const events = new RuntimeEventRecorder({
      eventBus,
      sessionStore,
      allocateSeq: (threadId) => eventBus.allocateSeq(threadId),
      nowIso
    })
    const repository = new TaskRunRepository(join(root, 'tasks.sqlite3'))
    const spans = new RuntimeSpanService(repository, nowIso)
    const tasks = new TaskController({ repository, threadStore, sessionStore, nowIso, ownerId: 'test-runtime', spans })
    const turns = new TurnService({
      threadStore,
      sessionStore,
      events,
      inflight,
      steering,
      compactor,
      ids,
      nowIso,
      tasks
    })
    const threadId = 'thread_reasoning_only'
    await threadStore.upsert(createThreadRecord({
      id: threadId,
      title: 'reasoning only recovery',
      workspace: root,
      model: 'fake'
    }))
    const started = await turns.startTurn({ threadId, request: { prompt: '请回答这个问题。' } })
    let calls = 0
    const model: ModelClient = {
      provider: 'fake',
      model: 'fake',
      async *stream() {
        calls += 1
        if (calls === 1) {
          yield { kind: 'assistant_reasoning_delta', text: '我已经想清楚了。' }
          yield { kind: 'completed', stopReason: 'stop' }
          return
        }
        if (calls === 2) throw new Error('temporary network failure')
        yield { kind: 'assistant_text_delta', text: '这是已经完成的最终答案。' }
        yield { kind: 'completed', stopReason: 'stop' }
      }
    }
    const loop = new AgentLoop({
      threadStore,
      sessionStore,
      approvalGate: new InMemoryApprovalGate(),
      userInputGate: new InMemoryUserInputGate(),
      model,
      toolHost: new LocalToolHost({ tools: [] }),
      usage: new UsageService(),
      events,
      turns,
      inflight,
      steering,
      compactor,
      prefix: createImmutablePrefix(),
      ids,
      nowIso,
      tasks
    })

    await expect(loop.runTurn(threadId, started.turnId)).resolves.toBe('completed')

    const task = repository.list({ threadId })[0]
    const persistedEvents = await sessionStore.loadEventsSince(threadId, 0)
    expect(calls).toBe(3)
    expect(task).toMatchObject({ status: 'completed', attempts: 3, finalResponse: '这是已经完成的最终答案。' })
    expect(repository.events(task!.id).some((event) => event.kind === 'attempt_retrying')).toBe(true)
    const recordedSpans = spans.list(task!.id)
    expect(recordedSpans.filter((span) => span.kind === 'turn').map((span) => span.status).sort())
      .toEqual(['error', 'error', 'ok'])
    expect(recordedSpans.filter((span) => span.kind === 'task')).toMatchObject([{ status: 'ok' }])
    expect(persistedEvents.filter((event) => event.kind === 'turn_completed')).toHaveLength(1)
    repository.close()
  })

  it('cancels the active turn, task, approval and user-input wait as one operation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-task-cancel-'))
    cleanup.push(root)
    const threadStore = new InMemoryThreadStore()
    const sessionStore = new InMemorySessionStore()
    const eventBus = new InMemoryEventBus()
    const inflight = new InflightTracker()
    const steering = new SteeringQueue()
    const ids = new SequentialIdGenerator()
    const nowIso = () => new Date().toISOString()
    const approvalGate = new InMemoryApprovalGate()
    const userInputGate = new InMemoryUserInputGate()
    const events = new RuntimeEventRecorder({
      eventBus,
      sessionStore,
      allocateSeq: (threadId) => eventBus.allocateSeq(threadId),
      nowIso
    })
    const repository = new TaskRunRepository(join(root, 'tasks.sqlite3'))
    const tasks = new TaskController({ repository, threadStore, sessionStore, nowIso, ownerId: 'test-runtime' })
    const turns = new TurnService({
      threadStore,
      sessionStore,
      events,
      inflight,
      steering,
      compactor: new ContextCompactor(),
      ids,
      nowIso,
      tasks,
      approvalGate,
      userInputGate
    })
    const threadId = 'thread_cancel_tree'
    await threadStore.upsert(createThreadRecord({
      id: threadId,
      title: 'cancel task tree',
      workspace: root,
      model: 'fake'
    }))
    const started = await turns.startTurn({ threadId, request: { prompt: '创建一个文档。' } })
    const signal = turns.getAbortController(started.turnId)
    const approval = approvalGate.request(createApprovalRequest({
      id: 'approval_cancel_tree',
      threadId,
      turnId: started.turnId,
      toolName: 'write_file',
      summary: 'write a file'
    }))
    const input = userInputGate.request({
      id: 'input_cancel_tree',
      threadId,
      turnId: started.turnId,
      itemId: 'item_input',
      prompt: 'choose',
      questions: []
    })

    await expect(turns.interruptTurn({ threadId, turnId: started.turnId })).resolves.toEqual({ status: 'aborted' })

    expect(signal?.aborted).toBe(true)
    await expect(approval).resolves.toBe('deny')
    await expect(input).resolves.toEqual({ status: 'cancelled' })
    expect(approvalGate.get('approval_cancel_tree')?.status).toBe('expired')
    expect(userInputGate.pending(threadId)).toHaveLength(0)
    expect(repository.list({ threadId })[0]?.status).toBe('cancelled')
    expect((await threadStore.get(threadId))?.turns[0]?.status).toBe('aborted')
    repository.close()
  })
})
