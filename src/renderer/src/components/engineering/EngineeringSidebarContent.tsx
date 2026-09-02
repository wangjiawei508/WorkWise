import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Bot, Database, FolderKanban, HardHat, MessageSquareText, Plus, RefreshCw } from 'lucide-react'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { useChatStore } from '../../store/chat-store'
import { SidebarIconButton } from '../sidebar/SidebarPrimitives'
import {
  activeEngineeringProjectId,
  dispatchEngineeringProjectCreate,
  dispatchEngineeringProjectOpen,
  dispatchEngineeringAiOpen
} from './engineering-project-navigation'

type EngineeringProject = {
  id: string
  name: string
  monitoringType: string
  unit: string
  workspace: string
  revision: number
  updatedAt: string
}

type Props = {
  workspaceRoot: string
  runtimeReady: boolean
}

async function loadEngineeringProjects(): Promise<EngineeringProject[]> {
  const response = await rendererRuntimeClient.runtimeRequest('/v1/engineering/projects')
  if (!response.ok) {
    let detail = response.body
    try {
      detail = (JSON.parse(response.body) as { message?: string }).message ?? detail
    } catch {
      /* Preserve plain Runtime errors. */
    }
    throw new Error(detail || `无法读取工程项目 (${response.status})`)
  }
  return (JSON.parse(response.body) as { projects?: EngineeringProject[] }).projects ?? []
}

