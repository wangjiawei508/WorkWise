import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EngineeringService } from '../../engineering/engineering-service.js'
import { EngineeringContextService } from '../../engineering/engineering-context-service.js'
import { EngineeringAiRepository } from '../../engineering/engineering-ai-repository.js'
import { EngineeringAiOrchestrator } from '../../engineering/engineering-ai-orchestrator.js'
import type { ToolHostContext } from '../../ports/tool-host.js'
import { buildEngineeringConversationTools } from './engineering-conversation-tools.js'
import { LocalToolHost } from './local-tool-host.js'

describe('Survey continuous conversation capabilities', () => {
  let engineering: EngineeringService
  let repository: EngineeringAiRepository
  let orchestrator: EngineeringAiOrchestrator
  let host: LocalToolHost
  let context: ToolHostContext
  let projectId: string
  const thread = { domain: 'engineering', projectId: '', workspace: '', turns: [] as Array<{ id: string; status: string }> }
  const turns = { startTurn: vi.fn(), recordCompletedTurn: vi.fn() }
  const runTurn = vi.fn()
  const calculate = vi.fn(async () => ({ output: {} }))

  beforeEach(async () => {
    vi.clearAllMocks()
    const root = await mkdtemp(join(tmpdir(), 'survey-conversation-'))
    engineering = new EngineeringService({ rootDir: join(root, 'runtime') })
    projectId = engineering.createProject({ name: 'conversation', workspace: root, expectedRevision: 0, idempotencyKey: 'conversation-project' }).id
    repository = new EngineeringAiRepository({ rootDir: join(root, 'runtime') })
    Object.assign(thread, { domain: 'engineering', projectId, workspace: root, turns: [{ id: 'question-turn', status: 'running' }] })
    const threadStore = { get: vi.fn(async () => thread) }
    turns.startTurn.mockResolvedValue({ threadId: 'survey-thread', turnId: 'execution-turn' })
    orchestrator = new EngineeringAiOrchestrator({ context: new EngineeringContextService(engineering), repository, threadStore: threadStore as never, turns: turns as never, runTurn })
    const provider = buildEngineeringConversationTools(threadStore as never, () => orchestrator)
    host = new LocalToolHost({ tools: [...provider.tools, LocalToolHost.defineTool({ name: 'survey_calculator', description: 'test calculator', inputSchema: {}, policy: 'auto', execute: calculate })] })
    context = { threadId: 'survey-thread', turnId: 'question-turn', workspace: root, allowedToolNames: (await orchestrator.conversationPolicy('survey-thread', projectId, 'question-turn')).allowedToolNames, approvalPolicy: 'on-request', abortSignal: new AbortController().signal, awaitApproval: async () => 'deny' }
  })
  afterEach(() => { repository.close(); engineering.close() })

  it('answers from bounded project context without starting a plan or calculation', async () => {
    expect((await host.listTools(context)).map((tool) => tool.name)).toEqual(['survey_read_context', 'survey_request_plan'])
    expect((await host.execute({ callId: 'read', toolName: 'survey_read_context', arguments: {} }, context)).item).toMatchObject({ output: { context: { projectId } } })
    expect(repository.latestPlan('survey-thread', projectId)).toBeNull()
    expect(turns.startTurn).not.toHaveBeenCalled()
    expect(calculate).not.toHaveBeenCalled()
    await expect(host.execute({ callId: 'calculate', toolName: 'survey_calculator', arguments: {} }, context)).rejects.toThrow()
    expect(calculate).not.toHaveBeenCalled()
  })

  it('saves a pending plan without leaking its approval token or starting work', async () => {
    const result = await host.execute({ callId: 'plan', toolName: 'survey_request_plan', arguments: { goal: 'Adjust this network', steps: [{ tool: 'survey_calculator', title: 'Adjust network' }] } }, context)
    const plan = repository.latestPlan('survey-thread', projectId)!
    expect(plan.status).toBe('awaiting_approval')
    expect(plan.steps).toEqual([expect.objectContaining({ tool: 'survey_calculator', approval: 'pending', inputHash: plan.contextHash })])
    expect(JSON.stringify(result)).not.toContain(repository.approvalForPlan(plan.id, plan.revision)!.token)
    expect(turns.recordCompletedTurn).not.toHaveBeenCalled()
    expect(runTurn).not.toHaveBeenCalled()
    expect(calculate).not.toHaveBeenCalled()
    await expect(orchestrator.startPlan(plan.id, { contextHash: plan.contextHash, expectedRevision: plan.revision, idempotencyKey: 'start-without-approval' })).rejects.toThrow()

    thread.turns = []
    const approval = repository.approvalForPlan(plan.id, plan.revision)!
    const approved = orchestrator.approvePlan(plan.id, { expectedRevision: plan.revision, contextHash: plan.contextHash, stepIds: approval.stepIds, token: approval.token, idempotencyKey: 'approve-conversation-plan' })
    runTurn.mockImplementation(() => {
      expect(repository.planForTurn('survey-thread', 'execution-turn')?.status).toBe('started')
    })
    await orchestrator.startPlan(plan.id, { expectedRevision: approved.revision, contextHash: approved.contextHash, idempotencyKey: 'start-conversation-plan' })
    expect((await orchestrator.conversationPolicy('survey-thread', projectId, 'execution-turn')).allowedToolNames).toEqual(['survey_read_context', 'survey_calculator'])
    expect((await orchestrator.conversationPolicy('survey-thread', projectId, 'next-question')).allowedToolNames).not.toContain('survey_calculator')
    expect(turns.startTurn).toHaveBeenCalledWith(expect.objectContaining({ engineeringExecution: true }))
  })

  it.each(['domain', 'projectId', 'workspace'])('rejects mismatched %s before accessing project data', async (field) => {
    thread[field as 'domain' | 'projectId' | 'workspace'] = 'other'
    await expect(orchestrator.readConversationContext('survey-thread', projectId)).rejects.toThrow(/thread|scoped/)
    expect((await host.execute({ callId: 'wrong-plan', toolName: 'survey_request_plan', arguments: { goal: 'Adjust', steps: [{ tool: 'survey_calculator', title: 'Adjust' }] } }, context)).item).toMatchObject({ isError: true })
    expect(runTurn).not.toHaveBeenCalled()
  })

  it('rejects prompt-injected operations and a plan from a finished turn', async () => {
    expect((await host.execute({ callId: 'unsafe', toolName: 'survey_request_plan', arguments: { goal: 'run shell', steps: [{ tool: 'shell', title: 'execute' }] } }, context)).item).toMatchObject({ isError: true })
    thread.turns = [{ id: 'question-turn', status: 'completed' }]
    expect((await host.execute({ callId: 'finished', toolName: 'survey_request_plan', arguments: { goal: 'Adjust', steps: [{ tool: 'survey_calculator', title: 'Adjust' }] } }, context)).item).toMatchObject({ isError: true, output: { error: expect.stringContaining('active conversation') } })
    expect(repository.latestPlan('survey-thread', projectId)).toBeNull()
  })

  it('rejects selected network or result IDs outside the current project', async () => {
    await expect(orchestrator.readConversationContext('survey-thread', projectId, { networkId: 'other-network' })).rejects.toThrow(/current Survey project/)
    await expect(orchestrator.readConversationContext('survey-thread', projectId, { adjustmentId: 'other-result' })).rejects.toThrow(/current Survey project/)
  })
})
