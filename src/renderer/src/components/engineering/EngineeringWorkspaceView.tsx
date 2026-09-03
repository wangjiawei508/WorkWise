import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileOutput,
  FileSpreadsheet,
  FolderKanban,
  HardHat,
  Info,
  LineChart,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle
} from 'lucide-react'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { useChatStore } from '../../store/chat-store'
import { EngineeringAiCommandCenter } from './EngineeringAiCommandCenter'
import { SurveyAdjustmentPanel } from './SurveyAdjustmentPanel'
import { EngineeringSkillsPanel } from './EngineeringSkillsPanel'
import {
  consumeRequestedEngineeringProject,
  setActiveEngineeringProject
} from './engineering-project-navigation'

type Project = {
  id: string
  name: string
  monitoringType: string
  unit: string
  signConvention: string
  thresholds: Record<string, number>
  reportPeriod: { start?: string; end?: string }
  workspace: string
  revision: number
  updatedAt: string
}

type Finding = {
  id: string
  code: string
  severity: 'blocking' | 'warning' | 'info'
  message: string
  suggestion: string
  status: 'open' | 'resolved' | 'accepted'
  row?: number
}

type Dataset = {
  id: string
  sourceFileName: string
  sourceFileHash: string
  fieldMapping: Record<string, string | undefined>
  unknownColumns: string[]
  rowCount: number
  columnCount: number
  observationCount: number
  timeRange: { start?: string; end?: string }
  status: 'imported' | 'validated' | 'failed' | 'cancelled'
  revision: number
  findings: Finding[]
  updatedAt: string
}

type AnalysisResult = {
  monitoringItem: string
  point: string
  currentValue?: number
  previousValue?: number
  cumulativeChange?: number
  changeRate?: number
  trend: 'rising' | 'falling' | 'stable' | 'unknown'
  anomaly: boolean
  thresholdStatus: 'normal' | 'warning' | 'alarm' | 'control' | 'unresolved'
}

type Analysis = {
  id: string
  datasetId: string
  inputHash: string
  algorithmVersion: string
  results: AnalysisResult[]
  createdAt: string
}

type Output = { path: string; mediaType: string; sha256: string; sizeBytes: number }
type Chart = { id: string; chartType: string; relativePath: string; sha256: string; validation: string }
type Citation = { id: string; sourceType: 'attachment' | 'knowledge-base' | 'standard' | 'other'; source: string; locator?: string }
type Run = { id: string; datasetId: string; analysisId?: string; status: string; revision: number; createdAt: string; updatedAt: string; error?: string }
type Manifest = { id: string; runId: string; reviewStatus: string; outputs: Output[]; citations: Citation[]; adjustments?: Array<{ id: string; runId: string; networkId: string; validation: string }>; validation: { valid: boolean; errors: string[]; warnings: string[] }; finalizedAt?: string }
type ReportPreview = { run: Run; files: Output[]; charts: Chart[]; citations: Citation[]; adjustments?: Array<{ id: string; runId: string; networkId: string; validation: string; displacements?: Array<{ pointId: string; dX?: number; dY?: number; dH?: number; magnitude: number }> }> }
type Overview = { project: Project; datasets: Dataset[]; analyses: Analysis[]; runs: Run[]; manifests: Manifest[] }
type TabId = 'ai-command' | 'dashboard' | 'project' | 'data' | 'quality' | 'survey' | 'analysis' | 'deliverables' | 'review' | 'skills'
type Notice = { tone: 'success' | 'warning' | 'error' | 'info'; message: string }
type ProjectDraft = Pick<Project, 'name' | 'monitoringType' | 'unit' | 'signConvention' | 'reportPeriod'> & { thresholdsText: string }

type TabDefinition = { id: TabId; label: string; shortLabel: string; icon: typeof FolderKanban; group: 'agent' | 'compute' | 'delivery' }
const TABS: ReadonlyArray<TabDefinition> = [
  { id: 'ai-command', label: 'AI 指挥台', shortLabel: 'AI', icon: Sparkles, group: 'agent' },
  { id: 'dashboard', label: '交付总览', shortLabel: '总览', icon: Activity, group: 'agent' },
  { id: 'project', label: '项目配置', shortLabel: '项目', icon: FolderKanban, group: 'compute' },
  { id: 'data', label: '数据资产', shortLabel: '数据', icon: Database, group: 'compute' },
  { id: 'quality', label: '质量校核', shortLabel: '校核', icon: ShieldCheck, group: 'compute' },
  { id: 'survey', label: '测量平差', shortLabel: '平差', icon: Calculator, group: 'compute' },
  { id: 'analysis', label: '趋势分析', shortLabel: '分析', icon: LineChart, group: 'compute' },
  { id: 'deliverables', label: '成果中心', shortLabel: '成果', icon: FileOutput, group: 'delivery' },
  { id: 'review', label: '审查归档', shortLabel: '审查', icon: ClipboardCheck, group: 'delivery' },
  { id: 'skills', label: '技能与规范', shortLabel: '技能', icon: BookOpen, group: 'delivery' }
]
const TAB_GROUPS: ReadonlyArray<{ id: TabDefinition['group']; label: string }> = [
  { id: 'agent', label: 'AI 工作流' },
  { id: 'compute', label: '数据与计算' },
  { id: 'delivery', label: '交付与审查' }
]

const findingTone: Record<Finding['severity'], string> = {
  blocking: 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200'
}

const thresholdTone: Record<AnalysisResult['thresholdStatus'], string> = {
  normal: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  alarm: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  control: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  unresolved: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'
}

async function runtimeRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await rendererRuntimeClient.runtimeRequest(path, method, body === undefined ? undefined : JSON.stringify(body))
  if (!response.ok) {
    let detail = response.body
    try {
      const parsed = JSON.parse(response.body) as { message?: string }
      detail = parsed.message ?? detail
    } catch {
      /* Keep the Runtime response when it is not JSON. */
    }
    throw new Error(detail || `Runtime request failed (${response.status})`)
  }
  return JSON.parse(response.body) as T
}

function projectToDraft(project: Project): ProjectDraft {
  return {
    name: project.name,
    monitoringType: project.monitoringType,
    unit: project.unit,
    signConvention: project.signConvention,
    reportPeriod: project.reportPeriod,
    thresholdsText: Object.entries(project.thresholds).map(([name, value]) => `${name} = ${value}`).join('\n')
  }
}

function parseThresholds(value: string): Record<string, number> {
  const thresholds: Record<string, number> = {}
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) throw new Error(`阈值格式错误：${trimmed}。请使用“监测项 = 数值”。`)
    const name = trimmed.slice(0, separator).trim()
    const numberValue = Number(trimmed.slice(separator + 1).trim())
    if (!name || !Number.isFinite(numberValue)) throw new Error(`阈值格式错误：${trimmed}。`)
    thresholds[name] = numberValue
  }
  return thresholds
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '—'
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('zh-CN', { hour12: false })
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取导入文件'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new Error('无法编码导入文件'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
}

function statusLabel(status: string): string {
  return ({ normal: '正常', warning: '提示', alarm: '报警', control: '控制', unresolved: '待确认', rising: '上升', falling: '下降', stable: '稳定', unknown: '待判定', imported: '已导入', validated: '已校核', completed: '完成', cancelled: '已取消', approved: '已批准', archived: '已归档' } as Record<string, string>)[status] ?? status
}

function PanelHeading({ title, description, action }: { title: string; description: string; action?: ReactElement }): ReactElement {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ds-border-muted px-5 py-4">
    <div className="min-w-0"><h2 className="text-[16px] font-semibold text-ds-ink">{title}</h2><p className="mt-1 text-[12.5px] leading-5 text-ds-muted">{description}</p></div>
    {action}
  </div>
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactElement }): ReactElement {
  return <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
    <HardHat className="h-9 w-9 text-ds-faint" strokeWidth={1.4} />
    <h3 className="mt-4 text-[15px] font-semibold text-ds-ink">{title}</h3>
    <p className="mt-1 max-w-md text-[12.5px] leading-5 text-ds-muted">{detail}</p>
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
}

