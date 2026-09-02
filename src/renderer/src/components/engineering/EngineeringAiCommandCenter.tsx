import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Image as ImageIcon,
  MessageSquareText,
  Paperclip,
  Play,
  Plus,
  Upload,
  XCircle
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
  taskId?: string
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
  onOpenTab: (tab: 'project' | 'data' | 'quality' | 'analysis' | 'deliverables' | 'review') => void
  onRefresh: () => void
}
type PlanStep = { title: string; detail: string; state: 'ready' | 'active' | 'done' | 'blocked' }

function makePlan(project: Project | null, dataset: Dataset | null, analysis: Analysis | null): PlanStep[] {
  return [
    { title: '理解工程目标', detail: project ? `锁定项目“${project.name}”、报告周期和监测类型` : '创建或选择一个工程项目', state: project ? 'done' : 'blocked' },
    { title: '读取资料与数据边界', detail: dataset ? `${dataset.sourceFileName} · ${dataset.observationCount.toLocaleString('zh-CN')} 条观测` : '等待 CSV/XLSX 或现场图片资料', state: dataset ? 'done' : 'ready' },
    { title: '调用确定性工程工具', detail: analysis ? `已运行 ${analysis.algorithmVersion}，AI 只解释结果` : '质量校核、趋势、异常和阈值判定', state: analysis ? 'done' : dataset ? 'ready' : 'blocked' },
    { title: '形成证据与交付草案', detail: '将每个关键数值绑定到源文件哈希、行号和引用', state: analysis ? 'ready' : 'blocked' },
    { title: '人工审查后归档', detail: '阻断项清零，警告由人工确认后生成成果', state: 'ready' }
  ]
}

function StepIcon({ state }: { state: PlanStep['state'] }): ReactElement {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-300" />
  if (state === 'blocked') return <XCircle className="h-4 w-4 text-ds-faint" />
  return <span className="h-2 w-2 rounded-full bg-accent" />
}

