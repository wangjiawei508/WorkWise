import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { FileText, Layers3, Palette, Plus, RefreshCw } from 'lucide-react'
import type { DesignDocumentSummaryV1 } from '@shared/design-workspace'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'
import { useChatStore } from '../../store/chat-store'
import { hydrateLegacyDesignThreadRegistry } from '../../design/design-thread-registry'
import { SidebarIconButton } from '../sidebar/SidebarPrimitives'

type Props = {
  workspaceRoot: string
}

function dispatchDesignEvent(name: string, detail?: Record<string, string>): void {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function DesignSidebarContent({ workspaceRoot }: Props): ReactElement {
  const activeDocumentId = useDesignWorkspaceStore((state) => state.document?.id ?? '')
  const threads = useChatStore((state) => state.threads)
  const [documents, setDocuments] = useState<DesignDocumentSummaryV1[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!workspaceRoot.trim() || typeof window.workwise?.listDesignDocuments !== 'function') {
      setDocuments([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.workwise.listDesignDocuments({ workspaceRoot })
      if (!result.ok) throw new Error(result.message || '无法读取设计会话')
      hydrateLegacyDesignThreadRegistry(result.documents, threads)
      setDocuments(result.documents)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [threads, workspaceRoot])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const syncDocuments = (): void => { void refresh() }
    window.addEventListener('workwise:design-documents-changed', syncDocuments)
    return () => window.removeEventListener('workwise:design-documents-changed', syncDocuments)
  }, [refresh])

  const orderedDocuments = useMemo(
    () => [...documents].sort((left, right) => right.updatedAt - left.updatedAt),
    [documents]
  )

  return (
    <div className="ds-no-drag flex min-h-0 flex-1 flex-col px-1">
      <div className="flex min-h-[38px] items-center justify-between px-2 pb-1 pt-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-ds-faint">
          <Palette className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.8} />
          <span className="truncate">设计会话</span>
          <span className="tabular-nums text-[11px] text-ds-faint">{documents.length}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SidebarIconButton
            onClick={() => dispatchDesignEvent('workwise:design-new-document')}
            className="h-7 w-7"
            title="新建设计文档"
            ariaLabel="新建设计文档"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
          </SidebarIconButton>
          <SidebarIconButton
            onClick={() => void refresh()}
            active={loading}
            className="h-7 w-7"
            title="刷新设计会话"
            ariaLabel="刷新设计会话"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />
          </SidebarIconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {error ? (
          <div role="alert" className="mx-1 my-2 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[11px] leading-4 text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}
        {!loading && orderedDocuments.length === 0 && !error ? (
          <button
            type="button"
            onClick={() => dispatchDesignEvent('workwise:design-new-document')}
            className="mx-1 mt-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-lg border border-dashed border-ds-border-muted px-2.5 py-3 text-left text-[11.5px] text-ds-faint transition hover:border-accent/60 hover:text-accent"
          >
            <FileText className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            <span className="min-w-0 truncate">还没有设计会话</span>
          </button>
        ) : null}
        <div className="space-y-0.5">
          {orderedDocuments.map((document) => {
            const active = document.id === activeDocumentId
            return (
              <button
                key={document.id}
                type="button"
                onClick={() => dispatchDesignEvent('workwise:design-open-document', { documentId: document.id })}
                className={`group flex min-h-[48px] w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                  active
                    ? 'bg-[var(--ds-sidebar-field-focus)] text-ds-ink shadow-[inset_0_0_0_1px_var(--ds-sidebar-row-ring)]'
                    : 'text-ds-muted hover:bg-[var(--ds-sidebar-row-hover)] hover:text-ds-ink'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-accent/15 text-accent' : 'bg-ds-main text-ds-faint group-hover:text-accent'}`}>
                  <Layers3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{document.name}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-ds-faint">
                    {document.pageCount} 页 · 修订 {document.revision}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="mx-2 mb-2 rounded-lg bg-ds-main px-2.5 py-2 text-[10.5px] leading-4 text-ds-faint">
        每个设计文档拥有独立画布和助手会话。
      </div>
    </div>
  )
}
