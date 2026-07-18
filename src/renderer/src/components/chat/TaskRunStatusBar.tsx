import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, PauseCircle, Play, RotateCcw, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConversationViewMode } from '@shared/app-settings'
import type { TaskRunStatus, TaskRunV1 } from '@shared/agent-workbench'

type Props = {
  threadId: string | null
  runtimeReady: boolean
  globalViewMode: ConversationViewMode
  onViewModeOverride: (mode: ConversationViewMode | null) => void
}

const ACTIVE_STATUSES = new Set<TaskRunStatus>(['queued', 'running', 'retrying'])
const RESUMABLE_STATUSES = new Set<TaskRunStatus>(['stalled', 'waiting_user'])

export function taskProgress(task: TaskRunV1): { completed: number; total: number } {
  return { completed: task.nodes.filter((node) => node.status === 'completed').length, total: task.nodes.length }
}

export function taskNeedsAttention(task: TaskRunV1): boolean {
  return ['stalled', 'waiting_user', 'waiting_approval', 'failed'].includes(task.status)
}

function operationKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

export function TaskRunStatusBar({ threadId, runtimeReady, globalViewMode, onViewModeOverride }: Props): ReactElement | null {
  const { t } = useTranslation('common')
  const [task, setTask] = useState<TaskRunV1 | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [override, setOverride] = useState<ConversationViewMode | ''>('')
  const [model, setModel] = useState('')
  const [busyAction, setBusyAction] = useState<'resume' | 'retry' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!threadId || !runtimeReady) {
      setTask(null)
      return
    }
    try {
      const tasks = await window.workwise.listTaskRuns({ threadId, limit: 1 })
      setTask(tasks[0] ?? null)
      setError(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }, [runtimeReady, threadId])

  useEffect(() => {
    setOverride('')
    onViewModeOverride(null)
    setExpanded(false)
    void refresh()
    if (!threadId || !runtimeReady) return
    const timer = window.setInterval(() => void refresh(), 2_500)
    return () => window.clearInterval(timer)
  }, [onViewModeOverride, refresh, runtimeReady, threadId])

  const progress = useMemo(() => task ? taskProgress(task) : { completed: 0, total: 0 }, [task])
  if (!task && !error) return null

  const runAction = async (action: 'resume' | 'retry' | 'cancel'): Promise<void> => {
    if (!task) return
    setBusyAction(action)
    setError(null)
    try {
      const request = {
        expectedRevision: task.revision,
        idempotencyKey: operationKey(action),
        ...(model.trim() ? { model: model.trim() } : {})
      }
      if (action === 'resume') await window.workwise.resumeTask(task.id, request)
      else if (action === 'retry') await window.workwise.retryTask(task.id, request)
      else await window.workwise.cancelTask(task.id, { ...request, reason: t('taskRunCancelledByUser') })
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      await refresh()
    } finally {
      setBusyAction(null)
    }
  }

  const attention = task ? taskNeedsAttention(task) : true
  const running = task ? ACTIVE_STATUSES.has(task.status) : false
  const statusIcon = running
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : task?.status === 'completed'
      ? <CheckCircle2 className="h-4 w-4" />
      : attention ? <AlertTriangle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />

  return (
    <div className={`ds-no-drag mx-3 mt-2 shrink-0 overflow-hidden rounded-2xl border ${attention ? 'border-amber-300/70 bg-amber-50/95 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100' : 'border-ds-border bg-ds-card/95 text-ds-ink'}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold">{statusIcon}{task ? t(`taskRunStatus_${task.status}`) : t('taskRunUnavailable')}</span>
        {task && progress.total > 0 ? <span className="text-[11.5px] opacity-75">{t('taskRunProgress', progress)}</span> : null}
        {task?.stalledReason || task?.waitingReason ? <span className="min-w-0 flex-1 truncate text-[11.5px] opacity-80">{task.stalledReason || task.waitingReason}</span> : <span className="flex-1" />}
        {task && RESUMABLE_STATUSES.has(task.status) ? <button type="button" disabled={busyAction !== null} onClick={() => void runAction('resume')} className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"><Play className="h-3.5 w-3.5" />{t('taskRunResume')}</button> : null}
        {task && (task.status === 'failed' || task.status === 'cancelled') ? <button type="button" disabled={busyAction !== null} onClick={() => void runAction('retry')} className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />{t('taskRunRetry')}</button> : null}
        {task && !['completed', 'failed', 'cancelled'].includes(task.status) ? <button type="button" disabled={busyAction !== null} onClick={() => void runAction('cancel')} className="inline-flex items-center gap-1 rounded-lg border border-current/20 px-2.5 py-1.5 text-[11.5px] font-medium disabled:opacity-50"><Square className="h-3 w-3" />{t('taskRunCancel')}</button> : null}
        <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-medium hover:bg-black/5 dark:hover:bg-white/5">{t('taskRunWorkDetails')}{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>
      </div>
      {expanded ? (
        <div className="border-t border-current/10 bg-ds-card/70 p-3 text-ds-ink">
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <label className="text-[11.5px] text-ds-muted">{t('taskRunViewMode')}<select className="mt-1 w-full rounded-lg border border-ds-border bg-ds-card px-2 py-1.5 text-[12px]" value={override} onChange={(event) => { const value = event.target.value as ConversationViewMode | ''; setOverride(value); onViewModeOverride(value || null) }}><option value="">{t('taskRunUseGlobalMode', { mode: t(`conversationViewMode_${globalViewMode}`) })}</option><option value="concise">{t('conversationViewMode_concise')}</option><option value="standard">{t('conversationViewMode_standard')}</option><option value="developer">{t('conversationViewMode_developer')}</option></select></label>
            <label className="text-[11.5px] text-ds-muted">{t('taskRunRetryModel')}<input className="mt-1 w-full rounded-lg border border-ds-border bg-ds-card px-2 py-1.5 text-[12px]" value={model} placeholder={task?.model || 'auto'} onChange={(event) => setModel(event.target.value)} /></label>
          </div>
          {task ? <div className="grid gap-3 lg:grid-cols-2">
            <div><div className="mb-1.5 text-[11.5px] font-semibold text-ds-muted">{t('taskRunNodes')}</div><div className="space-y-1.5">{task.nodes.map((node) => <div key={node.id} className="flex items-center justify-between gap-3 rounded-lg border border-ds-border-muted bg-ds-main/40 px-2.5 py-2 text-[12px]"><span className="truncate">{node.title}</span><span className="shrink-0 text-[10.5px] text-ds-faint">{t(`taskNodeStatus_${node.status}`)}</span></div>)}</div></div>
            <div><div className="mb-1.5 text-[11.5px] font-semibold text-ds-muted">{t('taskRunArtifacts')}</div>{task.artifacts.length ? <div className="space-y-1.5">{task.artifacts.map((artifact) => <div key={artifact.id} className="rounded-lg border border-ds-border-muted bg-ds-main/40 px-2.5 py-2 text-[12px]"><div className="truncate font-medium">{artifact.relativePath}</div><div className="mt-0.5 text-[10.5px] text-ds-faint">{t(`taskArtifactValidation_${artifact.validation}`)}</div></div>)}</div> : <div className="rounded-lg border border-dashed border-ds-border p-3 text-[11.5px] text-ds-faint">{t('taskRunNoArtifacts')}</div>}</div>
          </div> : null}
          {error ? <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[11.5px] text-red-800 dark:bg-red-950/20 dark:text-red-200">{error}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