function Stat({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'good' | 'warn' | 'danger' }): ReactElement {
  const toneClass = tone === 'good' ? 'border-l-green-600' : tone === 'warn' ? 'border-l-amber-500' : tone === 'danger' ? 'border-l-red-600' : 'border-l-accent'
  return <div className={`border border-ds-border-muted border-l-[3px] bg-ds-card px-3 py-2.5 ${toneClass}`}><p className="text-[10.5px] text-ds-muted">{label}</p><p className="mt-0.5 tabular-nums text-[21px] font-semibold text-ds-ink">{value}</p><p className="mt-0.5 truncate text-[10.5px] text-ds-faint">{detail}</p></div>
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
  const [showPlan, setShowPlan] = useState(true)
  const [evidenceCards, setEvidenceCards] = useState<EvidenceCard[]>([])
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null)
  const [planBusy, setPlanBusy] = useState(false)
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
        setEvidenceCards(Array.isArray(parsed.cards) ? parsed.cards.slice(0, 6) : [])
      } catch { setEvidenceCards([]) }
    }).catch(() => { if (!cancelled) setEvidenceCards([]) })
    return () => { cancelled = true }
  }, [connected, projectId])

  const plan = useMemo(() => makePlan(project, dataset, analysis), [analysis, dataset, project])
  const displayedPlan: PlanStep[] = aiPlan
    ? aiPlan.steps.map((step) => ({
      title: step.title,
      detail: `${step.tool} · ${step.risk === 'read' ? '只读' : '需要审批'} · ${step.approval === 'approved' ? '已批准' : '待批准'}`,
      state: step.approval === 'approved' ? 'done' : aiPlan.status === 'started' ? 'active' : 'ready'
    }))
    : plan
  const openFindings = dataset?.findings.filter((finding) => finding.status === 'open') ?? []
  const blockingCount = openFindings.filter((finding) => finding.severity === 'blocking').length
  const warningCount = openFindings.filter((finding) => finding.severity === 'warning').length
  const anomalyCount = analysis?.results.filter((result) => result.anomaly).length ?? 0
  const engineeringThreadActive = Boolean(activeThread && project && activeThread.domain === 'engineering' && activeThread.projectId === project.id)
  const timelineBlocks = engineeringThreadActive ? blocks : []
  const timelineThreadId = engineeringThreadActive ? activeThreadId : null
  const timelineLiveReasoning = engineeringThreadActive ? liveReasoning : ''
  const timelineLiveAssistant = engineeringThreadActive ? liveAssistant : ''

  const sendGoal = async (): Promise<void> => {
    const prompt = goal.trim()
    if (!prompt) return
    if (!connected) { setNotice('请先连接 Runtime。输入内容会保留，连接后可继续发送。'); return }
    if (!project) { setNotice('请先创建工程项目，AI 才能绑定项目、阈值和资料边界。'); return }
    if (!engineeringThreadActive || !activeThreadId) { setNotice('正在准备当前项目的工程 AI 会话，请稍候再发送。'); return }
    setSending(true)
    setNotice(null)
    try {
      setPlanBusy(true)
      const idempotencyKey = `engineering-plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const draftResponse = await rendererRuntimeClient.runtimeRequest('/v1/engineering/ai/plans', 'POST', JSON.stringify({ threadId: activeThreadId, projectId: project.id, goal: prompt, idempotencyKey }))
      if (!draftResponse.ok) throw new Error(readRuntimeMessage(draftResponse.body, '工程 AI 计划生成失败'))
      const drafted = JSON.parse(draftResponse.body) as { plan: AiPlan; approval: AiPlan['approval'] }
      setAiPlan({ ...drafted.plan, approval: drafted.approval })
      const context = [`当前工程项目：${project.name}（${project.monitoringType}，单位 ${project.unit}，修订 ${project.revision}）`, '你是 WorkWise 工程 AI 协调者。Runtime 已生成可审查 Typed Run Plan；你只能解释、追问和汇总，不得猜测阈值或改写确定性分析结果。', `工程目标：${prompt}`, `计划编号：${drafted.plan.id}（修订 ${drafted.plan.revision}）`].join('\n')
      const sent = await sendMessage(context, 'agent')
      if (sent) setGoal('')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPlanBusy(false)
      setSending(false)
      onRefresh()
    }
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
      setNotice('工程 AI 已通过唯一 TaskRun 启动，进度会回到当前会话时间线。')
      onRefresh()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPlanBusy(false)
    }
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col bg-ds-main text-ds-ink">
      <header className="border-b border-ds-border-muted bg-ds-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent"><Bot className="h-5 w-5" strokeWidth={1.7} /></span>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">AI engineering command</p><span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">WorkWise Runtime · 单一会话</span></div><h1 className="mt-1 text-[20px] font-semibold tracking-normal">工程 AI 指挥台</h1><p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-ds-muted">当前项目使用 WorkWise 的真实消息时间线、附件边界和 Runtime 事件。AI 负责理解、追问与解释；数值、阈值、图表和成果由确定性工具提供。</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${connected ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}><span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-600' : 'bg-amber-500'}`} />{connected ? 'AI Runtime 已连接' : '等待 Runtime'}</span>{project ? <span className="max-w-[180px] truncate rounded-full border border-ds-border-muted px-2.5 py-1 text-[11px] text-ds-muted">{project.name}</span> : null}</div>
        </div>
      </header>

      {error ? <div role="alert" className="mx-4 mt-3 flex items-start gap-2 border border-red-300/50 bg-red-50 px-3 py-2.5 text-[12px] text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0">{error}{runtimeErrorDetail ? ` · ${runtimeErrorDetail}` : ''}</span></div> : null}
      {notice ? <div role="alert" className="mx-4 mt-3 flex items-start gap-2 border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div> : null}

      <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="flex min-w-0 flex-col gap-4">
          <section className="flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden border border-ds-border-muted bg-ds-card">
            <div className="flex items-center justify-between border-b border-ds-border-muted px-4 py-3"><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-accent" /><div><p className="text-[13px] font-semibold">工程 AI 会话</p><p className="mt-0.5 text-[11px] text-ds-faint">{engineeringThreadActive && activeThread ? `${activeThread.title} · ${activeThread.messageCount ?? timelineBlocks.length} 条消息` : '正在准备当前项目的独立会话'}</p></div></div><span className="text-[11px] text-ds-faint">消息、审批和工具事件均来自 ChatState</span></div>
            <div className="min-h-0 flex-1"><MessageTimeline blocks={timelineBlocks} liveReasoning={timelineLiveReasoning} live={timelineLiveAssistant} activeThreadId={timelineThreadId} runtimeConnection={runtimeConnection} runtimeError={error} onRetryConnection={() => void useChatStore.getState().probeRuntime('user')} onOpenSettings={() => useChatStore.getState().openSettings('agents')} onSelectSuggestion={setGoal} /></div>
            <div className="border-t border-ds-border-muted bg-ds-main p-3"><textarea value={goal} onChange={(event) => setGoal(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void sendGoal() }} placeholder={project ? '告诉工程 AI 你要完成什么，例如：找出超过预警阈值的测点并准备报告预览。' : '先创建工程项目，再向 AI 描述目标。'} className="min-h-[76px] w-full resize-y rounded-xl border border-ds-border bg-ds-card px-3.5 py-3 text-[13px] leading-5 text-ds-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setGoal('导入本期监测数据并解释异常')} className="rounded-full border border-ds-border-muted bg-ds-subtle px-2.5 py-1 text-[10.5px] text-ds-muted hover:border-accent/40 hover:text-accent">解释异常</button><button type="button" onClick={() => setGoal('对比本期和上期数据，找出超过预警阈值的测点')} className="rounded-full border border-ds-border-muted bg-ds-subtle px-2.5 py-1 text-[10.5px] text-ds-muted hover:border-accent/40 hover:text-accent">对比阈值</button><span className="inline-flex items-center gap-1 px-1 text-[10.5px] text-ds-faint"><Paperclip className="h-3.5 w-3.5" />附件由 Store 托管</span></div><button type="button" onClick={() => void sendGoal()} disabled={sending || busy || !goal.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[11.5px] font-semibold text-white shadow-sm hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-3.5 w-3.5" />{sending || busy ? 'AI 正在处理…' : '发送目标'}</button></div>{queuedMessages.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-ds-muted"><span>排队中：</span>{queuedMessages.map((item) => <button key={item.id} type="button" onClick={() => removeQueuedMessage(item.id)} className="max-w-[220px] truncate rounded-full border border-ds-border-muted px-2 py-0.5 hover:border-red-300 hover:text-red-700" title="点击移除排队消息">{item.text}</button>)}</div> : null}{busy && engineeringThreadActive ? <button type="button" onClick={() => void interrupt()} className="mt-2 text-[10.5px] text-amber-700 hover:underline dark:text-amber-300">停止当前回合</button> : null}</div>
          </section>

          <section className="border border-ds-border-muted bg-ds-card"><div className="flex items-center justify-between border-b border-ds-border-muted px-4 py-3"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-accent" /><div><p className="text-[13px] font-semibold">AI 计划与交付阶段</p><p className="mt-0.5 text-[11px] text-ds-faint">{aiPlan ? `Typed Plan ${aiPlan.id} · 修订 ${aiPlan.revision} · ${aiPlan.status}` : '输入目标后先生成可审查计划，再通过唯一 TaskRun 执行。'}</p></div></div><div className="flex items-center gap-3"><button type="button" onClick={() => setShowPlan((value) => !value)} className="text-[11px] font-medium text-accent">{showPlan ? '收起' : '展开'}</button>{aiPlan?.status === 'awaiting_approval' && aiPlan.approval ? <button type="button" onClick={() => void approveAndStartPlan()} disabled={planBusy || !connected} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-[10.5px] font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />审批并启动</button> : null}</div></div>{showPlan ? <div className="divide-y divide-ds-border-muted">{displayedPlan.map((step, index) => <div key={`${step.title}-${index}`} className="flex items-start gap-3 px-4 py-2.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ds-subtle text-[11px] font-semibold tabular-nums text-ds-muted">{index + 1}</span><span className="mt-1 shrink-0"><StepIcon state={step.state} /></span><div className="min-w-0 flex-1"><p className={`text-[12px] font-medium ${step.state === 'blocked' ? 'text-ds-muted' : 'text-ds-ink'}`}>{step.title}</p><p className="mt-0.5 text-[11px] leading-4 text-ds-muted">{step.detail}</p></div><span className="mt-0.5 text-[10.5px] text-ds-faint">{step.state === 'done' ? '已完成' : step.state === 'blocked' ? '等待输入' : step.state === 'active' ? '执行中' : '待执行'}</span></div>)}</div> : null}</section>
        </main>

        <aside className="min-w-0 space-y-4"><section className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-4 py-3"><p className="text-[13px] font-semibold">工程 Copilot 上下文</p><p className="mt-1 text-[11px] leading-4 text-ds-faint">上下文只包含项目修订、数据摘要和证据索引，不把原始大表逐行塞给模型。</p></div>{project ? <div className="space-y-3 p-4"><div><p className="text-[11px] text-ds-muted">当前项目</p><p className="mt-1 truncate text-[14px] font-semibold text-ds-ink">{project.name}</p><p className="mt-0.5 text-[11px] text-ds-faint">{project.monitoringType} · {project.unit} · 修订 {project.revision}</p></div><div className="grid grid-cols-2 gap-2"><Stat label="观测记录" value={dataset ? dataset.observationCount.toLocaleString('zh-CN') : '—'} detail={dataset?.sourceFileName ?? '未导入'} /><Stat label="待处理" value={`${blockingCount + warningCount}`} detail={`${blockingCount} 阻断 · ${warningCount} 警告`} tone={blockingCount ? 'danger' : warningCount ? 'warn' : 'good'} /><Stat label="异常线索" value={`${anomalyCount}`} detail={analysis ? '确定性分析' : '尚未分析'} tone={anomalyCount ? 'warn' : 'neutral'} /><Stat label="运行状态" value={latestRun?.status ?? '—'} detail={latestRun?.id ?? '尚未运行'} /></div><div className="flex flex-wrap gap-2 border-t border-ds-border-muted pt-3"><button type="button" onClick={() => onOpenTab('project')} className="inline-flex items-center gap-1 rounded-md border border-ds-border-muted px-2.5 py-1.5 text-[11px] font-medium text-ds-muted hover:border-accent/40 hover:text-accent">配置阈值 <ArrowRight className="h-3 w-3" /></button><button type="button" onClick={() => onOpenTab('review')} className="inline-flex items-center gap-1 rounded-md border border-ds-border-muted px-2.5 py-1.5 text-[11px] font-medium text-ds-muted hover:border-accent/40 hover:text-accent">打开审查 <ArrowRight className="h-3 w-3" /></button></div></div> : <div className="p-4"><div className="flex items-start gap-2 text-[12px] text-ds-muted"><Bot className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><p>先创建项目，AI 才能绑定阈值、报告周期和成果目录。</p></div><button type="button" onClick={onCreateProject} disabled={!runtimeReady} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />创建工程项目</button></div>}</section>{evidenceCards.length > 0 ? <section className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-4 py-3"><p className="text-[13px] font-semibold">证据卡</p><p className="mt-1 text-[11px] text-ds-faint">来自 Runtime 的结构化证据，可回溯源文件哈希和行号。</p></div><div className="divide-y divide-ds-border-muted">{evidenceCards.map((card) => <div key={card.id} className="px-3.5 py-2.5"><div className="flex items-center justify-between gap-2"><span className="truncate text-[11.5px] font-medium text-ds-ink">{card.title}</span><span className="shrink-0 rounded bg-ds-subtle px-1.5 py-0.5 text-[9.5px] text-ds-faint">{card.kind}</span></div><p className="mt-1 text-[10.5px] leading-4 text-ds-muted">{card.summary}</p>{card.locator ? <p className="mt-1 text-[9.5px] text-ds-faint">{card.locator}</p> : null}</div>)}</div></section> : null}<section className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-4 py-3"><p className="text-[13px] font-semibold">AI 可调用资料</p><p className="mt-1 text-[11px] leading-4 text-ds-faint">工程数据走确定性导入；图片只产生待人工复核的线索。</p></div><div className="space-y-2 p-3"><button type="button" onClick={onImportData} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-ds-border-muted bg-ds-main px-3 py-3 text-left text-[11.5px] text-ds-muted hover:border-accent/50 hover:text-accent"><Upload className="h-4 w-4" /><span><span className="block font-medium text-ds-ink">导入 CSV / XLSX</span><span className="mt-0.5 block text-[10.5px]">保留原文件，字段映射进入证据链。</span></span></button><div className="flex items-center gap-2 rounded-lg border border-ds-border-muted bg-ds-main px-3 py-3 text-left text-[11.5px] text-ds-muted"><ImageIcon className="h-4 w-4 text-accent" /><span><span className="block font-medium text-ds-ink">现场图片线索</span><span className="mt-0.5 block text-[10.5px]">AI 只做说明，不直接改写工程数值。</span></span></div></div></section><section className="border border-accent/20 bg-accent/[0.04] px-3.5 py-3 text-[11px] leading-5 text-ds-muted"><span className="font-medium text-ds-ink">工程线程边界：</span>{workspaceRoot}。切换到编程或 Design 时，工程消息、审批和上下文都保留在此项目线程中。</section></aside>
      </div>
    </div>
  )
}
