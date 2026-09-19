// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import i18n from '../../i18n'
import { useChatStore } from '../../store/chat-store'
import { EngineeringAiCommandCenter } from './EngineeringAiCommandCenter'
import { useEngineeringConversationDrafts } from './engineering-conversation-drafts'

vi.mock('./EngineeringProjectSuggestions', () => ({ EngineeringProjectSuggestions: () => null }))

vi.mock('../chat/MessageTimeline', () => ({ MessageTimeline: () => createElement('div', { 'data-testid': 'message-timeline' }) }))
vi.mock('./EngineeringComposer', () => ({ EngineeringComposer: () => createElement('textarea', { 'aria-label': 'Survey composer' }) }))

type RuntimeResponse = { ok: boolean; status: number; body: string }
type RuntimeRequest = (path: string, method?: string, body?: string) => Promise<RuntimeResponse>

const workspaceRoot = '/survey-workspace'
const project = { id: 'project-a', name: 'Project A', monitoringType: 'survey', unit: 'm', revision: 1, reportPeriod: {} }
const stalePlan = {
  id: 'plan-stale', projectId: project.id, contextHash: 'context-old', revision: 2, goal: 'Adjust the current control network', status: 'stale',
  steps: [{ id: 'adjust', title: 'Run adjustment', tool: 'control_network', risk: 'write', approval: 'pending' }]
}
const refreshedPlan = {
  ...stalePlan, id: 'plan-current', contextHash: 'context-current', revision: 1, status: 'awaiting_approval',
  steps: stalePlan.steps.map(step => ({ ...step, parameters: { networkId: 'net-1', expectedRevision: 2 }, parameterBindings: [], expectedOutputs: ['adjustment-run'], reversibility: 'append-only' })),
  approval: { token: 'approval-token-current', stepIds: ['adjust'], expiresAt: '2026-09-09T00:00:00.000Z' }
}

let container: HTMLDivElement
let root: Root
let runtimeRequest: Mock<RuntimeRequest>
let refreshThreads: Mock<() => Promise<void>>
let selectThread: Mock<(id: string) => Promise<void>>
let onRefresh: Mock<() => void>

