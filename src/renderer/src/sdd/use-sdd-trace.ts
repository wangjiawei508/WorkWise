import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  sddDraftFolderFromRelativePath,
  sddDraftTraceRelativePath
} from '@shared/sdd'
import {
  applySddDerivedStatuses,
  type SddTraceSnapshot
} from '@shared/sdd-trace'
import { buildPlanRelativePath } from '@shared/gui-plan'
import { useChatStore } from '../store/chat-store'
import { useGuiPlanStore } from '../plan/plan-store'
import { useSddDraftStore } from './sdd-draft-store'
import { saveActiveSddDraftToDisk } from './sdd-draft-actions'
import { computeSddTrace, type SddTraceResult } from './sdd-trace-compute'

function normalizeRoot(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '')
}

function parseTraceSnapshot(raw: string): SddTraceSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as SddTraceSnapshot
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.planRelativePath !== 'string') return null
    if (!parsed.requirementHashes || typeof parsed.requirementHashes !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function sddPlanRelativePathForDraft(draftRelativePath: string): string | null {
  const folder = sddDraftFolderFromRelativePath(draftRelativePath)
  return folder ? buildPlanRelativePath(`sdd-${folder}`) : null
}

/**
 * 需求 ↔ 计划 ↔ 开发的追踪同步循环。挂载在 SDD 草稿视图或计划面板中：
 * 聚合需求文档（编辑器内容或磁盘）、计划文件（计划面板内容或磁盘）与当前
 * 线程的实时 todo 状态，计算覆盖率/状态推导/需求漂移，并把前进式状态
 * 写回 requirement.md（草稿激活时经 draft store 单写者路径，否则直写磁盘）。
 */
export function useSddTrace(input: {
  workspaceRoot: string
  draftRelativePath: string | null
}): SddTraceResult | null {
  const workspaceRoot = normalizeRoot(input.workspaceRoot)
  const draftRelativePath = input.draftRelativePath
  const planRelativePath = useMemo(
    () => (draftRelativePath ? sddPlanRelativePathForDraft(draftRelativePath) : null),
    [draftRelativePath]
  )

  const activeThreadTodos = useChatStore((s) => s.activeThreadTodos)
  const { activeDraft, draftContent, draftSaveStatus } = useSddDraftStore(
    useShallow((s) => ({
      activeDraft: s.activeDraft,
      draftContent: s.content,
      draftSaveStatus: s.saveStatus
    }))
  )
  const { activePlan, planStoreContent } = useGuiPlanStore(
    useShallow((s) => ({ activePlan: s.activePlan, planStoreContent: s.content }))
  )

  const draftIsActive = Boolean(
    activeDraft &&
      draftRelativePath &&
      activeDraft.relativePath === draftRelativePath &&
      normalizeRoot(activeDraft.workspaceRoot) === workspaceRoot
  )
  const planIsActive = Boolean(
    activePlan &&
      planRelativePath &&
      activePlan.relativePath === planRelativePath &&
      normalizeRoot(activePlan.workspaceRoot) === workspaceRoot
  )

  const [diskRequirement, setDiskRequirement] = useState<string | null>(null)
  const [diskPlan, setDiskPlan] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<SddTraceSnapshot | null>(null)

  const todosVersion = activeThreadTodos?.updatedAt ?? ''

  useEffect(() => {
    if (!workspaceRoot || !draftRelativePath || !planRelativePath) {
      setDiskRequirement(null)
      setDiskPlan(null)
      setSnapshot(null)
      return
    }
    let cancelled = false
    const load = async (): Promise<void> => {
      if (typeof window.workwise?.readWorkspaceFile !== 'function') return
      const requirement = await window.workwise
        .readWorkspaceFile({ workspaceRoot, path: draftRelativePath })
        .catch(() => null)
      if (!cancelled) setDiskRequirement(requirement?.ok ? requirement.content : null)
      if (!planIsActive) {
        const plan = await window.workwise
          .readWorkspaceFile({ workspaceRoot, path: planRelativePath })
          .catch(() => null)
        if (!cancelled) setDiskPlan(plan?.ok ? plan.content : null)
      }
      const tracePath = sddDraftTraceRelativePath(draftRelativePath)
      if (tracePath) {
        const trace = await window.workwise
          .readWorkspaceFile({ workspaceRoot, path: tracePath })
          .catch(() => null)
        if (!cancelled) setSnapshot(trace?.ok ? parseTraceSnapshot(trace.content) : null)
      }
    }
    void load()
    // Slow refresh pulse: agent edits to the requirement/plan files have no
    // other notification channel into this hook once the editors are closed.
    const timer = window.setInterval(() => {
      void load()
    }, 5_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [workspaceRoot, draftRelativePath, planRelativePath, planIsActive, todosVersion])

  // While the user is actively editing the draft, the store is the source of
  // truth; once saved, the file on disk is (it also reflects agent edits).
  const storeEditing =
    draftIsActive && (draftSaveStatus === 'dirty' || draftSaveStatus === 'saving')
  const requirementMarkdown = storeEditing
    ? draftContent
    : (diskRequirement ?? (draftIsActive ? draftContent : null))
  const planMarkdown = planIsActive ? planStoreContent : diskPlan

  const result = useMemo(() => {
    if (!requirementMarkdown || !planRelativePath) return null
    return computeSddTrace({
      requirementMarkdown,
      planMarkdown: planMarkdown ?? null,
      planRelativePath,
      threadTodos: activeThreadTodos,
      traceSnapshot: snapshot
    })
  }, [requirementMarkdown, planMarkdown, planRelativePath, activeThreadTodos, snapshot])

  // Forward-only status writeback into requirement.md.
  const writebackBusyRef = useRef(false)
  useEffect(() => {
    if (!result || !requirementMarkdown || !draftRelativePath) return
    if (Object.keys(result.derivedStatuses).length === 0) return
    if (writebackBusyRef.current) return
    const next = applySddDerivedStatuses(requirementMarkdown, result.derivedStatuses)
    if (next === requirementMarkdown) return

    writebackBusyRef.current = true
    const run = async (): Promise<void> => {
      try {
        if (storeEditing) {
          const store = useSddDraftStore.getState()
          if (store.saveStatus === 'saving') return
          store.setContent(next)
          await saveActiveSddDraftToDisk()
          return
        }
        if (typeof window.workwise?.writeWorkspaceFile !== 'function') return
        const written = await window.workwise.writeWorkspaceFile({
          workspaceRoot,
          path: draftRelativePath,
          content: next
        })
        if (written.ok) {
          setDiskRequirement(next)
          if (draftIsActive) useSddDraftStore.getState().markSaved(next)
        }
      } finally {
        writebackBusyRef.current = false
      }
    }
    void run()
  }, [result, requirementMarkdown, draftRelativePath, draftIsActive, storeEditing, workspaceRoot])

  return result
}
