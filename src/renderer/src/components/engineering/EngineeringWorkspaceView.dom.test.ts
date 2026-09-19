// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EngineeringWorkspaceView } from './EngineeringWorkspaceView'
import i18n from '../../i18n'
import { useEngineeringConversationDrafts } from './engineering-conversation-drafts'

const { request, ensureThread } = vi.hoisted(() => ({ request: vi.fn(), ensureThread: vi.fn() }))
vi.mock('../../agent/runtime-client', () => ({ rendererRuntimeClient: { runtimeRequest: request } }))
vi.mock('../../store/chat-store', () => ({ useChatStore: (select: (s: unknown) => unknown) => select({ ensureEngineeringThread: ensureThread }) }))
vi.mock('./EngineeringAiCommandCenter', () => ({ EngineeringAiCommandCenter: () => null }))
vi.mock('./SurveyAdjustmentPanel', () => ({ SurveyAdjustmentPanel: () => null }))
vi.mock('./EngineeringSkillsPanel', () => ({ EngineeringSkillsPanel: () => null }))
const project = { id: 'job', name: 'Test control network', taskType: 'control-network', monitoringType: 'control-network', unit: 'm', signConvention: 'positive', thresholds: {}, reportPeriod: {}, workspace: '/test', revision: 2, updatedAt: '2026-09-19T00:00:00Z' }
const network = { id: 'net', revision: 2, networkType: 'plane-control', qualityStatus: 'validated', sourceFile: { name: 'survey.in2', disposition: 'adjustment-ready' } }
const adjustment = { run: { id: 'adjustment', networkId: 'net', status: 'completed' }, result: { validation: 'valid' }, sourceEligibility: { eligible: true } }
let adjustments: unknown[]
let datasets: unknown[]
let analyses: unknown[]
let manifests: unknown[]
let container: HTMLDivElement
let root: Root
const file = { path: 'new-preview/report.pdf', mediaType: 'application/pdf', sha256: 'a'.repeat(64), sizeBytes: 100 }

async function settle(): Promise<void> { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function renderDelivery(): Promise<void> {
  await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: true })))
  await settle()
  const select = container.querySelector<HTMLSelectElement>('#engineering-view-select')!
  await act(async () => { select.value = 'delivery'; select.dispatchEvent(new Event('change', { bubbles: true })) })
}
function button(text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find(item => item.textContent === text)
  expect(result, text).toBeDefined()
  return result!
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const storage = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } })

  await i18n.changeLanguage('en')
  adjustments = [adjustment]; datasets = []; analyses = []; manifests = []
  useEngineeringConversationDrafts.setState({ drafts: {} })
  request.mockReset()
  request.mockImplementation(async (path: string) => {
    let body: unknown
    if (path === '/v1/engineering/projects') body = { projects: [project] }
    else if (path.endsWith('/overview')) body = { project, datasets, analyses, runs: [], manifests }
    else if (path.includes('/survey/networks?')) body = { networks: [network] }
    else if (path.includes('/adjustments?')) body = { adjustments }
    else if (path.endsWith('/reports/preview')) body = { run: { id: 'preview' }, files: [file], charts: [], citations: [] }
    else throw new Error(`Unexpected request: ${path}`)
    return { ok: true, status: 200, body: JSON.stringify(body) }
  })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('Survey delivery without a monitoring dataset', () => {
  it('restores an admitted result and displays generated preview files and truthful review checks', async () => {
    await renderDelivery()
    expect(button('Generate preview').disabled).toBe(false)
    await act(async () => button('Generate preview').click())
    expect(container.textContent).toContain(file.path)
    expect(container.textContent).not.toContain('Select delivery inputs')
    const payload = request.mock.calls.find(([path]) => path.endsWith('/reports/preview'))![2]
    expect(JSON.parse(payload)).toMatchObject({ adjustmentIds: ['adjustment'] })
    await act(async () => button('Review and archive').click())
    expect(container.textContent).toContain('1 eligible adjustment(s)')
    expect(container.textContent).toContain('Completed deterministic Survey results')
    expect(button('Generate review list').disabled).toBe(false)
    expect(container.textContent).not.toContain('Run trend and threshold analysis first')
  })

  it('keeps draft evidence readable and prevents new outputs while offline', async () => {
    await renderDelivery()
    await act(async () => button('Generate preview').click())
    await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: false })))
    request.mockClear()
    expect(container.textContent).toContain(file.path)
    expect(button('Generate preview').disabled).toBe(true)
    await act(async () => button('Generate preview').click())
    await act(async () => button('Review and archive').click())
    expect(button('Generate review list').disabled).toBe(true)
    await act(async () => button('Generate review list').click())
    expect(request).not.toHaveBeenCalled()
  })

  it('asks about an exact output or historical manifest without assigning the active network to it', async () => {
    manifests = [{ id: 'historical-manifest', runId: 'historical-run', reviewStatus: 'draft', outputs: [file], citations: [], validation: { valid: true, errors: [], warnings: [] } }]
    await renderDelivery()
    await act(async () => button('Deliverables').click())
    await act(async () => button('Generate preview').click())
    request.mockClear()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Ask Survey AI about new-preview/report.pdf"]')!.click())
    const scope = JSON.stringify(['/test', 'job'])
    expect(useEngineeringConversationDrafts.getState().drafts[scope]?.evidenceContext).toMatchObject({ projectId: 'job', projectRevision: 2, runId: 'preview', outputSha256: file.sha256 })
    expect(useEngineeringConversationDrafts.getState().drafts[scope]?.evidenceContext?.manifestId).toBeUndefined()
    await act(async () => button('Review and archive').click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Ask Survey AI about historical-manifest"]')!.click())
    expect(useEngineeringConversationDrafts.getState().drafts[scope]?.evidenceContext).toMatchObject({ manifestId: 'historical-manifest', runId: 'historical-run', reviewStatus: 'draft' })
    expect(useEngineeringConversationDrafts.getState().drafts[scope]?.evidenceContext?.networkId).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
    await act(async () => button('Delivery overview').click())
    expect(container.textContent).not.toContain('Archived')
  })

  it('restores the last stage after leaving and remounting the task', async () => {
    await renderDelivery()
    await act(async () => button('Review and archive').click())
    await act(async () => root.render(null))
    await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: true })))
    await settle()
    expect(button('Generate review list').disabled).toBe(false)
    expect(container.querySelector<HTMLSelectElement>('#engineering-view-select')!.value).toBe('delivery')
  })

  it.each([
    { ...adjustment, sourceEligibility: undefined },
    { ...adjustment, sourceEligibility: { eligible: false } },
    { ...adjustment, run: { ...adjustment.run, status: 'failed' } },
    { ...adjustment, result: { validation: 'invalid' } }
  ])('keeps a missing, revoked or invalid result out of new delivery', async value => {
    adjustments = [value]
    await renderDelivery()
    expect(button('Generate preview').disabled).toBe(true)
    await act(async () => button('Review and archive').click())
    expect(button('Generate review list').disabled).toBe(true)
  })

  it('still requires monitoring analysis when a dataset is included alongside Survey results', async () => {
    datasets = [{ id: 'dataset', sourceFileName: 'monitor.csv', observationCount: 1, findings: [], status: 'validated' }]
    await renderDelivery()
    await act(async () => button('Review and archive').click())
    expect(button('Generate review list').disabled).toBe(true)
    expect(container.textContent).toContain('Run deterministic analysis or an eligible survey adjustment first')
  })
})