function Metric({ label, value, detail, tone = 'neutral' }: { label: string; value: string | number; detail: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }): ReactElement {
  const toneClass = tone === 'success' ? 'text-green-700 dark:text-green-300' : tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : tone === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-ds-ink'
  return <div className="border border-ds-border-muted bg-ds-card px-3 py-3">
    <p className="text-[11px] font-medium text-ds-muted">{label}</p>
    <p className={`mt-1 tabular-nums text-[24px] font-semibold leading-7 ${toneClass}`}>{value}</p>
    <p className="mt-1 truncate text-[11px] text-ds-faint">{detail}</p>
  </div>
}

function DeliveryStage({ index, icon: Icon, title, detail, state, attention = false, onOpen }: {
  index: number
  icon: typeof FolderKanban
  title: string
  detail: string
  state: string
  attention?: boolean
  onOpen: () => void
}): ReactElement {
  return <button type="button" onClick={onOpen} className="group grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-ds-border-muted px-4 py-3 text-left last:border-b-0 hover:bg-ds-hover">
    <span className={`flex h-7 w-7 items-center justify-center rounded text-[11px] font-semibold ${attention ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-ds-subtle text-ds-muted'}`}>{index}</span>
    <span className="min-w-0"><span className="flex items-center gap-2 text-[12.5px] font-medium text-ds-ink"><Icon className="h-3.5 w-3.5 text-accent" strokeWidth={1.7} />{title}</span><span className="mt-1 block truncate text-[11px] text-ds-muted">{detail}</span></span>
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${attention ? 'text-amber-800 dark:text-amber-200' : 'text-ds-muted'}`}>{state}<ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
  </button>
}

export function EngineeringWorkspaceView({ workspaceRoot, runtimeReady, leftSidebarCollapsed, onToggleLeftSidebar }: { workspaceRoot: string; runtimeReady: boolean; leftSidebarCollapsed?: boolean; onToggleLeftSidebar?: () => void }): ReactElement {
  const ensureEngineeringThread = useChatStore((state) => state.ensureEngineeringThread)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [selectedAnalysisId, setSelectedAnalysisId] = useState('')
  const [surveyAdjustmentIds, setSurveyAdjustmentIds] = useState<string[]>([])
  const [tab, setTab] = useState<TabId>('ai-command')
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null)
  const [citations, setCitations] = useState<Citation[]>([])
  const [citationSource, setCitationSource] = useState('')
  const [citationType, setCitationType] = useState<Citation['sourceType']>('standard')
  const [citationLocator, setCitationLocator] = useState('')
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [chart, setChart] = useState<Chart | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [createRequestToken, setCreateRequestToken] = useState(0)

  const selectProject = useCallback((projectId: string): void => {
    setSelectedProjectId(projectId)
    setSurveyAdjustmentIds([])
    setPreview(null)
    setChart(null)
  }, [])

  useEffect(() => {
    if (!selectedProjectId) return
    setActiveEngineeringProject(selectedProjectId)
    window.dispatchEvent(new CustomEvent('workwise:engineering-active-project-changed'))
  }, [selectedProjectId])

  useEffect(() => {
    setSelectedProjectId('')
    setOverview(null)
    setProjectDraft(null)
    setSelectedDatasetId('')
    setSelectedAnalysisId('')
    setSurveyAdjustmentIds([])
    setPreview(null)
    setChart(null)
  }, [workspaceRoot])

  const loadOverview = useCallback(async (projectId: string): Promise<void> => {
    if (!runtimeReady || !projectId) return
    try {
      const next = await runtimeRequest<Overview>(`/v1/engineering/projects/${projectId}/overview`)
      setOverview(next)
      setProjectDraft(projectToDraft(next.project))
      setSelectedDatasetId((current) => next.datasets.some((dataset) => dataset.id === current) ? current : next.datasets[0]?.id ?? '')
      setSelectedAnalysisId((current) => next.analyses.some((analysis) => analysis.id === current) ? current : next.analyses[0]?.id ?? '')
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [runtimeReady])

  const loadProjects = useCallback(async (): Promise<void> => {
    if (!runtimeReady) return
    try {
      const result = await runtimeRequest<{ projects: Project[] }>('/v1/engineering/projects')
      const workspaceProjects = result.projects.filter((project) => project.workspace === workspaceRoot)
      setProjects(workspaceProjects)
      setSelectedProjectId((current) => workspaceProjects.some((project) => project.id === current) ? current : workspaceProjects[0]?.id ?? '')
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }, [runtimeReady, workspaceRoot])

  useEffect(() => { void loadProjects() }, [loadProjects])
  useEffect(() => { void loadOverview(selectedProjectId) }, [loadOverview, selectedProjectId])
  useEffect(() => {
    if (!runtimeReady || !selectedProjectId) return
    const selectedProject = projects.find((project) => project.id === selectedProjectId)
    if (!selectedProject) return
    void ensureEngineeringThread(selectedProject.id, workspaceRoot, `工程 AI · ${selectedProject.name}`)
  }, [ensureEngineeringThread, projects, runtimeReady, selectedProjectId, workspaceRoot])
  useEffect(() => {
    const openRequestedProject = (): void => {
      const projectId = consumeRequestedEngineeringProject()
      if (!projectId) return
      selectProject(projectId)
      setPreview(null)
      setChart(null)
    }
    window.addEventListener('workwise:engineering-open-project', openRequestedProject)
    const openAiCommand = (): void => setTab('ai-command')
    window.addEventListener('workwise:engineering-open-ai', openAiCommand)
    openRequestedProject()
    return () => {
      window.removeEventListener('workwise:engineering-open-project', openRequestedProject)
      window.removeEventListener('workwise:engineering-open-ai', openAiCommand)
    }
  }, [selectProject])

  const activeDataset = useMemo(
    () => overview?.datasets.find((dataset) => dataset.id === selectedDatasetId) ?? overview?.datasets[0] ?? null,
    [overview?.datasets, selectedDatasetId]
  )
  const activeAnalysis = useMemo(
    () => overview?.analyses.find((analysis) => analysis.id === selectedAnalysisId)
      ?? overview?.analyses.find((analysis) => analysis.datasetId === activeDataset?.id)
      ?? null,
    [activeDataset?.id, overview?.analyses, selectedAnalysisId]
  )
  const openFindings = activeDataset?.findings.filter((finding) => finding.status === 'open') ?? []
  const blockingFindings = openFindings.filter((finding) => finding.severity === 'blocking')
  const warningFindings = openFindings.filter((finding) => finding.severity === 'warning')
  const acceptedWarnings = activeDataset?.findings.filter((finding) => finding.severity === 'warning' && finding.status === 'accepted').length ?? 0
  const analysisCounts = useMemo(() => {
    const initial: Record<AnalysisResult['thresholdStatus'], number> = { normal: 0, warning: 0, alarm: 0, control: 0, unresolved: 0 }
    for (const result of activeAnalysis?.results ?? []) initial[result.thresholdStatus] += 1
    return initial
  }, [activeAnalysis])
  const latestManifest = overview?.manifests[0] ?? null
  const latestRun = overview?.runs[0] ?? null

  const refreshCurrent = async (): Promise<void> => {
    if (selectedProjectId) await loadOverview(selectedProjectId)
    else await loadProjects()
    setNotice({ tone: 'info', message: '已从 Runtime 刷新工程状态。' })
  }

  const createProject = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await runtimeRequest<{ project: Project }>('/v1/engineering/projects', 'POST', {
        name: '新建监测项目', monitoringType: 'deformation', unit: 'mm', signConvention: 'positive', workspace: workspaceRoot,
        expectedRevision: 0, idempotencyKey: `engineering-project-${Date.now()}`
      })
      setProjects((current) => [result.project, ...current.filter((project) => project.id !== result.project.id)])
      selectProject(result.project.id)
      setOverview({ project: result.project, datasets: [], analyses: [], runs: [], manifests: [] })
      setProjectDraft(projectToDraft(result.project))
      setPreview(null)
      setChart(null)
      setTab('ai-command')
      window.dispatchEvent(new CustomEvent('workwise:engineering-projects-changed'))
      setNotice({ tone: 'success', message: '监测项目已创建。请先配置阈值和报告周期，再导入数据。' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }, [workspaceRoot, selectProject])

  useEffect(() => {
    const requestCreateProject = (): void => setCreateRequestToken(Date.now())
    window.addEventListener('workwise:engineering-create-project', requestCreateProject)
    return () => window.removeEventListener('workwise:engineering-create-project', requestCreateProject)
  }, [])

  useEffect(() => {
    if (!createRequestToken) return
    void createProject()
  }, [createProject, createRequestToken])

  const saveProject = async (): Promise<void> => {
    if (!overview || !projectDraft) return
    setBusy(true)
    try {
      const project = await runtimeRequest<{ project: Project }>(`/v1/engineering/projects/${overview.project.id}`, 'PATCH', {
        name: projectDraft.name.trim(), monitoringType: projectDraft.monitoringType.trim(), unit: projectDraft.unit.trim(), signConvention: projectDraft.signConvention.trim(),
        thresholds: parseThresholds(projectDraft.thresholdsText), reportPeriod: projectDraft.reportPeriod,
        expectedRevision: overview.project.revision, idempotencyKey: `engineering-project-save-${overview.project.id}-${overview.project.revision}`
      })
      setOverview((current) => current ? { ...current, project: project.project } : current)
      setProjects((current) => current.map((item) => item.id === project.project.id ? project.project : item))
      setProjectDraft(projectToDraft(project.project))
      window.dispatchEvent(new CustomEvent('workwise:engineering-projects-changed'))
      setNotice({ tone: 'success', message: '项目配置已保存。后续分析会使用当前阈值版本。' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const importDataset = async (file: File): Promise<void> => {
    if (!overview) return
    setBusy(true)
    try {
      const dataBase64 = await fileToBase64(file)
      const result = await runtimeRequest<{ dataset: Dataset }>('/v1/engineering/datasets/import', 'POST', {
        projectId: overview.project.id, name: file.name, dataBase64,
        expectedRevision: overview.project.revision, idempotencyKey: `engineering-import-${overview.project.id}-${file.name}-${file.size}-${file.lastModified}`
      })
      setSelectedDatasetId(result.dataset.id)
      await loadOverview(overview.project.id)
      setTab('quality')
      setNotice({ tone: 'success', message: `${file.name} 已导入，识别到 ${result.dataset.observationCount.toLocaleString('zh-CN')} 条观测记录。` })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const replaceDataset = (dataset: Dataset): void => {
    setOverview((current) => current ? { ...current, datasets: current.datasets.map((item) => item.id === dataset.id ? dataset : item) } : current)
  }

  const validateDataset = async (): Promise<void> => {
    if (!activeDataset) return
    setBusy(true)
    try {
      const result = await runtimeRequest<{ dataset: Dataset }>(`/v1/engineering/datasets/${activeDataset.id}/validate`, 'POST', {
        expectedRevision: activeDataset.revision, idempotencyKey: `engineering-validate-${activeDataset.id}-${activeDataset.revision}`
      })
      replaceDataset(result.dataset)
      setNotice({ tone: result.dataset.findings.some((finding) => finding.status === 'open' && finding.severity === 'blocking') ? 'warning' : 'success', message: '质量校核已完成，结果已按严重级别更新。' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const acceptWarning = async (finding: Finding): Promise<void> => {
    if (!activeDataset) return
    setBusy(true)
    try {
      const result = await runtimeRequest<{ dataset: Dataset }>(`/v1/engineering/datasets/${activeDataset.id}/findings/${finding.id}/accept`, 'POST', {
        expectedRevision: activeDataset.revision, idempotencyKey: `engineering-accept-${activeDataset.id}-${finding.id}-${activeDataset.revision}`
      })
      replaceDataset(result.dataset)
      setNotice({ tone: 'success', message: '警告项已记录为人工接受。阻断项仍必须回到源数据修正。' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const runAnalysis = async (): Promise<void> => {
    if (!overview || !activeDataset) return
    setBusy(true)
    try {
      const result = await runtimeRequest<{ analysis: Analysis }>('/v1/engineering/analyses', 'POST', {
        projectId: overview.project.id, datasetId: activeDataset.id, expectedRevision: activeDataset.revision,
        idempotencyKey: `engineering-analysis-${activeDataset.id}-${activeDataset.revision}`
      })
      setSelectedAnalysisId(result.analysis.id)
      await loadOverview(overview.project.id)
      setTab('analysis')
      setNotice({ tone: 'success', message: `已完成 ${result.analysis.results.length.toLocaleString('zh-CN')} 个测点/监测项的确定性分析。` })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const createChart = async (): Promise<void> => {
    if (!activeAnalysis) return
    setBusy(true)
    try {
      const result = await runtimeRequest<{ chart: Chart }>('/v1/engineering/charts', 'POST', {
        analysisId: activeAnalysis.id, chartType: 'trend', expectedRevision: 0, idempotencyKey: `engineering-chart-${activeAnalysis.id}`
      })
      setChart(result.chart)
      setNotice({ tone: 'success', message: '趋势图已生成，并会随下一次报告预览进入成果包。' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const previewDeliverables = async (): Promise<void> => {
    if (!overview || !activeDataset) return
    setBusy(true)
    try {
      const result = await runtimeRequest<ReportPreview>('/v1/engineering/reports/preview', 'POST', {
        projectId: overview.project.id, datasetId: activeDataset.id, analysisId: activeAnalysis?.id, adjustmentIds: surveyAdjustmentIds, citations,
        expectedRevision: activeDataset.revision, idempotencyKey: `engineering-preview-${activeDataset.id}-${activeDataset.revision}-${Date.now()}`
      })
      setPreview(result)
      setChart(result.charts[0] ?? chart)
      await loadOverview(overview.project.id)
      setTab('deliverables')
      setNotice({ tone: 'success', message: 'DOCX、PDF、XLSX 预览成果和趋势图已生成，尚未归档。' })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const finalizeDeliverables = async (): Promise<void> => {
    if (!overview || !activeDataset || !activeAnalysis) return
    setBusy(true)
    try {
      const result = await runtimeRequest<{ manifest: Manifest }>('/v1/engineering/deliverables/finalize', 'POST', {
        projectId: overview.project.id, datasetId: activeDataset.id, analysisId: activeAnalysis.id, adjustmentIds: surveyAdjustmentIds, citations,
        acknowledgeWarnings: false, expectedRevision: activeDataset.revision,
        idempotencyKey: `engineering-finalize-${activeDataset.id}-${activeDataset.revision}-${Date.now()}`
      })
      await loadOverview(overview.project.id)
      setNotice({ tone: 'success', message: `成果已批准并固化为 ${result.manifest.id}。后续改动将生成新的修订成果。` })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally { setBusy(false) }
  }

  const addCitation = (): void => {
    const source = citationSource.trim()
    if (!source) {
      setNotice({ tone: 'warning', message: '请先填写规范、知识库或附件来源。' })
      return
    }
    setCitations((current) => [...current, { id: `citation-${Date.now()}`, sourceType: citationType, source, ...(citationLocator.trim() ? { locator: citationLocator.trim() } : {}) }])
    setCitationSource('')
    setCitationLocator('')
  }

  const finalizationBlocked = !activeDataset || !activeAnalysis || blockingFindings.length > 0 || warningFindings.length > 0
  const manifestOutputs = latestManifest?.outputs ?? preview?.files ?? []

  return <div className={`engineering-workspace ds-no-drag flex min-h-0 flex-1 flex-col bg-ds-main text-ds-ink ${tab === 'ai-command' ? 'engineering-agent-route' : 'engineering-classic-route'}`}>
    {tab !== 'ai-command' ? <header className="shrink-0 border-b border-ds-border-muted bg-ds-card px-4 py-3 sm:px-5" data-testid="engineering-classic-header">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {leftSidebarCollapsed && onToggleLeftSidebar ? <button type="button" onClick={onToggleLeftSidebar} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border bg-ds-card px-2.5 text-[12px] font-medium text-ds-muted hover:bg-ds-hover"><ChevronRight className="h-3.5 w-3.5" />导航</button> : null}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent"><HardHat className="h-5 w-5" strokeWidth={1.7} /></span>
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-faint">Engineering delivery</p><h1 className="truncate text-[17px] font-semibold">工程数据交付工作台</h1></div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor="engineering-project-select">当前工程项目</label>
          <select id="engineering-project-select" value={selectedProjectId} disabled={!runtimeReady || busy} onChange={(event) => { selectProject(event.target.value); setPreview(null); setChart(null) }} className="h-8 max-w-[220px] rounded-md border border-ds-border bg-ds-card px-2 text-[12px] text-ds-ink outline-none focus:border-accent">
            <option value="">{projects.length ? '选择工程项目' : '暂无工程项目'}</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button type="button" onClick={() => void refreshCurrent()} disabled={busy || !runtimeReady} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border bg-ds-card px-2.5 text-[12px] font-medium text-ds-muted hover:bg-ds-hover disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />刷新</button>
          <span className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-medium ${runtimeReady ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}>{runtimeReady ? 'Runtime 已连接' : 'Runtime 未连接'}</span>
        </div>
      </div>
    </header> : null}

    {tab !== 'ai-command' && !runtimeReady ? <div className="border-b border-amber-300/40 bg-amber-50 px-5 py-2 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">工程工作台需要本地运行时执行校核、分析和成果生成。连接成功后，项目数据会自动刷新。</div> : null}
    {tab !== 'ai-command' && notice ? <div className={`mx-4 mt-3 flex items-start gap-2 border px-3 py-2 text-[12px] sm:mx-5 ${notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' : notice.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' : notice.tone === 'success' ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200' : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-50 text-blue-200'}`}><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1">{notice.message}</span><button type="button" onClick={() => setNotice(null)} className="text-current/70 hover:text-current" aria-label="关闭提示">×</button></div> : null}

    <div className={`min-h-0 flex-1 overflow-hidden ${tab === 'ai-command' ? 'p-0' : 'p-4 sm:p-5'}`}>
      {tab === 'ai-command' ? <div className="h-full min-h-0 overflow-hidden">
        <EngineeringAiCommandCenter
          workspaceRoot={workspaceRoot}
          runtimeReady={runtimeReady}
          project={overview?.project ?? null}
          dataset={activeDataset}
          analysis={activeAnalysis}
          latestRun={latestRun}
          onCreateProject={() => void createProject()}
          onImportData={() => { if (overview) setTab('data'); else void createProject() }}
          onOpenTab={(nextTab) => setTab(nextTab)}
          onRefresh={() => void refreshCurrent()}
        />
      </div> : <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden border border-ds-border-muted bg-ds-card xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-ds-border-muted bg-ds-main xl:border-b-0 xl:border-r">
          <div className="border-b border-ds-border-muted px-4 py-4"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-faint">交付流程</p><p className="mt-1 text-[12px] leading-5 text-ds-muted">每一步读取同一份运行数据，成果审核前保留完整来源和版本。</p></div>
          <nav className="grid grid-cols-3 gap-1 p-2 xl:block xl:space-y-3" aria-label="工程工作台阶段">
            {TAB_GROUPS.map((group) => <section key={group.id} className="xl:space-y-1"><p className="hidden px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ds-faint xl:block">{group.label}</p>{TABS.filter((item) => item.group === group.id).map((item) => { const Icon = item.icon; const active = item.id === tab; const hasAttention = (item.id === 'quality' && (blockingFindings.length > 0 || warningFindings.length > 0)) || (item.id === 'review' && finalizationBlocked); return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition ${active ? 'bg-accent/12 text-accent shadow-[inset_0_0_0_1px_rgba(0,136,255,0.20)]' : 'text-ds-muted hover:bg-ds-hover hover:text-ds-ink'}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ds-card text-[10px] font-semibold tabular-nums"><Icon className="h-3.5 w-3.5" strokeWidth={1.7} /></span><span className="min-w-0 flex-1 truncate"><span className="hidden xl:inline">{item.label}</span><span className="xl:hidden">{item.shortLabel}</span></span>{hasAttention ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : null}</button> })}</section>)}
          </nav>
          <div className="mt-auto hidden border-t border-ds-border-muted p-4 xl:block">
            <p className="text-[10.5px] font-medium text-ds-faint">当前数据边界</p>
            <p className="mt-1 text-[11px] leading-4 text-ds-muted">原始 CSV/XLSX 不会被模型逐行读取；分析、阈值与哈希由 Runtime 确定性生成。</p>
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto bg-ds-main">
          {overview === null ? <EmptyState title="从工程项目开始" detail="先建立工程项目并写入阈值、单位和报告周期。后续数据、分析和成果都将在该项目下保留可追溯修订。" action={<button type="button" onClick={() => void createProject()} disabled={busy || !runtimeReady} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:brightness-95 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />新建工程项目</button>} /> : <>
            <div className="border-b border-ds-border-muted bg-ds-card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-faint">{TABS.find((item) => item.id === tab)?.label}</p><h2 className="mt-1 truncate text-[18px] font-semibold">{overview.project.name}</h2><p className="mt-1 text-[12px] text-ds-muted">{overview.project.monitoringType} · {overview.project.unit} · 修订 {overview.project.revision} · 更新于 {formatDate(overview.project.updatedAt)}</p></div><button type="button" onClick={() => void createProject()} disabled={busy || !runtimeReady} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border bg-ds-card px-2.5 text-[12px] font-medium text-ds-muted hover:bg-ds-hover disabled:opacity-50"><Plus className="h-3.5 w-3.5" />新建项目</button></div>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><Metric label="数据集" value={overview.datasets.length} detail={activeDataset ? activeDataset.sourceFileName : '尚未导入'} /><Metric label="阻断项" value={blockingFindings.length} detail={blockingFindings.length ? '需修正源数据' : '当前数据无阻断'} tone={blockingFindings.length ? 'danger' : 'success'} /><Metric label="预警状态" value={analysisCounts.warning + analysisCounts.alarm + analysisCounts.control} detail={activeAnalysis ? `${activeAnalysis.results.length} 个分析结果` : '尚未运行分析'} tone={analysisCounts.alarm + analysisCounts.control ? 'danger' : analysisCounts.warning ? 'warning' : 'neutral'} /><Metric label="归档成果" value={overview.manifests.length} detail={latestManifest ? latestManifest.id : '尚未最终归档'} tone={latestManifest ? 'success' : 'neutral'} /></div>
            </div>

            {tab === 'dashboard' ? <section>
              <PanelHeading title="交付控制台" description="一个工程项目的一次数据交付从源文件、校核、分析到归档都在同一条可追溯链路中完成。选择任一阶段可直接继续处理。" action={<button type="button" onClick={() => setTab(activeDataset ? 'quality' : 'data')} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white"><ChevronRight className="h-3.5 w-3.5" />{activeDataset ? '继续交付' : '导入第一份数据'}</button>} />
              <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
                <div className="overflow-hidden border border-ds-border-muted bg-ds-card">
                  <div className="border-b border-ds-border-muted px-4 py-3"><p className="text-[13px] font-semibold text-ds-ink">交付路径</p><p className="mt-1 text-[11px] leading-4 text-ds-muted">数值、阈值和哈希由 Runtime 确定性生成；报告文字不能覆盖分析结论。</p></div>
                  <div>
                    <DeliveryStage index={1} icon={FolderKanban} title="项目与阈值" detail={Object.keys(overview.project.thresholds).length ? `${Object.keys(overview.project.thresholds).length} 项阈值已保存 · 修订 ${overview.project.revision}` : '请确认单位、正负号、报告周期与监测阈值'} state={Object.keys(overview.project.thresholds).length ? '已配置' : '待配置'} attention={!Object.keys(overview.project.thresholds).length} onOpen={() => setTab('project')} />
                    <DeliveryStage index={2} icon={Database} title="数据资产" detail={activeDataset ? `${activeDataset.sourceFileName} · ${activeDataset.observationCount.toLocaleString('zh-CN')} 条观测` : '尚未导入 CSV 或 XLSX 源数据'} state={activeDataset ? statusLabel(activeDataset.status) : '待导入'} attention={!activeDataset} onOpen={() => setTab('data')} />
                    <DeliveryStage index={3} icon={ShieldCheck} title="质量校核" detail={activeDataset ? (blockingFindings.length ? `${blockingFindings.length} 个阻断项需要回到源数据修正` : warningFindings.length ? `${warningFindings.length} 个警告等待人工确认` : '当前数据没有待处理问题') : '导入后自动检查缺失、重复、单位和时间异常'} state={blockingFindings.length ? '被阻断' : warningFindings.length ? '待确认' : activeDataset ? '通过' : '未开始'} attention={blockingFindings.length > 0 || warningFindings.length > 0} onOpen={() => setTab('quality')} />
                    <DeliveryStage index={4} icon={LineChart} title="趋势与阈值分析" detail={activeAnalysis ? `${activeAnalysis.results.length.toLocaleString('zh-CN')} 条结果 · ${activeAnalysis.algorithmVersion}` : '尚未计算当前值、累计变化、速率和趋势'} state={activeAnalysis ? '已完成' : '待分析'} attention={Boolean(activeDataset) && !activeAnalysis} onOpen={() => setTab('analysis')} />
                    <DeliveryStage index={5} icon={FileOutput} title="报告与证据包" detail={manifestOutputs.length ? `${manifestOutputs.length} 个输出带 SHA-256 哈希` : 'DOCX、PDF、XLSX 和图表将在同一次运行中生成'} state={manifestOutputs.length ? '已生成' : '待生成'} attention={Boolean(activeAnalysis) && !manifestOutputs.length} onOpen={() => setTab('deliverables')} />
                    <DeliveryStage index={6} icon={ClipboardCheck} title="人工审查与归档" detail={latestManifest ? `最近成果 ${latestManifest.id}` : finalizationBlocked ? '门禁尚未满足，成果不会被静默归档' : '可固化新的 manifest.json 版本'} state={latestManifest ? '已归档' : finalizationBlocked ? '待审查' : '可审批'} attention={!latestManifest && finalizationBlocked} onOpen={() => setTab('review')} />
                  </div>
                </div>
                <aside className="border border-ds-border-muted bg-ds-card">
                  <div className="border-b border-ds-border-muted px-4 py-3"><p className="text-[13px] font-semibold text-ds-ink">本次交付状态</p><p className="mt-1 text-[11px] text-ds-faint">项目修订 {overview.project.revision} · 更新于 {formatDate(overview.project.updatedAt)}</p></div>
                  <div className="space-y-4 px-4 py-4"><div className={`flex items-start gap-2 text-[12px] ${finalizationBlocked ? 'text-amber-800 dark:text-amber-200' : 'text-green-800 dark:text-green-300'}`}>{finalizationBlocked ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{finalizationBlocked ? '尚有质量、分析或成果门禁未完成。' : '全部门禁已满足，可进入人工审批。'}</span></div><dl className="space-y-3 border-t border-ds-border-muted pt-3 text-[11px]"><div className="flex justify-between gap-3"><dt className="text-ds-muted">当前数据集</dt><dd className="max-w-[150px] truncate text-right font-medium text-ds-ink">{activeDataset?.sourceFileName ?? '未选择'}</dd></div><div className="flex justify-between gap-3"><dt className="text-ds-muted">阻断项</dt><dd className={blockingFindings.length ? 'font-medium text-red-700 dark:text-red-300' : 'font-medium text-green-700 dark:text-green-300'}>{blockingFindings.length}</dd></div><div className="flex justify-between gap-3"><dt className="text-ds-muted">人工警告</dt><dd className="font-medium text-ds-ink">{acceptedWarnings} 已接受 / {warningFindings.length} 待确认</dd></div><div className="flex justify-between gap-3"><dt className="text-ds-muted">成果清单</dt><dd className="font-medium text-ds-ink">{overview.manifests.length} 个已归档</dd></div></dl><div className="border-t border-ds-border-muted pt-3 text-[11px] leading-5 text-ds-muted">原始文件保持不变；每次数据、阈值或字段映射的变化都会产生新的运行版本，旧成果仍可审查。</div></div>
                </aside>
              </div>
            </section> : null}

            {tab === 'project' ? <section>
              <PanelHeading title="项目与阈值配置" description="阈值、单位和正负号是确定性分析输入。保存后不会覆写已有成果，下一次运行会使用新的项目修订。" action={<button type="button" onClick={() => void saveProject()} disabled={busy || !projectDraft} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />保存配置</button>} />
              {projectDraft ? <div className="grid gap-x-5 gap-y-4 p-5 lg:grid-cols-2"><label className="block text-[12px] font-medium text-ds-muted">项目名称<input value={projectDraft.name} onChange={(event) => setProjectDraft((current) => current ? { ...current, name: event.target.value } : current)} className="mt-1.5 h-9 w-full rounded-md border border-ds-border bg-ds-card px-2.5 text-[13px] text-ds-ink outline-none focus:border-accent" /></label><label className="block text-[12px] font-medium text-ds-muted">监测类型<input value={projectDraft.monitoringType} onChange={(event) => setProjectDraft((current) => current ? { ...current, monitoringType: event.target.value } : current)} className="mt-1.5 h-9 w-full rounded-md border border-ds-border bg-ds-card px-2.5 text-[13px] text-ds-ink outline-none focus:border-accent" /></label><label className="block text-[12px] font-medium text-ds-muted">计量单位<input value={projectDraft.unit} onChange={(event) => setProjectDraft((current) => current ? { ...current, unit: event.target.value } : current)} className="mt-1.5 h-9 w-full rounded-md border border-ds-border bg-ds-card px-2.5 text-[13px] text-ds-ink outline-none focus:border-accent" /></label><label className="block text-[12px] font-medium text-ds-muted">正负号约定<select value={projectDraft.signConvention} onChange={(event) => setProjectDraft((current) => current ? { ...current, signConvention: event.target.value } : current)} className="mt-1.5 h-9 w-full rounded-md border border-ds-border bg-ds-card px-2.5 text-[13px] text-ds-ink outline-none focus:border-accent"><option value="positive">正值为正向变形</option><option value="negative">正值为负向变形</option><option value="custom">项目自定义</option></select></label><label className="block text-[12px] font-medium text-ds-muted">报告开始日期<input type="date" value={projectDraft.reportPeriod.start ?? ''} onChange={(event) => setProjectDraft((current) => current ? { ...current, reportPeriod: { ...current.reportPeriod, start: event.target.value || undefined } } : current)} className="mt-1.5 h-9 w-full rounded-md border border-ds-border bg-ds-card px-2.5 text-[13px] text-ds-ink outline-none focus:border-accent" /></label><label className="block text-[12px] font-medium text-ds-muted">报告结束日期<input type="date" value={projectDraft.reportPeriod.end ?? ''} onChange={(event) => setProjectDraft((current) => current ? { ...current, reportPeriod: { ...current.reportPeriod, end: event.target.value || undefined } } : current)} className="mt-1.5 h-9 w-full rounded-md border border-ds-border bg-ds-card px-2.5 text-[13px] text-ds-ink outline-none focus:border-accent" /></label><label className="block text-[12px] font-medium text-ds-muted lg:col-span-2">监测阈值<textarea value={projectDraft.thresholdsText} onChange={(event) => setProjectDraft((current) => current ? { ...current, thresholdsText: event.target.value } : current)} placeholder={'沉降 = 10\ndefault = 8'} className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-ds-border bg-ds-card px-2.5 py-2 text-[13px] leading-5 text-ds-ink outline-none focus:border-accent" /><span className="mt-1 block text-[11px] font-normal leading-4 text-ds-faint">每行一项。优先按监测项匹配；`default` 用于未单独配置的监测项。缺少阈值会在分析中显示“待确认”。</span></label></div> : null}
            </section> : null}

            {tab === 'data' ? <section>
              <PanelHeading title="数据资产与字段映射" description="仅导入 CSV 和 XLSX。未知列会保留在证据包；原始文件不被覆盖，规范化记录保留源文件哈希与行号。" action={<label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white ${busy || !runtimeReady ? 'pointer-events-none opacity-50' : ''}`}><Upload className="h-3.5 w-3.5" />导入 CSV / XLSX<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" disabled={busy || !runtimeReady} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDataset(file); event.target.value = '' }} /></label>} />
              <div className="p-5">{overview.datasets.length === 0 ? <EmptyState title="尚未导入监测数据" detail="导入后，Runtime 会识别常见中文字段、保留未知列并建立源文件哈希。请先在项目配置中确认阈值。" /> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="overflow-hidden border border-ds-border-muted"><div className="overflow-x-auto"><table className="min-w-full text-left text-[12px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="px-3 py-2.5 font-semibold">数据集</th><th className="px-3 py-2.5 font-semibold">记录</th><th className="px-3 py-2.5 font-semibold">时间范围</th><th className="px-3 py-2.5 font-semibold">状态</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{overview.datasets.map((dataset) => <tr key={dataset.id} onClick={() => setSelectedDatasetId(dataset.id)} className={`cursor-pointer transition hover:bg-accent/5 ${dataset.id === activeDataset?.id ? 'bg-accent/8' : ''}`}><td className="max-w-[260px] px-3 py-3"><p className="truncate font-medium text-ds-ink">{dataset.sourceFileName}</p><p className="mt-0.5 truncate font-mono text-[10px] text-ds-faint">{dataset.sourceFileHash.slice(0, 16)}…</p></td><td className="px-3 py-3 tabular-nums text-ds-ink">{dataset.observationCount.toLocaleString('zh-CN')}<span className="ml-1 text-[10px] text-ds-faint">/ {dataset.rowCount} 行</span></td><td className="px-3 py-3 text-ds-muted">{formatDate(dataset.timeRange.start)}<br />{formatDate(dataset.timeRange.end)}</td><td className="px-3 py-3"><span className="rounded px-1.5 py-0.5 text-[11px] bg-ds-subtle text-ds-muted">{statusLabel(dataset.status)}</span></td></tr>)}</tbody></table></div></div><div className="border border-ds-border-muted bg-ds-card">{activeDataset ? <><div className="border-b border-ds-border-muted px-3 py-3"><p className="text-[12px] font-semibold text-ds-ink">字段映射</p><p className="mt-1 text-[11px] text-ds-faint">{activeDataset.columnCount} 列 · {activeDataset.unknownColumns.length} 个未知列</p></div><dl className="max-h-64 overflow-y-auto divide-y divide-ds-border-muted">{Object.entries(activeDataset.fieldMapping).map(([canonical, source]) => <div key={canonical} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 px-3 py-2 text-[11px]"><dt className="text-ds-faint">{canonical}</dt><dd className="truncate font-medium text-ds-ink">{source || '未映射'}</dd></div>)}</dl>{activeDataset.unknownColumns.length ? <div className="border-t border-ds-border-muted px-3 py-3"><p className="text-[11px] font-medium text-ds-muted">保留的未知列</p><p className="mt-1 break-words text-[11px] leading-4 text-ds-faint">{activeDataset.unknownColumns.join('、')}</p></div> : null}</> : null}</div></div>}</div>
            </section> : null}

            {tab === 'quality' ? <section>
              <PanelHeading title="质量校核与问题处置" description="阻断项必须回到源文件修正并重新导入。警告项可由人工接受，接受记录会进入最终成果清单。" action={<button type="button" onClick={() => void validateDataset()} disabled={busy || !activeDataset} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border bg-ds-card px-3 text-[12px] font-medium text-ds-ink hover:bg-ds-hover disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />重新校核</button>} />
              {!activeDataset ? <EmptyState title="请选择或导入数据集" detail="质量校核会检查缺失值、重复测点、非法数值、时间顺序、单位冲突和阈值缺失。" /> : <div className="p-5"><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Metric label="阻断项" value={blockingFindings.length} detail="必须修正后重新导入" tone={blockingFindings.length ? 'danger' : 'success'} /><Metric label="待确认警告" value={warningFindings.length} detail="需要人工明确接受" tone={warningFindings.length ? 'warning' : 'success'} /><Metric label="已接受警告" value={acceptedWarnings} detail="已纳入审查记录" tone={acceptedWarnings ? 'warning' : 'neutral'} /><Metric label="数据状态" value={statusLabel(activeDataset.status)} detail={`${activeDataset.observationCount.toLocaleString('zh-CN')} 条观测`} /></div><div className="mt-5 overflow-hidden border border-ds-border-muted"><div className="overflow-x-auto"><table className="min-w-full text-left text-[12px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="w-24 px-3 py-2.5 font-semibold">级别</th><th className="px-3 py-2.5 font-semibold">问题与建议</th><th className="w-24 px-3 py-2.5 font-semibold">来源行</th><th className="w-28 px-3 py-2.5 font-semibold">处置</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{activeDataset.findings.length ? activeDataset.findings.map((finding) => <tr key={finding.id} className={finding.status === 'open' && finding.severity === 'blocking' ? 'bg-red-50/60 dark:bg-red-500/5' : ''}><td className="px-3 py-3"><span className={`rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${findingTone[finding.severity]}`}>{finding.severity === 'blocking' ? '阻断' : finding.severity === 'warning' ? '警告' : '提示'}</span></td><td className="min-w-[310px] px-3 py-3"><p className="text-ds-ink">{finding.message}</p><p className="mt-1 text-[11px] leading-4 text-ds-muted">{finding.suggestion}</p></td><td className="px-3 py-3 tabular-nums text-ds-muted">{finding.row ? `第 ${finding.row} 行` : '—'}</td><td className="px-3 py-3">{finding.status === 'accepted' ? <span className="inline-flex items-center gap-1 text-[11px] text-green-700 dark:text-green-300"><CheckCircle2 className="h-3.5 w-3.5" />已接受</span> : finding.severity === 'warning' ? <button type="button" disabled={busy} onClick={() => void acceptWarning(finding)} className="rounded border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-200">接受警告</button> : finding.severity === 'blocking' ? <span className="text-[11px] leading-4 text-red-700 dark:text-red-300">修正源数据<br />后重新导入</span> : <span className="text-[11px] text-ds-faint">无需处置</span>}</td></tr>) : <tr><td colSpan={4} className="px-3 py-10 text-center text-ds-muted">未发现质量问题。</td></tr>}</tbody></table></div></div></div>}
            </section> : null}

            {tab === 'survey' ? <section>
              <PanelHeading title="测量与平差" description="水准、导线、平面控制、三角网、CPIII 和 GNSS 使用确定性 Runtime 计算；缺少基准或协方差时会明确阻断。" />
              <SurveyAdjustmentPanel project={overview.project} runtimeReady={runtimeReady} onAdjustmentComplete={(id) => setSurveyAdjustmentIds((current) => current.includes(id) ? current : [...current, id])} />
            </section> : null}

            {tab === 'skills' ? <section>
              <PanelHeading title="技能与规范" description="查看本项目可调用的专业能力、固定来源、许可证状态和工具边界。" />
              <EngineeringSkillsPanel runtimeReady={runtimeReady} />
            </section> : null}

            {tab === 'analysis' ? <section>
              <PanelHeading title="趋势、异常与阈值分析" description="所有数值由 Runtime 确定性计算。模型不会改写当前值、累计变化、速率或阈值状态。" action={<div className="flex items-center gap-2"><button type="button" onClick={() => void createChart()} disabled={busy || !activeAnalysis} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border bg-ds-card px-2.5 text-[12px] font-medium text-ds-ink hover:bg-ds-hover disabled:opacity-50"><BarChart3 className="h-3.5 w-3.5" />趋势图</button><button type="button" onClick={() => void runAnalysis()} disabled={busy || !activeDataset} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50"><Activity className="h-3.5 w-3.5" />运行分析</button></div>} />
              {!activeDataset ? <EmptyState title="尚未选择监测数据" detail="分析依赖一个已导入的数据集。您可以先进入数据资产导入 CSV 或 XLSX。" /> : !activeAnalysis ? <EmptyState title="尚未生成分析结果" detail="运行后将按监测项与测点给出当前值、上期值、累计变化、变化速率、趋势、异常与阈值状态。" action={<button type="button" onClick={() => void runAnalysis()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"><Activity className="h-3.5 w-3.5" />运行确定性分析</button>} /> : <div className="p-5"><div className="grid grid-cols-2 gap-2 lg:grid-cols-5"><Metric label="正常" value={analysisCounts.normal} detail="低于提示阈值" tone="success" /><Metric label="提示" value={analysisCounts.warning} detail="达到关注区间" tone={analysisCounts.warning ? 'warning' : 'neutral'} /><Metric label="报警" value={analysisCounts.alarm} detail="达到或超过阈值" tone={analysisCounts.alarm ? 'danger' : 'neutral'} /><Metric label="控制" value={analysisCounts.control} detail="控制状态" tone={analysisCounts.control ? 'danger' : 'neutral'} /><Metric label="待确认" value={analysisCounts.unresolved} detail="项目未配置阈值" tone={analysisCounts.unresolved ? 'warning' : 'neutral'} /></div>{chart ? <div className="mt-4 flex items-center gap-2 border border-ds-border-muted bg-ds-card px-3 py-2 text-[12px]"><BarChart3 className="h-4 w-4 text-accent" /><span className="min-w-0 flex-1 truncate text-ds-muted">已生成趋势图：<span className="font-mono text-ds-ink">{chart.relativePath}</span></span><span className="rounded bg-green-100 px-1.5 py-0.5 text-[10.5px] text-green-800 dark:bg-green-500/15 dark:text-green-300">{chart.validation}</span></div> : null}<div className="mt-5 overflow-hidden border border-ds-border-muted"><div className="overflow-x-auto"><table className="min-w-full text-left text-[12px]"><thead className="sticky top-0 bg-ds-subtle text-ds-muted"><tr><th className="px-3 py-2.5 font-semibold">监测项 / 测点</th><th className="px-3 py-2.5 font-semibold">当前值</th><th className="px-3 py-2.5 font-semibold">累计变化</th><th className="px-3 py-2.5 font-semibold">变化速率</th><th className="px-3 py-2.5 font-semibold">趋势</th><th className="px-3 py-2.5 font-semibold">阈值状态</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{activeAnalysis.results.map((result) => <tr key={`${result.monitoringItem}-${result.point}`} className={result.thresholdStatus === 'alarm' || result.thresholdStatus === 'control' ? 'bg-red-50/60 dark:bg-red-500/5' : result.thresholdStatus === 'warning' ? 'bg-amber-50/50 dark:bg-amber-500/5' : 'hover:bg-accent/5'}><td className="px-3 py-3"><p className="font-medium text-ds-ink">{result.point}</p><p className="mt-0.5 text-[10.5px] text-ds-faint">{result.monitoringItem}</p></td><td className="px-3 py-3 tabular-nums font-medium text-ds-ink">{formatNumber(result.currentValue)} <span className="text-[10.5px] font-normal text-ds-faint">{overview.project.unit}</span></td><td className="px-3 py-3 tabular-nums text-ds-ink">{formatNumber(result.cumulativeChange)}</td><td className="px-3 py-3 tabular-nums text-ds-ink">{formatNumber(result.changeRate)}</td><td className="px-3 py-3"><span className="text-ds-muted">{statusLabel(result.trend)}{result.anomaly ? <span className="ml-1.5 text-red-600 dark:text-red-300">异常</span> : null}</span></td><td className="px-3 py-3"><span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${thresholdTone[result.thresholdStatus]}`}>{statusLabel(result.thresholdStatus)}</span></td></tr>)}</tbody></table></div></div><p className="mt-3 text-[11px] text-ds-faint">算法版本：{activeAnalysis.algorithmVersion} · 输入哈希：<span className="font-mono">{activeAnalysis.inputHash}</span></p></div>}
            </section> : null}

            {tab === 'deliverables' ? <section>
              <PanelHeading title="成果预览与证据包" description="预览生成 DOCX、PDF、XLSX 和趋势图。预览不等同于归档，最终成果仍需在审查归档中通过门禁。" action={<button type="button" onClick={() => void previewDeliverables()} disabled={busy || !activeDataset} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50"><FileOutput className="h-3.5 w-3.5" />生成预览成果</button>} />
              {!activeDataset ? <EmptyState title="请先导入数据" detail="成果预览会使用当前数据集、确定性分析、图表和引用信息建立完整的本地证据包。" /> : <div className="p-5"><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><div><div className="border border-ds-border-muted"><div className="flex items-center justify-between border-b border-ds-border-muted px-3 py-3"><div><p className="text-[13px] font-semibold text-ds-ink">预览输出</p><p className="mt-0.5 text-[11px] text-ds-faint">{preview ? `运行 ${preview.run.id}` : '尚未生成预览'}</p></div>{preview ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10.5px] text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">未归档</span> : null}</div>{manifestOutputs.length ? <div className="divide-y divide-ds-border-muted">{manifestOutputs.map((output) => <div key={`${output.path}-${output.sha256}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3"><div className="min-w-0"><p className="truncate font-mono text-[11px] text-ds-ink">{output.path}</p><p className="mt-1 truncate font-mono text-[10px] text-ds-faint">SHA-256 {output.sha256}</p></div><span className="self-center tabular-nums text-[11px] text-ds-muted">{formatBytes(output.sizeBytes)}</span></div>)}</div> : <div className="px-3 py-12 text-center text-[12px] text-ds-muted">运行预览后将在此列出报告、证据包、图表及其文件哈希。</div>}</div>{latestRun ? <div className="mt-4 border border-ds-border-muted px-3 py-3 text-[12px]"><p className="font-medium text-ds-ink">最近运行</p><p className="mt-1 text-ds-muted"><span className="font-mono text-[11px]">{latestRun.id}</span> · {statusLabel(latestRun.status)} · {formatDate(latestRun.updatedAt)}</p>{latestRun.error ? <p className="mt-1 text-red-700 dark:text-red-300">{latestRun.error}</p> : null}</div> : null}</div><div className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-3 py-3"><p className="text-[13px] font-semibold text-ds-ink">来源引用</p><p className="mt-1 text-[11px] leading-4 text-ds-faint">加入规范、知识库或附件来源。它们将进入报告、XLSX 索引和最终 manifest。</p></div><div className="space-y-2 px-3 py-3"><select value={citationType} onChange={(event) => setCitationType(event.target.value as Citation['sourceType'])} className="h-8 w-full rounded-md border border-ds-border bg-ds-card px-2 text-[12px] text-ds-ink outline-none focus:border-accent"><option value="standard">规范条文</option><option value="knowledge-base">知识库</option><option value="attachment">本地附件</option><option value="other">其他来源</option></select><input value={citationSource} onChange={(event) => setCitationSource(event.target.value)} placeholder="来源名称或文件路径" className="h-8 w-full rounded-md border border-ds-border bg-ds-card px-2 text-[12px] text-ds-ink outline-none focus:border-accent" /><input value={citationLocator} onChange={(event) => setCitationLocator(event.target.value)} placeholder="定位信息，例如第 5.2 条" className="h-8 w-full rounded-md border border-ds-border bg-ds-card px-2 text-[12px] text-ds-ink outline-none focus:border-accent" /><button type="button" onClick={addCitation} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border px-2.5 text-[12px] font-medium text-ds-ink hover:bg-ds-hover"><Plus className="h-3.5 w-3.5" />添加引用</button></div><div className="divide-y divide-ds-border-muted border-t border-ds-border-muted">{citations.length ? citations.map((citation) => <div key={citation.id} className="group flex gap-2 px-3 py-2.5"><FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-ds-ink">{citation.source}</p><p className="mt-0.5 truncate text-[10.5px] text-ds-faint">{citation.sourceType}{citation.locator ? ` · ${citation.locator}` : ''}</p></div><button type="button" onClick={() => setCitations((current) => current.filter((item) => item.id !== citation.id))} className="text-ds-faint opacity-0 transition hover:text-red-600 group-hover:opacity-100" aria-label={`移除引用 ${citation.source}`}>×</button></div>) : <p className="px-3 py-4 text-[11px] text-ds-faint">尚未添加引用。</p>}</div></div></div></div>}
            </section> : null}

            {tab === 'review' ? <section>
              <PanelHeading title="审查门禁与归档" description="只有阻断项为零、所有警告已人工接受且存在分析结果时，才可固化成果清单。最终归档不会原地覆盖旧成果。" action={<button type="button" onClick={() => void finalizeDeliverables()} disabled={busy || finalizationBlocked} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-green-700 px-3 text-[12px] font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"><Archive className="h-3.5 w-3.5" />批准并归档</button>} />
              <div className="p-5"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"><div><div className="overflow-hidden border border-ds-border-muted"><div className="border-b border-ds-border-muted bg-ds-subtle px-3 py-2.5 text-[12px] font-semibold text-ds-muted">审查清单</div><div className="divide-y divide-ds-border-muted"><ReviewRow ok={Boolean(activeDataset)} label="已选择并保存数据集" detail={activeDataset ? `${activeDataset.sourceFileName} · ${activeDataset.observationCount.toLocaleString('zh-CN')} 条观测` : '请选择一个数据集。'} /><ReviewRow ok={blockingFindings.length === 0 && Boolean(activeDataset)} label="阻断项已清零" detail={blockingFindings.length ? `仍有 ${blockingFindings.length} 个阻断项，须修正源数据后重新导入。` : '当前数据集没有待处理阻断项。'} /><ReviewRow ok={warningFindings.length === 0 && Boolean(activeDataset)} label="警告项已确认" detail={warningFindings.length ? `仍有 ${warningFindings.length} 个警告项需要人工接受。` : acceptedWarnings ? `${acceptedWarnings} 个警告项已记录为人工接受。` : '当前没有需要接受的警告项。'} /><ReviewRow ok={Boolean(activeAnalysis)} label="已完成确定性分析" detail={activeAnalysis ? `${activeAnalysis.results.length.toLocaleString('zh-CN')} 条分析结果 · ${activeAnalysis.algorithmVersion}` : '请先运行趋势与阈值分析。'} /><ReviewRow ok={manifestOutputs.length > 0} label="已生成可审查成果" detail={manifestOutputs.length ? `${manifestOutputs.length} 个输出文件带有 SHA-256 哈希。` : '请先生成 DOCX、PDF 和 XLSX 预览成果。'} /></div></div><div className="mt-5 border border-ds-border-muted"><div className="border-b border-ds-border-muted px-3 py-3"><p className="text-[13px] font-semibold text-ds-ink">已归档成果</p><p className="mt-1 text-[11px] text-ds-faint">每次批准生成独立 manifest，历史版本保持只读。</p></div>{overview.manifests.length ? <div className="divide-y divide-ds-border-muted">{overview.manifests.map((manifest) => <div key={manifest.id} className="px-3 py-3"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-300" /><div className="min-w-0"><p className="truncate font-mono text-[11px] font-medium text-ds-ink">{manifest.id}</p><p className="mt-1 text-[11px] text-ds-muted">{manifest.outputs.length} 个输出 · {statusLabel(manifest.reviewStatus)} · {formatDate(manifest.finalizedAt)}</p>{manifest.validation.warnings.length ? <p className="mt-1 text-[10.5px] text-amber-700 dark:text-amber-300">已接受警告：{manifest.validation.warnings.length} 项</p> : null}</div></div></div>)}</div> : <p className="px-3 py-8 text-center text-[12px] text-ds-muted">尚无归档成果。</p>}</div></div><aside className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-3 py-3"><p className="text-[13px] font-semibold text-ds-ink">审批状态</p><p className="mt-1 text-[11px] text-ds-faint">当前项目修订 {overview.project.revision}</p></div><div className="space-y-3 px-3 py-4"><div className={`flex items-center gap-2 text-[12px] ${finalizationBlocked ? 'text-amber-800 dark:text-amber-200' : 'text-green-800 dark:text-green-300'}`}>{finalizationBlocked ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}<span>{finalizationBlocked ? '尚未满足归档门禁' : '已满足归档门禁'}</span></div><p className="text-[11px] leading-5 text-ds-muted">归档会生成新的 manifest.json、记录输出哈希、分析输入哈希、引用和人工处置状态。已归档成果不可原地改写。</p>{latestManifest ? <div className="border-t border-ds-border-muted pt-3"><p className="text-[10.5px] font-medium text-ds-faint">最近 manifest</p><p className="mt-1 break-all font-mono text-[10.5px] text-ds-ink">{latestManifest.id}</p></div> : null}</div></aside></div></div>
            </section> : null}
          </>}
        </main>
      </div>}
    </div>
    {busy ? <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center"><span className="inline-flex items-center gap-2 rounded-md border border-ds-border bg-ds-card px-3 py-2 text-[12px] text-ds-muted shadow-panel"><Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />Runtime 正在处理工程数据…</span></div> : null}
  </div>
}

function ReviewRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }): ReactElement {
  return <div className="flex gap-3 px-3 py-3"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}</span><div className="min-w-0"><p className="text-[12px] font-medium text-ds-ink">{label}</p><p className="mt-1 text-[11px] leading-4 text-ds-muted">{detail}</p></div></div>
}

export default EngineeringWorkspaceView
