import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Gauge,
  Image as ImageIcon,
  Lightbulb,
  MessageSquareText,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Sparkles,
  Upload,
  Zap
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { useChatStore } from '../../store/chat-store'
import { MessageTimeline } from '../chat/MessageTimeline'

type Project = {
  id: string
  name: string
  monitoringType: string
  unit: string
  revision: number
  reportPeriod: { start?: string; end?: string }
}
type Dataset = {
  sourceFileName: string
  observationCount: number
  status: string
  findings: Array<{ severity: 'blocking' | 'warning' | 'info'; status: string }>
}
type Analysis = { results: Array<{ thresholdStatus: string; anomaly: boolean }>; algorithmVersion: string }
type EvidenceCard = { id: string; kind: string; title: string; summary: string; sourceHash?: string; locator?: string }
type AiPlan = {
  id: string
  projectId: string
  contextHash: string
  revision: number
  goal: string
  status: string
  steps: Array<{ id: string; title: string; tool: string; risk: string; approval: string }>
  approval?: { token: string; stepIds: string[]; expiresAt: string }
}
type Props = {
  workspaceRoot: string
  runtimeReady: boolean
  project: Project | null
  dataset: Dataset | null
  analysis: Analysis | null
  latestRun?: { id: string; status: string } | null
  onCreateProject: () => void
  onImportData: () => void
  onOpenTab: (tab: 'project' | 'data' | 'quality' | 'survey' | 'analysis' | 'deliverables' | 'review' | 'skills') => void
  onRefresh: () => void
}
type PlanStep = { title: string; detail: string; state: 'ready' | 'active' | 'done' | 'blocked'; tool?: string }

function EngineeringAgentEmptyState({ project, runtimeReady, onCreateProject, onImportData, onOpenTab, onSelectSuggestion }: {
  project: Project | null
  runtimeReady: boolean
  onCreateProject: () => void
  onImportData: () => void
  onOpenTab: Props['onOpenTab']
  onSelectSuggestion: (value: string) => void
}): ReactElement {
  if (!project) {
    return <div className="flex min-h-full items-center justify-center px-6 py-12" data-testid="engineering-ai-empty-state"><div className="max-w-lg text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent"><Bot className="h-6 w-6" strokeWidth={1.7} /></span><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">工程 AI 工作区</p><h2 className="mt-2 text-[20px] font-semibold tracking-tight text-ds-ink">先选择一个工程项目</h2><p className="mx-auto mt-2 max-w-md text-[12.5px] leading-5 text-ds-muted">创建项目后，AI 会识别测量类型、绑定资料边界、生成可审批的执行计划，并把平差与监测结果回流到同一条证据链。</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={onCreateProject} disabled={!runtimeReady} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[11.5px] font-semibold text-white shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" />创建工程项目</button><button type="button" onClick={() => onOpenTab('survey')} disabled={!runtimeReady} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ds-border bg-ds-card px-3.5 text-[11.5px] font-medium text-ds-ink hover:bg-ds-hover disabled:cursor-not-allowed disabled:opacity-50"><Ruler className="h-3.5 w-3.5" />查看测量平差</button></div><div className="mt-6 grid gap-2 text-left sm:grid-cols-3"><div className="border border-ds-border-muted bg-ds-main px-3 py-2.5"><p className="text-[10.5px] font-medium text-ds-ink">AI 识别</p><p className="mt-1 text-[10px] leading-4 text-ds-muted">从工程目标识别网型、监测项和所需资料。</p></div><div className="border border-ds-border-muted bg-ds-main px-3 py-2.5"><p className="text-[10.5px] font-medium text-ds-ink">确定性计算</p><p className="mt-1 text-[10px] leading-4 text-ds-muted">平差、阈值和图表由 Runtime 工具完成。</p></div><div className="border border-ds-border-muted bg-ds-main px-3 py-2.5"><p className="text-[10.5px] font-medium text-ds-ink">证据回流</p><p className="mt-1 text-[10px] leading-4 text-ds-muted">每个结果绑定来源行、输入哈希和运行版本。</p></div></div></div></div>
  }

  return <div className="flex min-h-full items-center justify-center px-6 py-12" data-testid="engineering-ai-empty-state"><div className="w-full max-w-xl"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent"><Bot className="h-5 w-5" strokeWidth={1.7} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">工程 Agent 已就绪</p><h2 className="mt-1 text-[20px] font-semibold tracking-tight text-ds-ink">从一个工程目标开始</h2><p className="mt-1.5 max-w-lg text-[12px] leading-5 text-ds-muted">当前会话属于“{project.name}”。告诉 Agent 你要完成的测量、平差或监测交付，它会先给出 Typed Plan，再调用确定性工具。</p></div></div><div className="mt-6 grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => onSelectSuggestion('识别已导入资料的测量类型，检查字段、单位、基准和质量问题')} className="group border border-ds-border-muted bg-ds-main px-3 py-3 text-left transition hover:border-accent/50 hover:bg-accent/5"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-ds-ink"><Lightbulb className="h-3.5 w-3.5 text-accent" />识别并校核</span><span className="mt-1.5 block text-[10.5px] leading-4 text-ds-muted">先识别资料，再列出可修复的阻断项。</span></button><button type="button" onClick={() => onSelectSuggestion('对本期水准网或监测结果做趋势、异常和阈值分析')} className="group border border-ds-border-muted bg-ds-main px-3 py-3 text-left transition hover:border-accent/50 hover:bg-accent/5"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-ds-ink"><Activity className="h-3.5 w-3.5 text-accent" />分析异常</span><span className="mt-1.5 block text-[10.5px] leading-4 text-ds-muted">把异常测点、闭合差和阈值状态放回证据链。</span></button><button type="button" onClick={() => onSelectSuggestion('完成平差质量评定，并生成可审查的 DOCX、PDF、XLSX 和 manifest')} className="group border border-ds-border-muted bg-ds-main px-3 py-3 text-left transition hover:border-accent/50 hover:bg-accent/5"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-ds-ink"><ClipboardList className="h-3.5 w-3.5 text-accent" />准备成果</span><span className="mt-1.5 block text-[10.5px] leading-4 text-ds-muted">审批前由 Agent 汇总结果和缺资料提醒。</span></button></div><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ds-border-muted pt-4 text-[10.5px] text-ds-muted"><button type="button" onClick={onImportData} disabled={!runtimeReady} className="inline-flex h-8 items-center gap-1.5 border border-ds-border px-2.5 font-medium text-ds-ink hover:bg-ds-hover disabled:opacity-50"><Upload className="h-3.5 w-3.5" />导入 CSV / XLSX</button><button type="button" onClick={() => onOpenTab('survey')} disabled={!runtimeReady} className="inline-flex h-8 items-center gap-1.5 border border-ds-border px-2.5 font-medium text-ds-ink hover:bg-ds-hover disabled:opacity-50"><Ruler className="h-3.5 w-3.5" />打开测量平差</button><span className="ml-auto text-ds-faint">AI 不直接读取原始观测行</span></div></div></div>
}