function formatUpdatedAt(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return '尚未同步'
  return new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function EngineeringSidebarContent({ workspaceRoot, runtimeReady }: Props): ReactElement {
  const threads = useChatStore((state) => state.threads)
  const activeThreadId = useChatStore((state) => state.activeThreadId)
  const setRoute = useChatStore((state) => state.setRoute)
  const selectThread = useChatStore((state) => state.selectThread)
  const [projects, setProjects] = useState<EngineeringProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState(() => activeEngineeringProjectId())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!runtimeReady) {
      setProjects([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await loadEngineeringProjects()
      setProjects(next)
      setActiveProjectId(activeEngineeringProjectId())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [runtimeReady])

  useEffect(() => {
    void refresh()
  }, [refresh, workspaceRoot])

  useEffect(() => {
    const syncProjects = (): void => { void refresh() }
    const syncSelection = (): void => setActiveProjectId(activeEngineeringProjectId())
    window.addEventListener('workwise:engineering-projects-changed', syncProjects)
    window.addEventListener('workwise:engineering-open-project', syncSelection)
    window.addEventListener('workwise:engineering-active-project-changed', syncSelection)
    return () => {
      window.removeEventListener('workwise:engineering-projects-changed', syncProjects)
      window.removeEventListener('workwise:engineering-open-project', syncSelection)
      window.removeEventListener('workwise:engineering-active-project-changed', syncSelection)
    }
  }, [refresh])

  const workspaceProjects = useMemo(
    () => projects
      .filter((project) => project.workspace === workspaceRoot)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [projects, workspaceRoot]
  )
  const engineeringThreads = useMemo(
    () => threads
      .filter((thread) => thread.domain === 'engineering' && thread.workspace === workspaceRoot && thread.archived !== true)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [threads, workspaceRoot]
  )

  return (
    <div className="ds-no-drag flex min-h-0 flex-1 flex-col px-1">
      <div className="flex min-h-[38px] items-center justify-between px-2 pb-1 pt-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-ds-faint">
          <HardHat className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} />
          <span className="truncate">工程项目</span>
          <span className="tabular-nums text-[11px] text-ds-faint">{workspaceProjects.length}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SidebarIconButton
            onClick={runtimeReady ? dispatchEngineeringProjectCreate : undefined}
            disabled={!runtimeReady}
            className="h-7 w-7"
            title="新建工程项目"
            ariaLabel="新建工程项目"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
          </SidebarIconButton>
          <SidebarIconButton
            onClick={() => void refresh()}
            disabled={!runtimeReady}
            active={loading}
            className="h-7 w-7"
            title="刷新工程项目"
            ariaLabel="刷新工程项目"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          </SidebarIconButton>
        </div>
      </div>

      <button
        type="button"
        onClick={dispatchEngineeringAiOpen}
        className="mx-1 mb-2 flex min-h-[48px] w-[calc(100%-8px)] items-center gap-2 rounded-lg border border-accent/20 bg-accent/[0.07] px-2.5 py-2 text-left transition hover:border-accent/40 hover:bg-accent/10"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent"><Bot className="h-3.5 w-3.5" strokeWidth={1.8} /></span>
        <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-ds-ink">工程 AI 指挥台</span><span className="mt-0.5 block truncate text-[10.5px] text-ds-muted">目标、计划、证据与交付</span></span>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {error ? (
          <div role="alert" className="mx-1 my-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[11px] leading-4 text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {!runtimeReady ? (
          <div className="mx-1 mt-1 flex items-center gap-2 rounded-lg border border-dashed border-ds-border-muted px-2.5 py-3 text-[11.5px] leading-5 text-ds-faint">
            <Database className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span>连接 Runtime 后加载工程项目和成果。</span>
          </div>
        ) : null}
        {runtimeReady && !loading && workspaceProjects.length === 0 && !error ? (
          <button
            type="button"
            onClick={dispatchEngineeringProjectCreate}
            className="mx-1 mt-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-lg border border-dashed border-ds-border-muted px-2.5 py-3 text-left text-[11.5px] text-ds-faint transition hover:border-accent/60 hover:text-accent"
          >
            <FolderKanban className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span className="min-w-0 truncate">在此工作目录新建工程项目</span>
          </button>
        ) : null}
        <div className="space-y-0.5">
          {workspaceProjects.map((project) => {
            const active = project.id === activeProjectId
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => dispatchEngineeringProjectOpen(project.id)}
                className={`group flex min-h-[52px] w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                  active
                    ? 'bg-[var(--ds-sidebar-field-focus)] text-ds-ink shadow-[inset_0_0_0_1px_var(--ds-sidebar-row-ring)]'
                    : 'text-ds-muted hover:bg-[var(--ds-sidebar-row-hover)] hover:text-ds-ink'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-accent/15 text-accent' : 'bg-ds-main text-ds-faint group-hover:text-accent'}`}>
                  <FolderKanban className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{project.name}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-ds-faint">
                    {project.monitoringType} · {project.unit} · {formatUpdatedAt(project.updatedAt)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {engineeringThreads.length > 0 ? (
          <div className="mt-4 border-t border-ds-border-muted pt-3">
            <div className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-ds-faint">
              <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.7} />
              <span>工程 AI 会话</span>
              <span className="tabular-nums">{engineeringThreads.length}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {engineeringThreads.map((thread) => {
                const active = thread.id === activeThreadId
                const projectName = workspaceProjects.find((project) => project.id === thread.projectId)?.name
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setRoute('engineering')
                      void selectThread(thread.id)
                      if (thread.projectId) dispatchEngineeringProjectOpen(thread.projectId)
                    }}
                    className={`group flex min-h-[48px] w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${active ? 'bg-[var(--ds-sidebar-field-focus)] text-ds-ink shadow-[inset_0_0_0_1px_var(--ds-sidebar-row-ring)]' : 'text-ds-muted hover:bg-[var(--ds-sidebar-row-hover)] hover:text-ds-ink'}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-accent/15 text-accent' : 'bg-ds-main text-ds-faint group-hover:text-accent'}`}>
                      <Bot className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">{thread.title || '工程 AI 会话'}</span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-ds-faint">{projectName ?? '工程项目'} · {thread.messageCount ?? 0} 条消息</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mx-2 mb-2 rounded-lg bg-ds-main px-2.5 py-2 text-[10.5px] leading-4 text-ds-faint">
        工程项目、数据集、运行记录和成果清单独立保存，不与编程或设计会话混用。
      </div>
    </div>
  )
}
