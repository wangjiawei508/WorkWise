// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EngineeringWorkspaceView } from './EngineeringWorkspaceView'
import i18n from '../../i18n'
import { dispatchEngineeringProjectCreate, dispatchEngineeringProjectOpen } from './engineering-project-navigation'
import { useEngineeringConversationDrafts } from './engineering-conversation-drafts'

const { request, ensureThread } = vi.hoisted(() => ({ request: vi.fn(), ensureThread: vi.fn() }))
vi.mock('../../agent/runtime-client', () => ({ rendererRuntimeClient: { runtimeRequest: request } }))
vi.mock('../../store/chat-store', () => ({ useChatStore: (select: (s: unknown) => unknown) => select({ ensureEngineeringThread: ensureThread }) }))
vi.mock('./EngineeringAiCommandCenter', () => ({ EngineeringAiCommandCenter: ({ onRefresh }: { onRefresh: () => void }) => createElement('button', { onClick: onRefresh }, 'Refresh confirmed project') }))
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
  it('shows saved project datum without a network, but never promotes unsaved form edits', async () => {
    let savedProject = { ...project, taskContext: { coordinateSystem: '', verticalDatum: '' } }
    request.mockImplementation(async (path: string, method = 'GET', payload?: string) => {
      let body: unknown
      if (path === `/v1/engineering/projects/${project.id}` && method === 'PATCH') {
        savedProject = { ...savedProject, ...JSON.parse(payload!), revision: 3 }
        body = { project: savedProject }
      } else if (path === '/v1/engineering/projects') body = { projects: [savedProject] }
      else if (path.endsWith('/overview')) body = { project: savedProject, datasets: [], analyses: [], runs: [], manifests: [] }
      else if (path.includes('/survey/networks?')) body = { networks: [] }
      else if (path.includes('/adjustments?')) body = { adjustments: [] }
      else throw new Error(`Unexpected request: ${path}`)
      return { ok: true, status: 200, body: JSON.stringify(body) }
    })
    await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: true })))
    await settle()
    await act(async () => button('Project setup').click())
    const datumText = () => container.querySelector('[data-testid="engineering-summary-strip"]')!.textContent!
    for (const [field, value] of [['coordinateSystem', 'LOCAL-TEST-CRS'], ['verticalDatum', 'NO-HEIGHT']] as const) {
      const input = [...container.querySelectorAll('label')].find(label => label.textContent === i18n.t(`engineeringTaskContext.${field}`))!.querySelector('input')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(datumText()).not.toContain(value)
    }
    await act(async () => button('Save configuration').click())
    expect(savedProject.taskContext).toEqual({ coordinateSystem: 'LOCAL-TEST-CRS', verticalDatum: 'NO-HEIGHT' })
    expect(datumText()).toContain('NO-HEIGHT · LOCAL-TEST-CRS')
    await act(async () => button('Refresh confirmed project').click())
    await settle()
    expect(datumText()).toContain('NO-HEIGHT · LOCAL-TEST-CRS')
  })

  it.each([
    { coordinateSystem: 'NETWORK-CRS', verticalDatum: 'NETWORK-HEIGHT', expected: 'NETWORK-HEIGHT · NETWORK-CRS' },
    { coordinateSystem: '待确认', verticalDatum: '', expected: undefined }
  ])('keeps active network datum authoritative over saved project context: $coordinateSystem', async datum => {
    const configured = { ...project, taskContext: { coordinateSystem: 'PROJECT-CRS', verticalDatum: 'PROJECT-HEIGHT' } }
    request.mockImplementation(async (path: string) => ({ ok: true, status: 200, body: JSON.stringify(
      path === '/v1/engineering/projects' ? { projects: [configured] }
        : path.endsWith('/overview') ? { project: configured, datasets: [], analyses: [], runs: [], manifests: [] }
          : path.includes('/survey/networks?') ? { networks: [{ ...network, coordinateSystem: datum.coordinateSystem, verticalDatum: datum.verticalDatum }] }
            : { adjustments: [] }
    ) }))
    await renderDelivery()
    const summary = container.querySelector('[data-testid="engineering-summary-strip"]')!.textContent!
    expect(summary).toContain(datum.expected ?? `${i18n.t('surveyPendingConfirmation')} · ${i18n.t('surveyPendingConfirmation')}`)
    expect(summary).not.toContain('PROJECT-CRS')
    expect(summary).not.toContain('PROJECT-HEIGHT')
  })

  it('exposes named data selection buttons and switches the reviewed dataset without mutating it', async () => {
    datasets = ['first.csv', 'second.csv'].map((name, index) => ({
      id: `dataset-${index}`, sourceFileName: name, sourceFileHash: 'b'.repeat(64),
      fieldMapping: { point: `point-column-${index}` }, unknownColumns: [], rowCount: 1,
      columnCount: 1, observationCount: 1, timeRange: {}, status: 'imported',
      revision: 1, findings: [], updatedAt: project.updatedAt
    }))
    await renderDelivery()
    const select = container.querySelector<HTMLSelectElement>('#engineering-view-select')!
    await act(async () => { select.value = 'import'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => button('Data assets').click())
    const second = button('second.csv')
    expect(second.tabIndex).toBe(0)
    second.focus()
    expect(document.activeElement).toBe(second)
    request.mockClear()
    await act(async () => second.click())
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(button('first.csv').getAttribute('aria-pressed')).toBe('false')
    expect(container.textContent).toContain('point-column-1')
    expect(request.mock.calls.filter(([, method]) => method && method !== 'GET')).toHaveLength(0)
  })

  it('consumes one sidebar create action once across selection, locale and reconnect changes', async () => {
    const projects = [project]
    let creates = 0
    request.mockImplementation(async (path: string, method = 'GET') => {
      let body: unknown
      if (path === '/v1/engineering/projects' && method === 'POST') {
        creates += 1
        // Bound the broken effect loop so the pre-fix regression terminates.
        if (creates > 2) throw new Error('unexpected repeated creation')
        const created = { ...project, id: `created-${creates}` }
        projects.push(created)
        body = { project: created }
      } else if (path === '/v1/engineering/projects') body = { projects }
      else if (path.endsWith('/overview')) body = { project: projects.find(p => path.includes(`/${p.id}/`)), datasets: [], analyses: [], runs: [], manifests: [] }
      else if (path.includes('/survey/networks?')) body = { networks: [] }
      else body = { adjustments: [] }
      return { ok: true, status: 200, body: JSON.stringify(body) }
    })
    await renderDelivery()
    await act(async () => dispatchEngineeringProjectCreate())
    await settle()
    expect(creates).toBe(1)
    await act(async () => dispatchEngineeringProjectOpen(project.id))
    await act(async () => i18n.changeLanguage('zh'))
    await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: false })))
    await act(async () => dispatchEngineeringProjectCreate())
    await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: true })))
    await settle()
    expect(creates).toBe(1)
    await act(async () => dispatchEngineeringProjectCreate())
    await settle()
    expect(creates).toBe(2)
  })

  it('coalesces duplicate create actions while the original request is in flight', async () => {
    await renderDelivery()
    const original = request.getMockImplementation()!
    let finish!: (value: unknown) => void
    const pending = new Promise(resolve => { finish = resolve })
    request.mockImplementation((path: string, method?: string, body?: string) =>
      path === '/v1/engineering/projects' && method === 'POST' ? pending : original(path, method, body))
    await act(async () => { dispatchEngineeringProjectCreate(); dispatchEngineeringProjectCreate() })
    await settle()
    await act(async () => dispatchEngineeringProjectCreate())
    expect(request.mock.calls.filter(([path, method]) => path === '/v1/engineering/projects' && method === 'POST')).toHaveLength(1)
    await act(async () => finish({ ok: true, status: 200, body: JSON.stringify({ project }) }))
  })

  it('releases a failed creation for explicit retry without retrying on its own', async () => {
    await renderDelivery()
    const original = request.getMockImplementation()!
    let creates = 0
    request.mockImplementation((path: string, method?: string, body?: string) => {
      if (path === '/v1/engineering/projects' && method === 'POST') {
        creates += 1
        return Promise.resolve(creates === 1
          ? { ok: false, status: 503, body: 'creation unavailable' }
          : { ok: true, status: 200, body: JSON.stringify({ project }) })
      }
      return original(path, method, body)
    })
    await act(async () => dispatchEngineeringProjectCreate())
    await settle()
    expect(creates).toBe(1)
    expect(container.textContent).toContain('creation unavailable')
    await act(async () => dispatchEngineeringProjectCreate())
    await settle()
    expect(creates).toBe(2)
  })

  it('preserves the summary, selected result and preview when reopening the current project thread', async () => {
    await renderDelivery()
    await act(async () => button('Generate preview').click())
    const summary = container.querySelector('[data-testid="engineering-summary-strip"]')!.textContent
    expect(summary).toContain('survey.in2')
    await act(async () => dispatchEngineeringProjectOpen(project.id))
    await settle()
    expect(container.querySelector('[data-testid="engineering-summary-strip"]')!.textContent).toBe(summary)
    expect(container.textContent).toContain(file.path)
    expect(button('Generate preview').disabled).toBe(false)
  })

  it('uses language-independent calendar input and blocks invalid or reversed report dates before saving', async () => {
    await act(async () => root.render(createElement(EngineeringWorkspaceView, { workspaceRoot: '/test', runtimeReady: true })))
    await settle()
    await act(async () => button('Project setup').click())
    const start = [...container.querySelectorAll('label')].find(label => label.textContent === 'Report start date')!.querySelector('input')!
    const end = [...container.querySelectorAll('label')].find(label => label.textContent === 'Report end date')!.querySelector('input')!
    expect(start.type).toBe('text')
    expect(start.placeholder).toBe('YYYY-MM-DD')
    const set = async (input: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    await set(start, '2026-02-29')
    request.mockClear()
    await act(async () => button('Save configuration').click())
    expect(request).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Enter valid dates as YYYY-MM-DD')
    await set(start, '2026-09-20'); await set(end, '2026-09-19')
    await act(async () => button('Save configuration').click())
    expect(request).not.toHaveBeenCalled()
    await i18n.changeLanguage('zh')
    await settle()
    expect(start.placeholder).toContain('年-月-日')
  })
  it('refreshes the selector and sidebar after a confirmed project change without changing the selected task', async () => {
    await renderDelivery()
    const renamed = { ...project, name: 'Confirmed name', revision: 3 }
    request.mockImplementation(async (path: string) => ({ ok: true, status: 200, body: JSON.stringify(
      path === '/v1/engineering/projects' ? { projects: [renamed] }
        : path.endsWith('/overview') ? { project: renamed, datasets: [], analyses: [], runs: [], manifests: [] }
          : path.includes('/survey/networks?') ? { networks: [network] } : { adjustments }
    ) }))
    const sidebarRefresh = vi.fn()
    window.addEventListener('workwise:engineering-projects-changed', sidebarRefresh)
    try {
      await act(async () => button('Refresh confirmed project').click())
      await settle()
      const selectors = [...container.querySelectorAll('select')]
      expect(selectors.some(select => select.value === 'job' && select.selectedOptions[0]?.textContent === 'Confirmed name')).toBe(true)
      expect(sidebarRefresh).toHaveBeenCalledOnce()
      expect(container.textContent).toContain('Confirmed name')
    } finally { window.removeEventListener('workwise:engineering-projects-changed', sidebarRefresh) }
  })
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
    expect(container.textContent).not.toMatch(/archived/i)
    expect(container.textContent).toContain('1 review list(s)')
    expect(container.textContent).toContain('Professional review, approval and signing remain pending')
    expect(container.textContent).not.toContain('All gates are satisfied')
    expect(container.textContent).toContain('survey.in2')
    expect(container.textContent).not.toContain('Time-series data')
    expect(container.textContent).not.toContain('Trend and threshold analysis')
    const adjustmentStage = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.startsWith('2Network and adjustment'))!
    expect(adjustmentStage).toBeDefined()
    await act(async () => adjustmentStage.click())
    expect(container.querySelector<HTMLSelectElement>('#engineering-view-select')!.value).toBe('adjustment')
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
    await act(async () => button('Delivery overview').click())
    expect(container.textContent).not.toContain('Completed deterministic Survey results')
    expect(container.textContent).not.toContain('All gates are satisfied')
    if (value.sourceEligibility?.eligible === false || value.run.status === 'failed' || value.result.validation === 'invalid') {
      expect(container.querySelector('[data-testid="engineering-summary-strip"]')?.textContent).toContain('Blocked')
    }
  })

  it('still requires monitoring analysis when a dataset is included alongside Survey results', async () => {
    datasets = [{ id: 'dataset', sourceFileName: 'monitor.csv', observationCount: 1, findings: [], status: 'validated' }]
    await renderDelivery()
    await act(async () => button('Review and archive').click())
    expect(button('Generate review list').disabled).toBe(true)
    expect(container.textContent).toContain('Run deterministic analysis or an eligible survey adjustment first')
  })
})