function makePlan(project: Project | null, dataset: Dataset | null, analysis: Analysis | null): PlanStep[] {
  return [
    { title: '锁定项目边界', detail: project ? `项目、报告周期、单位和修订 ${project.revision}` : '创建或选择工程项目', state: project ? 'done' : 'blocked' },
    { title: '接收并识别资料', detail: dataset ? `${dataset.sourceFileName} · ${dataset.observationCount.toLocaleString('zh-CN')} 条观测` : '等待 CSV/XLSX 或测量网络文件', state: dataset ? 'done' : 'ready', tool: 'attachment-store' },
    { title: '质量校核与确定性计算', detail: analysis ? `${analysis.algorithmVersion} 已产出 ${analysis.results.length.toLocaleString('zh-CN')} 条结果` : '检查字段、单位、时间、闭合差和阈值', state: analysis ? 'done' : dataset ? 'active' : 'blocked', tool: 'railwise.*' },
    { title: '解释结果并形成证据', detail: 'AI 只写解释；每个数值绑定输入哈希、来源行和算法版本', state: analysis ? 'active' : 'blocked', tool: 'evidence-index' },
    { title: '人工审查与归档', detail: '阻断项清零，警告明确接受后生成不可覆盖的成果修订', state: 'ready', tool: 'review-gate' }
  ]
}

