import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { EngineeringService } from './engineering-service.js'
import { EngineeringContextService } from './engineering-context-service.js'
import { EngineeringAiOrchestrator } from './engineering-ai-orchestrator.js'

describe('Engineering AI orchestration', () => {
  it('creates bounded plans, rejects unsafe tools and replays idempotent requests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-ai-'))
    const engineering = new EngineeringService({ rootDir: join(root, 'runtime') })
    const project = engineering.createProject({ name: 'AI project', workspace: root, expectedRevision: 0, idempotencyKey: 'ai-project-001' })
    const context = new EngineeringContextService(engineering)
    const turns = { startTurn: vi.fn(async () => ({ threadId: 'thread-1', turnId: 'turn-1' })) }
    const threadStore = { get: vi.fn(async () => ({ domain: 'engineering', projectId: project.id })) }
    const runTurn = vi.fn()
    const orchestrator = new EngineeringAiOrchestrator({ context, threadStore: threadStore as never, turns: turns as never, runTurn })

    const first = orchestrator.createPlan({ threadId: 'thread-1', projectId: project.id, goal: '检查本期数据并生成报告', idempotencyKey: 'ai-plan-001' })
    expect(first.plan.status).toBe('awaiting_approval')
    expect(first.approval.stepIds).toHaveLength(first.plan.steps.length)
    const replay = orchestrator.createPlan({ threadId: 'thread-1', projectId: project.id, goal: '检查本期数据并生成报告', idempotencyKey: 'ai-plan-001' })
    expect(replay.plan.id).toBe(first.plan.id)
    expect(() => orchestrator.createPlan({
      threadId: 'thread-1', projectId: project.id, goal: '不安全计划', idempotencyKey: 'ai-plan-002',
      steps: [{ id: 'bad', title: 'bad', tool: 'shell', risk: 'write', dependsOn: [], inputHash: first.plan.contextHash, approval: 'pending' }]
    })).toThrow(/allowlisted/)

    const approved = orchestrator.approvePlan(first.plan.id, { expectedRevision: 1, contextHash: first.plan.contextHash, stepIds: first.plan.steps.map((step) => step.id), token: first.approval.token, idempotencyKey: 'ai-approve-001' })
    expect(approved.status).toBe('approved')
    const started = await orchestrator.startPlan(first.plan.id, { expectedRevision: approved.revision, contextHash: approved.contextHash, idempotencyKey: 'ai-start-001' })
    expect(started.plan.status).toBe('started')
    expect(turns.startTurn).toHaveBeenCalledTimes(1)
    expect(runTurn).toHaveBeenCalledWith('thread-1', 'turn-1')
    engineering.close()
  })

  it('does not expose raw observation rows in the context snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-context-'))
    const engineering = new EngineeringService({ rootDir: join(root, 'runtime') })
    const project = engineering.createProject({ name: 'bounded', workspace: root, expectedRevision: 0, idempotencyKey: 'ctx-project-001' })
    await engineering.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'ctx-import-001', name: 'data.csv', dataBase64: Buffer.from('point,time,value\nA,2026-01-01,1').toString('base64') })
    const snapshot = new EngineeringContextService(engineering).snapshot(project.id)
    expect(JSON.stringify(snapshot)).not.toContain('sourceFields')
    expect(snapshot.datasets[0]?.observationCount).toBe(1)
    expect(snapshot.watchDrafts).toEqual([])
    engineering.close()
  })

  it('marks a plan stale when the bounded context revision changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-stale-'))
    const engineering = new EngineeringService({ rootDir: join(root, 'runtime') })
    const project = engineering.createProject({ name: 'stale', workspace: root, expectedRevision: 0, idempotencyKey: 'stale-project-001' })
    const context = new EngineeringContextService(engineering)
    const threadStore = { get: vi.fn(async () => ({ domain: 'engineering', projectId: project.id })) }
    const events = { record: vi.fn(async () => undefined) }
    const orchestrator = new EngineeringAiOrchestrator({
      context,
      threadStore: threadStore as never,
      turns: { startTurn: vi.fn() } as never,
      runTurn: vi.fn(),
      events: events as never
    })
    const created = orchestrator.createPlan({ threadId: 'thread-stale', projectId: project.id, goal: '检查数据', idempotencyKey: 'stale-plan-001' })
    engineering.updateProject(project.id, { name: 'stale-updated', expectedRevision: project.revision, idempotencyKey: 'stale-project-update-001' })
    await expect(Promise.resolve().then(() => orchestrator.validatePlan(created.plan.id, { expectedRevision: created.plan.revision, contextHash: created.plan.contextHash, idempotencyKey: 'stale-validate-001' }))).rejects.toThrow(/stale/i)
    expect(orchestrator.getPlan(created.plan.id)?.status).toBe('stale')
    expect(events.record).toHaveBeenCalled()
    engineering.close()
  })

  it('persists bounded Watch drafts without exposing observation rows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-watch-'))
    const engineering = new EngineeringService({ rootDir: join(root, 'runtime') })
    const project = engineering.createProject({ name: 'watch', workspace: root, expectedRevision: 0, idempotencyKey: 'watch-project-001' })
    const firstContext = new EngineeringContextService(engineering)
    const rule = await firstContext.addWatchDraft({ projectId: project.id, name: '沉降预警', expression: 'abs(value) >= threshold', idempotencyKey: 'watch-rule-001' })
    expect(rule.projectId).toBe(project.id)
    const restored = new EngineeringContextService(engineering).snapshot(project.id)
    expect(restored.watchDrafts[0]?.name).toBe('沉降预警')
    engineering.close()
  })
})