function response(status: number, body: unknown): RuntimeResponse {
  return { ok: status >= 200 && status < 300, status, body: JSON.stringify(body) }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((done) => { resolve = done }), resolve }
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(EngineeringAiCommandCenter, {
      workspaceRoot, runtimeReady: true, project, dataset: null, analysis: null,
      onCreateProject: () => undefined, onImportData: () => undefined, onSurveyFiles: () => undefined, onOpenTab: () => undefined, onRefresh
    }))
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  await i18n.changeLanguage('en')
  runtimeRequest = vi.fn<RuntimeRequest>()
  refreshThreads = vi.fn<() => Promise<void>>(async () => undefined)
  selectThread = vi.fn<(id: string) => Promise<void>>(async () => undefined)
  onRefresh = vi.fn<() => void>()
  Object.assign(window, { workwise: { runtimeRequest, getTaskRun: vi.fn(async () => null) } })
  useChatStore.setState({
    route: 'engineering', workspaceRoot, runtimeConnection: 'ready', activeThreadId: 'thread-a',
    threads: [{ id: 'thread-a', domain: 'engineering', projectId: project.id, workspace: workspaceRoot }] as never,
    blocks: [], liveReasoning: '', liveAssistant: '', busy: false, error: null, lastSeq: 0, composerModel: 'test-model',
    refreshThreads, selectThread, probeRuntime: vi.fn(async () => undefined), openSettings: vi.fn()
  })
  useEngineeringConversationDrafts.setState({ drafts: {} })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Engineering AI session recovery states', () => {
  it('displays reviewed parameters, bindings, outputs and reversibility before enabling execution', async () => {
    const plan = { ...refreshedPlan, steps: refreshedPlan.steps.map(step => ({ ...step, parameterBindings: [{ parameter: 'expectedRevision', stepId: 'validate', output: 'network.revision' }] })) }
    runtimeRequest.mockImplementation(async path => response(200, path.startsWith('/v1/engineering/ai/plans?') ? { plan, approval: plan.approval } : { cards: [] }))
    await render(); await settle()
    expect(container.textContent).toContain('net-1')
    expect(container.textContent).toContain('expectedRevision ← validate.network.revision')
    expect(container.textContent).toContain('control_network')
    expect(container.querySelector('[data-testid="engineering-plan-step-review"]')?.textContent).toContain('Expected outputs')
    const start = [...container.querySelectorAll('button')].find(button => button.textContent?.includes(i18n.t('engineeringApproveAndStart')))
    expect(start?.disabled).toBe(true)
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click())
    expect(start?.disabled).toBe(false)
  })

  it('keeps legacy review information readable without an execute button', async () => {
    runtimeRequest.mockImplementation(async path => response(200, path.startsWith('/v1/engineering/ai/plans?') ? { plan: { ...stalePlan, status: 'approved' } } : { cards: [] }))
    await render(); await settle()
    expect(container.textContent).toContain(stalePlan.goal)
    expect([...container.querySelectorAll('button')].some(button => button.textContent?.includes(i18n.t('engineeringApproveAndStart')))).toBe(false)
  })

  it('shows loading, error, and partial states and retries both resources without clearing the draft', async () => {
    const initialPlan = deferred<RuntimeResponse>()
    const initialEvidence = deferred<RuntimeResponse>()
    const planResponses = [initialPlan.promise, Promise.resolve(response(200, { plan: refreshedPlan, approval: refreshedPlan.approval })), Promise.resolve(response(200, { plan: refreshedPlan, approval: refreshedPlan.approval }))]
    const evidenceResponses = [initialEvidence.promise, Promise.resolve(response(503, { message: 'Evidence index unavailable' })), Promise.resolve(response(200, { cards: [{ id: 'evidence-1', kind: 'result', title: 'Adjusted result', summary: 'Verified' }] }))]
    let planReads = 0
    let evidenceReads = 0
    runtimeRequest.mockImplementation((path: string) => path.startsWith('/v1/engineering/ai/plans?') ? planResponses[planReads++] : evidenceResponses[evidenceReads++])
    const scope = JSON.stringify([workspaceRoot, project.id])
    useEngineeringConversationDrafts.getState().update(scope, (draft) => ({
      ...draft,
      input: 'Keep this question',
      attachments: [{ id: 'attachment-1', name: 'observations.in2', mimeType: 'text/plain', byteSize: 12, state: 'ready' }] as never
    }))

    await render()
    expect(container.querySelector('[data-testid="engineering-session-read-state"]')?.getAttribute('data-state')).toBe('loading')

    await act(async () => {
      initialPlan.resolve(response(503, { message: 'Plan store unavailable' }))
      initialEvidence.resolve(response(503, { message: 'Evidence index unavailable' }))
    })
    await settle()
    expect(container.querySelector('[data-testid="engineering-session-read-state"]')?.getAttribute('data-state')).toBe('error')
    expect(container.textContent).toContain('Plan store unavailable')

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="engineering-session-retry"]')?.click())
    await settle()
    expect(container.querySelector('[data-testid="engineering-session-read-state"]')?.getAttribute('data-state')).toBe('partial')
    expect(container.textContent).toContain('Evidence index unavailable')

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="engineering-session-retry"]')?.click())
    await settle()
    expect(container.querySelector('[data-testid="engineering-session-read-state"]')).toBeNull()
    expect(container.textContent).toContain('Adjusted result')
    expect(planReads).toBe(3)
    expect(evidenceReads).toBe(3)
    expect(useEngineeringConversationDrafts.getState().drafts[scope]).toMatchObject({
      input: 'Keep this question', attachments: [expect.objectContaining({ id: 'attachment-1', state: 'ready' })]
    })
  })

  it('creates a new plan from current context when the stored plan is stale and preserves session input', async () => {
    runtimeRequest.mockImplementation((path: string, method?: string, body?: string) => {
      if (path.startsWith('/v1/engineering/ai/plans?')) return Promise.resolve(response(200, { plan: stalePlan }))
      if (path.startsWith('/v1/engineering/ai/evidence/')) return Promise.resolve(response(200, { cards: [] }))
      if (path === '/v1/engineering/ai/plans' && method === 'POST') {
        const request = JSON.parse(body ?? '{}') as Record<string, unknown>
        expect(request).toMatchObject({ threadId: 'thread-a', projectId: project.id, goal: stalePlan.goal, replanOf: stalePlan.id })
        expect(request.contextHash).toBeUndefined()
        expect(request.idempotencyKey).toMatch(/^engineering-replan-plan-stale-/)
        return Promise.resolve(response(201, { plan: refreshedPlan, approval: refreshedPlan.approval }))
      }
      throw new Error(`unexpected request: ${method ?? 'GET'} ${path}`)
    })
    const scope = JSON.stringify([workspaceRoot, project.id])
    useEngineeringConversationDrafts.getState().update(scope, (draft) => ({ ...draft, input: 'Question in progress' }))

    await render()
    await settle()
    const replan = container.querySelector<HTMLButtonElement>('[data-testid="engineering-replan"]')
    expect(replan).not.toBeNull()

    await act(async () => replan?.click())
    await settle()
    expect(container.querySelector('[data-testid="engineering-replan"]')).toBeNull()
    expect(container.textContent).toContain('Awaiting approval')
    expect(refreshThreads).toHaveBeenCalledOnce()
    expect(selectThread).toHaveBeenCalledWith('thread-a')
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(useEngineeringConversationDrafts.getState().drafts[scope]?.input).toBe('Question in progress')
  })
})