function StepIcon({ state }: { state: PlanStep['state'] }): ReactElement {
  if (state === 'done') return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"><Check className="h-3 w-3" /></span>
  if (state === 'blocked') return <span className="flex h-5 w-5 items-center justify-center rounded-full border border-ds-border-muted text-ds-faint"><span className="h-1.5 w-1.5 rounded-full bg-ds-faint" /></span>
  return <span className={`flex h-5 w-5 items-center justify-center rounded-full ${state === 'active' ? 'bg-accent text-white' : 'border border-accent/40 text-accent'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" /></span>
}

function readRuntimeMessage(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; code?: unknown }
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message
    if (typeof parsed.code === 'string' && parsed.code.trim()) return `${fallback}（${parsed.code}）`
  } catch {
    if (body.trim()) return body.trim()
  }
  return fallback
}

function phaseLabel(status: string): string {
  return ({ draft: '草案', validating: '校验中', awaiting_approval: '待审批', started: '已启动', queued: '排队中', running: '执行中', needs_attention: '需要处理', stale: '已过期', completed: '已完成', failed: '失败', cancelled: '已取消' } as Record<string, string>)[status] ?? status
}

function hashLabel(value?: string): string {
  if (!value) return '未生成'
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value
}

export function EngineeringAiCommandCenter({ workspaceRoot, runtimeReady, project, dataset, analysis, latestRun, onCreateProject, onImportData, onOpenTab, onRefresh }: Props): ReactElement {
  const { activeThreadId, threads, blocks, liveReasoning, liveAssistant, busy, runtimeConnection, runtimeErrorDetail, error, queuedMessages, sendMessage, removeQueuedMessage, interrupt } = useChatStore(useShallow((state) => ({
    activeThreadId: state.activeThreadId,
    threads: state.threads,
    blocks: state.blocks,
    liveReasoning: state.liveReasoning,
    liveAssistant: state.liveAssistant,
    busy: state.busy,
    runtimeConnection: state.runtimeConnection,
    runtimeErrorDetail: state.runtimeErrorDetail,
    error: state.error,
    queuedMessages: state.queuedMessages,
    sendMessage: state.sendMessage,
    removeQueuedMessage: state.removeQueuedMessage,
    interrupt: state.interrupt
  })))
  const activeThread = threads.find((thread) => thread.id === activeThreadId)
  const [goal, setGoal] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCard[]>([])
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [showPlan, setShowPlan] = useState(true)
  const projectId = project?.id ?? ''
  const connected = runtimeReady && runtimeConnection === 'ready'

  useEffect(() => { setNotice(null); setAiPlan(null) }, [projectId, activeThreadId])
  useEffect(() => {
    let cancelled = false
    if (!connected || !projectId) { setEvidenceCards([]); return }
    void rendererRuntimeClient.runtimeRequest(`/v1/engineering/ai/evidence/${encodeURIComponent(projectId)}`).then((response) => {
      if (cancelled || !response.ok) return
      try {
        const parsed = JSON.parse(response.body) as { cards?: EvidenceCard[] }
        setEvidenceCards(Array.isArray(parsed.cards) ? parsed.cards.slice(0, 8) : [])
      } catch { setEvidenceCards([]) }
    }).catch(() => { if (!cancelled) setEvidenceCards([]) })
    return () => { cancelled = true }
  }, [connected, projectId])

  const fallbackPlan = useMemo(() => makePlan(project, dataset, analysis), [analysis, dataset, project])
  const displayedPlan: PlanStep[] = aiPlan
    ? aiPlan.steps.map((step) => ({
      title: step.title,
      detail: `${step.tool} · ${step.risk === 'read' ? '只读' : '需要审批'} · ${step.approval === 'approved' ? '已批准' : '待批准'}`,
      state: step.approval === 'approved' ? 'done' : ['started', 'queued', 'running'].includes(aiPlan.status) ? 'active' : aiPlan.status === 'needs_attention' ? 'blocked' : 'ready',
      tool: step.tool
    }))
    : fallbackPlan
  const openFindings = dataset?.findings.filter((finding) => finding.status === 'open') ?? []
  const blockingCount = openFindings.filter((finding) => finding.severity === 'blocking').length
  const warningCount = openFindings.filter((finding) => finding.severity === 'warning').length
  const anomalyCount = analysis?.results.filter((result) => result.anomaly).length ?? 0
  const engineeringThreadActive = Boolean(activeThread && project && activeThread.domain === 'engineering' && activeThread.projectId === project.id)
  const timelineBlocks = engineeringThreadActive ? blocks : []
  const timelineThreadId = engineeringThreadActive ? activeThreadId : null
  const timelineLiveReasoning = engineeringThreadActive ? liveReasoning : ''
  const timelineLiveAssistant = engineeringThreadActive ? liveAssistant : ''
  const timelineHasActivity = timelineBlocks.length > 0 || busy || Boolean(timelineLiveReasoning || timelineLiveAssistant)
  const firstPendingStep = displayedPlan.findIndex((step) => step.state === 'active' || step.state === 'ready')
  const currentStepIndex = firstPendingStep < 0 ? displayedPlan.length : firstPendingStep
  const nextAction = !project ? { label: '创建工程项目', onClick: onCreateProject } : !dataset ? { label: '导入第一份数据', onClick: onImportData } : blockingCount > 0 ? { label: '查看质量问题', onClick: () => onOpenTab('quality') } : !analysis ? { label: '运行确定性分析', onClick: () => onOpenTab('analysis') } : { label: '检查成果门禁', onClick: () => onOpenTab('review') }
  const controlState = !project ? '待建立项目' : blockingCount > 0 ? '数据被阻断' : latestRun ? phaseLabel(latestRun.status) : dataset ? '等待执行' : '等待资料'
  const activeCapability = !project ? '工程项目上下文' : !dataset ? '资料识别与字段映射' : blockingCount > 0 ? '质量校核与问题定位' : !analysis ? '测量 / 监测确定性计算' : '结果解释与成果审查'

  const sendGoal = async (): Promise<void> => {
    const prompt = goal.trim()
    if (!prompt) return
    if (!connected) { setNotice('Runtime 尚未连接。目标和附件会保留，连接后可继续。'); return }
    if (!project) { setNotice('先创建工程项目，AI 才能绑定坐标/单位、阈值和成果目录。'); return }
    if (!engineeringThreadActive || !activeThreadId) { setNotice('正在准备当前项目的独立工程会话，请稍候。'); return }
    setSending(true); setPlanBusy(true); setNotice(null)
    try {
      const idempotencyKey = `engineering-plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const draftResponse = await rendererRuntimeClient.runtimeRequest('/v1/engineering/ai/plans', 'POST', JSON.stringify({ threadId: activeThreadId, projectId: project.id, goal: prompt, idempotencyKey }))
      if (!draftResponse.ok) throw new Error(readRuntimeMessage(draftResponse.body, '工程 AI 计划生成失败'))
      const drafted = JSON.parse(draftResponse.body) as { plan: AiPlan; approval: AiPlan['approval'] }
      setAiPlan({ ...drafted.plan, approval: drafted.approval })
      const context = [`当前工程项目：${project.name}（${project.monitoringType}，单位 ${project.unit}，修订 ${project.revision}）`, '你是 WorkWise 工程 AI 协调者。Runtime 已生成可审查 Typed Run Plan；你只能解释、追问和汇总，不得猜测阈值或改写确定性分析结果。', `工程目标：${prompt}`, `计划编号：${drafted.plan.id}（修订 ${drafted.plan.revision}）`].join('\n')
      if (await sendMessage(context, 'agent')) setGoal('')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)) } finally { setPlanBusy(false); setSending(false); onRefresh() }
  }

  const approveAndStartPlan = async (): Promise<void> => {
    if (!aiPlan?.approval || !connected) return
    setPlanBusy(true)
    try {
      const approvedResponse = await rendererRuntimeClient.runtimeRequest(`/v1/engineering/ai/plans/${encodeURIComponent(aiPlan.id)}/approve`, 'POST', JSON.stringify({ expectedRevision: aiPlan.revision, contextHash: aiPlan.contextHash, stepIds: aiPlan.approval.stepIds, token: aiPlan.approval.token, idempotencyKey: `engineering-approve-${Date.now()}` }))
      if (!approvedResponse.ok) throw new Error(readRuntimeMessage(approvedResponse.body, '工程 AI 计划审批失败'))
      const approved = JSON.parse(approvedResponse.body) as AiPlan
      const startedResponse = await rendererRuntimeClient.runtimeRequest(`/v1/engineering/ai/plans/${encodeURIComponent(aiPlan.id)}/start`, 'POST', JSON.stringify({ expectedRevision: approved.revision, contextHash: approved.contextHash, idempotencyKey: `engineering-start-${Date.now()}` }))
      if (!startedResponse.ok) throw new Error(readRuntimeMessage(startedResponse.body, '工程 AI 任务启动失败'))
      const started = JSON.parse(startedResponse.body) as { plan: AiPlan }
      setAiPlan({ ...started.plan, approval: undefined })
      setNotice('计划已通过唯一 TaskRun 启动，执行事件会回到当前工程会话。')
      onRefresh()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : String(cause)) } finally { setPlanBusy(false) }
  }

  return (
    <div className="engineering-workspace engineering-agent-surface flex min-h-full min-w-0 flex-col bg-ds-main text-ds-ink">
      <header className="engineering-agent-header shrink-0 border-b border-ds-border-muted bg-ds-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="engineering-agent-mark flex h-10 w-10 shrink-0 items-center justify-center border border-accent/40 bg-transparent text-accent"><Bot className="h-5 w-5" strokeWidth={1.8} /></span>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">WorkWise Runtime</p><span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent"><Sparkles className="h-3 w-3" />工程 Agent</span></div><h1 className="mt-1 text-[21px] font-semibold tracking-tight">工程 AI 指挥台</h1><p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-ds-muted">把工程目标交给 AI，结果留在证据链里。AI 负责理解任务、拆解计划和解释结果；导入、平差、阈值、图表与成果由同一个 Runtime 的确定性工具完成。</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${connected ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-600' : 'bg-amber-500'}`} />{connected ? 'Runtime 在线' : 'Runtime 等待连接'}</span>{project ? <span className="max-w-[200px] truncate border-l border-ds-border-muted pl-2.5 text-[11px] text-ds-muted">{project.name}</span> : null}</div>
        </div>
      </header>

      {error ? <div role="alert" className="mx-4 mt-3 flex items-start gap-2 border border-red-300/50 bg-red-50 px-3 py-2.5 text-[12px] text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0">{error}{runtimeErrorDetail ? ` · ${runtimeErrorDetail}` : ''}</span></div> : null}
      {notice ? <div role="status" className="mx-4 mt-3 flex items-start gap-2 border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="关闭提示" className="text-current/60 hover:text-current">×</button></div> : null}

      <section className="engineering-command-strip engineering-agent-command-strip mx-3 mt-3 grid shrink-0 gap-px border border-ds-border-muted bg-ds-border-muted sm:grid-cols-[minmax(0,1.4fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto]" aria-label="工程 Agent 状态">
        <div className="bg-ds-card px-3.5 py-2.5"><p className="engineering-eyebrow">当前任务</p><p className="mt-1 truncate text-[12px] font-semibold text-ds-ink">{project?.name ?? '尚未绑定工程项目'}</p><p className="mt-0.5 truncate text-[10.5px] text-ds-muted">{project ? `${project.monitoringType} · ${project.unit} · 修订 ${project.revision}` : '先建立项目，Agent 才能绑定资料与成果边界'}</p></div>
        <div className="bg-ds-card px-3.5 py-2.5"><p className="engineering-eyebrow">Agent 正在做</p><p className="mt-1 truncate text-[11.5px] font-medium text-ds-ink">{activeCapability}</p><p className="mt-0.5 text-[10px] text-ds-faint">自然语言 → Typed Plan → 工具</p></div>
        <div className="bg-ds-card px-3.5 py-2.5"><p className="engineering-eyebrow">运行门禁</p><p className={`mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold ${blockingCount ? 'text-red-700 dark:text-red-300' : controlState === '需要处理' ? 'text-amber-700 dark:text-amber-300' : 'text-ds-ink'}`}><Gauge className="h-3.5 w-3.5" />{controlState}</p><p className="mt-0.5 text-[10px] text-ds-faint">{blockingCount ? `${blockingCount} 个阻断项需人工处理` : '数值由确定性 Runtime 生成'}</p></div>
        <button type="button" onClick={nextAction.onClick} disabled={!runtimeReady} className="engineering-command-action inline-flex min-h-[68px] items-center justify-center gap-1.5 bg-accent px-3.5 text-[11px] font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">{nextAction.label}<ArrowRight className="h-3.5 w-3.5" /></button>
      </section>

      <section className="engineering-agent-runbook shrink-0 border-b border-ds-border-muted px-4 py-3 sm:px-6" aria-label="工程 Agent 执行协议">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
          <span className="font-semibold text-ds-ink">Agent 执行协议</span>
          <span className="inline-flex items-center gap-1.5 text-ds-muted"><span className="font-mono text-[10px] text-accent">01</span>理解工程目标</span>
          <ArrowRight className="h-3 w-3 text-ds-faint" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 text-ds-muted"><span className="font-mono text-[10px] text-accent">02</span>生成可审批计划</span>
          <ArrowRight className="h-3 w-3 text-ds-faint" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 text-ds-muted"><span className="font-mono text-[10px] text-accent">03</span>调用确定性工具</span>
          <ArrowRight className="h-3 w-3 text-ds-faint" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5 text-ds-muted"><span className="font-mono text-[10px] text-accent">04</span>回流证据并请求复核</span>
          <span className="ml-auto text-[10px] text-ds-faint">AI 不代替测量软件，不猜测缺失资料</span>
        </div>
      </section>

      <div className="engineering-agent-grid grid min-h-0 flex-1 gap-3 p-3 sm:p-4 xl:grid-cols-[216px_minmax(0,1fr)_284px]">
        <aside className="engineering-agent-stage min-h-0 border border-ds-border-muted bg-ds-card" aria-label="工程 Agent 运行阶段">
          <div className="border-b border-ds-border-muted px-3.5 py-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ds-faint">当前工程上下文</p><p className="mt-1 truncate text-[13px] font-semibold text-ds-ink">{project?.name ?? '尚未选择项目'}</p><p className="mt-1 text-[10.5px] leading-4 text-ds-muted">{project ? `${project.monitoringType} · ${project.unit} · 修订 ${project.revision}` : '创建项目后，AI 会绑定资料边界'}</p></div>
           <div className="border-b border-ds-border-muted px-3.5 py-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-ds-ink">执行路径</p><span className="text-[10px] tabular-nums text-ds-faint">{currentStepIndex >= displayedPlan.length ? displayedPlan.length : currentStepIndex + 1}/{displayedPlan.length}</span></div><div className="mt-3 space-y-0">{displayedPlan.map((step, index) => <div key={`${step.title}-${index}`} className="relative flex gap-2.5 pb-3 last:pb-0"><span className="relative z-10 shrink-0"><StepIcon state={index < currentStepIndex && step.state !== 'blocked' ? 'done' : step.state} /></span>{index < displayedPlan.length - 1 ? <span className="absolute left-[9px] top-5 h-[calc(100%-10px)] w-px bg-ds-border-muted" /> : null}<div className="min-w-0"><p className={`text-[11px] font-medium ${step.state === 'blocked' ? 'text-ds-muted' : 'text-ds-ink'}`}>{step.title}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-ds-muted">{step.detail}</p>{step.tool ? <p className="mt-1 font-mono text-[9px] text-ds-faint">{step.tool}</p> : null}</div></div>)}</div></div>
          <div className="p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ds-faint">Agent 规则</p><ul className="mt-2 space-y-2 text-[10.5px] leading-4 text-ds-muted"><li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />不猜阈值，不改写数值</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />工具结果带哈希和来源</li><li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />有风险的步骤先征得审批</li></ul></div>
        </aside>

        <main className="engineering-agent-conversation flex min-h-0 min-w-0 flex-col overflow-hidden border border-ds-border-muted bg-ds-card">
          <div className="flex shrink-0 items-center justify-between border-b border-ds-border-muted px-4 py-3"><div className="flex min-w-0 items-center gap-2"><MessageSquareText className="h-4 w-4 shrink-0 text-accent" /><div className="min-w-0"><p className="text-[13px] font-semibold">工程 AI 会话</p><p className="truncate text-[10.5px] text-ds-faint">{engineeringThreadActive && activeThread ? `${activeThread.title} · ${activeThread.messageCount ?? timelineBlocks.length} 条消息` : '正在准备当前项目的独立会话'}</p></div></div><button type="button" onClick={() => void onRefresh()} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10.5px] text-ds-muted hover:bg-ds-hover hover:text-ds-ink"><RefreshCw className="h-3 w-3" />刷新上下文</button></div>
          <div className="min-h-[280px] flex-1 overflow-y-auto">
            {engineeringThreadActive && timelineHasActivity ? <MessageTimeline blocks={timelineBlocks} liveReasoning={timelineLiveReasoning} live={timelineLiveAssistant} activeThreadId={timelineThreadId} runtimeConnection={runtimeConnection} runtimeError={error} onRetryConnection={() => void useChatStore.getState().probeRuntime('user')} onOpenSettings={() => useChatStore.getState().openSettings('agents')} onSelectSuggestion={setGoal} /> : <EngineeringAgentEmptyState project={project} runtimeReady={runtimeReady} onCreateProject={onCreateProject} onImportData={onImportData} onOpenTab={onOpenTab} onSelectSuggestion={setGoal} />}
          </div>
          <div className="shrink-0 border-t border-ds-border-muted bg-ds-main p-3.5"><div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-ds-faint"><span className="inline-flex items-center gap-1 rounded-full border border-ds-border-muted bg-ds-card px-2 py-1"><Paperclip className="h-3 w-3" />附件由 Attachment Store 托管</span><span className="inline-flex items-center gap-1 rounded-full border border-ds-border-muted bg-ds-card px-2 py-1"><ShieldAlert className="h-3 w-3" />模型只接收摘要和证据索引</span></div><label className="sr-only" htmlFor="engineering-goal">告诉工程 AI 你要完成什么</label><textarea id="engineering-goal" value={goal} onChange={(event) => setGoal(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void sendGoal() }} placeholder={project ? '描述目标：例如“对本期水准网做严密平差，找出粗差并准备审查报告”。' : '先创建工程项目，再描述目标。'} className="min-h-[86px] w-full resize-y rounded-lg border border-ds-border bg-ds-card px-3.5 py-3 text-[13px] leading-5 text-ds-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setGoal('识别这份数据的测量类型，检查字段、单位和质量问题')} className="inline-flex items-center gap-1 rounded-md border border-ds-border-muted bg-ds-card px-2.5 py-1.5 text-[10.5px] text-ds-muted hover:border-accent/40 hover:text-accent"><Lightbulb className="h-3 w-3" />识别并校核</button><button type="button" onClick={() => setGoal('对本期和上期结果做趋势与阈值分析，标记需要复核的测点')} className="inline-flex items-center gap-1 rounded-md border border-ds-border-muted bg-ds-card px-2.5 py-1.5 text-[10.5px] text-ds-muted hover:border-accent/40 hover:text-accent"><Activity className="h-3 w-3" />分析异常</button><button type="button" onClick={() => setGoal('完成平差质量评定，并生成可审查的成果预览')} className="inline-flex items-center gap-1 rounded-md border border-ds-border-muted bg-ds-card px-2.5 py-1.5 text-[10.5px] text-ds-muted hover:border-accent/40 hover:text-accent"><ClipboardList className="h-3 w-3" />准备成果</button></div><button type="button" onClick={() => void sendGoal()} disabled={sending || busy || !goal.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[11.5px] font-semibold text-white shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-3.5 w-3.5" />{sending || busy ? '生成计划…' : '交给工程 AI'}</button></div>{queuedMessages.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ds-muted"><span>排队中：</span>{queuedMessages.map((item) => <button key={item.id} type="button" onClick={() => removeQueuedMessage(item.id)} className="max-w-[240px] truncate border border-ds-border-muted bg-ds-card px-2 py-1 hover:border-red-300 hover:text-red-700" title="点击移除排队消息">{item.text}</button>)}</div> : null}{busy && engineeringThreadActive ? <button type="button" onClick={() => void interrupt()} className="mt-2 text-[10.5px] text-amber-700 hover:underline dark:text-amber-300">停止当前回合</button> : null}</div>
        </main>

        <aside className="engineering-agent-inspector min-h-0 space-y-3 overflow-y-auto" aria-label="工程 Copilot 证据检查器">
          <section className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-3.5 py-3"><div className="flex items-center justify-between gap-2"><div><p className="text-[12.5px] font-semibold">Copilot 检查器</p><p className="mt-0.5 text-[10.5px] text-ds-faint">AI 的下一步和可验证证据</p></div><Zap className="h-4 w-4 text-accent" /></div></div>{project ? <div className="space-y-3 p-3.5"><div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10.5px]"><div><p className="text-ds-faint">观测记录</p><p className="mt-0.5 tabular-nums text-[16px] font-semibold text-ds-ink">{dataset?.observationCount.toLocaleString('zh-CN') ?? '—'}</p></div><div><p className="text-ds-faint">异常线索</p><p className={`mt-0.5 tabular-nums text-[16px] font-semibold ${anomalyCount ? 'text-amber-700 dark:text-amber-300' : 'text-ds-ink'}`}>{anomalyCount}</p></div><div><p className="text-ds-faint">阻断 / 警告</p><p className={`mt-0.5 tabular-nums text-[16px] font-semibold ${blockingCount ? 'text-red-700 dark:text-red-300' : 'text-ds-ink'}`}>{blockingCount} / {warningCount}</p></div><div><p className="text-ds-faint">最近运行</p><p className="mt-0.5 truncate text-[11px] font-medium text-ds-ink">{latestRun ? phaseLabel(latestRun.status) : '未开始'}</p></div></div><div className="border-t border-ds-border-muted pt-3"><p className="text-[10.5px] font-medium text-ds-ink">建议下一步</p><p className="mt-1 text-[10.5px] leading-4 text-ds-muted">{!dataset ? '先导入数据，AI 才能引用真实观测和来源行号。' : blockingCount ? '先处理阻断项；当前不允许把不完整数据送入分析。' : !analysis ? '完成确定性分析，AI 才能解释趋势和阈值。' : '检查证据和审查门禁，确认后再归档成果。'}</p><button type="button" onClick={nextAction.onClick} disabled={!runtimeReady} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-50">{nextAction.label}<ArrowRight className="h-3.5 w-3.5" /></button></div></div> : <div className="p-3.5"><div className="flex gap-2 text-[11px] leading-4 text-ds-muted"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><p>工程 Agent 需要一个项目上下文，才能把自然语言目标绑定到确定性工具。</p></div><button type="button" onClick={onCreateProject} disabled={!runtimeReady} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />创建项目</button></div>}</section>

          <section className="border border-ds-border-muted bg-ds-card"><div className="flex items-center justify-between border-b border-ds-border-muted px-3.5 py-3"><div><p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><ClipboardList className="h-4 w-4 text-accent" />Typed Plan</p><p className="mt-0.5 text-[10.5px] text-ds-faint">先审查，再让 TaskRun 执行</p></div><button type="button" onClick={() => setShowPlan((value) => !value)} className="text-[10.5px] font-medium text-accent">{showPlan ? '收起' : '展开'}</button></div>{showPlan ? <div className="divide-y divide-ds-border-muted">{displayedPlan.map((step, index) => <div key={`${step.title}-${index}`} className="px-3.5 py-2.5"><div className="flex items-start gap-2"><span className="mt-0.5"><StepIcon state={step.state} /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-ds-ink">{step.title}</p><span className="text-[9.5px] text-ds-faint">{step.state === 'done' ? '完成' : step.state === 'active' ? '当前' : step.state === 'blocked' ? '等待' : '下一步'}</span></div><p className="mt-0.5 text-[10px] leading-4 text-ds-muted">{step.detail}</p></div></div></div>)}</div> : null}{aiPlan ? <div className="border-t border-ds-border-muted px-3.5 py-3"><p className="font-mono text-[9.5px] text-ds-faint">{aiPlan.id} · context {hashLabel(aiPlan.contextHash)} · {phaseLabel(aiPlan.status)}</p>{aiPlan.status === 'awaiting_approval' && aiPlan.approval ? <button type="button" onClick={() => void approveAndStartPlan()} disabled={planBusy || !connected} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />审批并启动</button> : null}</div> : null}</section>

          {evidenceCards.length > 0 ? <section className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-3.5 py-3"><p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><FileCheck2 className="h-4 w-4 text-accent" />证据回流</p><p className="mt-0.5 text-[10.5px] text-ds-faint">不是模型的猜测，而是 Runtime 的结构化结果</p></div><div className="divide-y divide-ds-border-muted">{evidenceCards.map((card) => <div key={card.id} className="px-3.5 py-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-medium text-ds-ink">{card.title}</span><span className="shrink-0 border border-ds-border-muted px-1.5 py-0.5 text-[9px] text-ds-faint">{card.kind}</span></div><p className="mt-1 text-[10px] leading-4 text-ds-muted">{card.summary}</p><div className="mt-1 flex items-center gap-2 text-[9px] text-ds-faint"><span>{card.locator ?? '来源定位待补'}</span>{card.sourceHash ? <span className="font-mono">{hashLabel(card.sourceHash)}</span> : null}</div></div>)}</div></section> : null}

          <section className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-3.5 py-3"><p className="text-[12.5px] font-semibold">可用资料入口</p><p className="mt-0.5 text-[10.5px] text-ds-faint">输入是证据，AI 只使用受控摘要</p></div><div className="space-y-2 p-3"><button type="button" onClick={onImportData} className="flex w-full items-center gap-2 border border-dashed border-ds-border-muted bg-ds-main px-2.5 py-2.5 text-left text-[10.5px] text-ds-muted hover:border-accent/50 hover:text-accent"><Upload className="h-4 w-4 shrink-0" /><span><span className="block font-medium text-ds-ink">导入 CSV / XLSX</span><span className="mt-0.5 block">字段映射、单位和源行会保留在证据链。</span></span></button><button type="button" onClick={() => onOpenTab('survey')} className="flex w-full items-center gap-2 border border-ds-border-muted bg-ds-main px-2.5 py-2.5 text-left text-[10.5px] text-ds-muted hover:border-accent/50 hover:text-accent"><Paperclip className="h-4 w-4 shrink-0" /><span><span className="block font-medium text-ds-ink">测量网络 / 平差</span><span className="mt-0.5 block">打开专业观测表、网形和精度面板。</span></span></button><div className="flex items-start gap-2 border border-ds-border-muted bg-ds-main px-2.5 py-2.5 text-left text-[10.5px] text-ds-muted"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span><span className="block font-medium text-ds-ink">现场图片</span><span className="mt-0.5 block">只作为线索，不能改写工程数值。</span></span></div></div></section>
          <p className="px-1 text-[10px] leading-4 text-ds-faint">工作目录：{workspaceRoot}。工程线程、审批和成果修订与编程、写作、Design 分开保存。</p>
        </aside>
      </div>
    </div>
  )
}
