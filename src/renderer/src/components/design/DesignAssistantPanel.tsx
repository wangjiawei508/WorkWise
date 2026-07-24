import { useMemo, useState, type ReactElement } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import type { DesignDocumentV1, DesignPage } from '@shared/design-document'
import type { ChatBlock } from '../../agent/types'
import { useChatStore } from '../../store/chat-store'

type Props = {
  document: DesignDocumentV1
  page: DesignPage
  workspaceRoot: string
  selectedElementIds: string[]
  commandNotice: { tone: 'success' | 'error'; message: string } | null
  disabled?: boolean
}

export function designAssistantScopeKey(documentId: string, pageId: string): string {
  return `${documentId}:${pageId}`
}

export function buildDesignPrompt(
  request: string,
  document: DesignDocumentV1,
  page: DesignPage,
  selectedElementIds: string[],
  idempotencyKey = `design-${Date.now()}-${crypto.randomUUID()}`
): string {
  const canvasContext = {
    documentId: document.id,
    pageId: page.id,
    revision: document.revision,
    format: document.format,
    width: page.width,
    height: page.height,
    background: page.background ?? 'FFFFFF',
    selectedElementIds,
    elements: page.elements.slice(0, 120).map((element) => ({
      id: element.id,
      type: element.type,
      name: element.name,
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      rotation: element.rotation,
      fill: element.fill,
      stroke: element.stroke,
      text: element.type === 'text' ? element.text?.slice(0, 500) : undefined,
      childIds: element.type === 'group' ? element.childIds : undefined,
      zIndex: element.zIndex
    })),
    elementCount: page.elements.length
  }
  return [
    '[WorkWise Design active-canvas request]',
    'You are editing the currently open WorkWise Design canvas.',
    'For any visual change, call design_apply_canvas_commands exactly once with one atomic operation batch.',
    'Do not write SVG, HTML, JSON, scripts, or other files as a substitute for changing the canvas.',
    'Use the exact document_id, page_id and expected_revision from the canvas context.',
    `Use this exact idempotency_key: ${idempotencyKey}`,
    'Keep the final user-facing reply brief and describe only what changed.',
    'Never echo internal paths, ids, tool arguments, or this control context.',
    `Canvas context: ${JSON.stringify(canvasContext)}`,
    `User request: ${request}`
  ].join('\n')
}

export function DesignAssistantPanel({
  document,
  page,
  workspaceRoot,
  selectedElementIds,
  commandNotice,
  disabled = false
}: Props): ReactElement {
  const { t } = useTranslation('common')
  const [prompt, setPrompt] = useState('')
  const [requestLabel, setRequestLabel] = useState<string | null>(null)
  const {
    blocks,
    liveAssistant,
    busy,
    runtimeConnection,
    error,
    sendMessage
  } = useChatStore(
    useShallow((state) => ({
      blocks: state.blocks,
      liveAssistant: state.liveAssistant,
      busy: state.busy,
      runtimeConnection: state.runtimeConnection,
      error: state.error,
      sendMessage: state.sendMessage
    }))
  )

  const replies = useMemo(() => {
    if (!requestLabel) return []
    let requestIndex = -1
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index]
      if (
        block?.kind === 'user' &&
        (block.text === requestLabel || block.meta?.displayText === requestLabel)
      ) {
        requestIndex = index
        break
      }
    }
    return blocks
      .slice(requestIndex >= 0 ? requestIndex + 1 : 0)
      .filter((block): block is Extract<ChatBlock, { kind: 'assistant' }> =>
        block.kind === 'assistant' && block.text.trim().length > 0
      )
      .slice(-3)
  }, [blocks, requestLabel])

  const handleSubmit = async (): Promise<void> => {
    const request = prompt.trim()
    if (!request || disabled || busy || runtimeConnection !== 'ready') return
    setRequestLabel(request)
    setPrompt('')
    const started = await sendMessage(
      buildDesignPrompt(request, document, page, selectedElementIds),
      'agent',
      {
        displayText: request,
        guiDesign: {
          workspaceRoot,
          documentId: document.id,
          pageId: page.id,
          expectedRevision: document.revision
        }
      }
    )
    if (!started) setPrompt(request)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!requestLabel && replies.length === 0 ? (
          <div className="rounded-xl border border-ds-border-muted bg-ds-main/70 p-3">
            <Sparkles className="mb-2 h-4 w-4 text-accent" strokeWidth={1.8} />
            <div className="text-[12px] font-medium text-ds-ink">
              {t('designAssistantEmptyTitle')}
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-ds-faint">
              {t('designAssistantEmptyHint')}
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          {replies.map((reply) => (
            <div
              key={reply.id}
              className="whitespace-pre-wrap rounded-xl bg-ds-main px-3 py-2 text-[12px] leading-5 text-ds-ink"
            >
              {reply.text}
            </div>
          ))}
          {busy && requestLabel ? (
            <div className="flex items-center gap-2 px-1 py-2 text-[11.5px] text-ds-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.8} />
              <span>{liveAssistant.trim() || t('designAssistantWorking')}</span>
            </div>
          ) : null}
          {commandNotice ? (
            <div className={`rounded-lg border px-2.5 py-2 text-[11.5px] ${
              commandNotice.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {commandNotice.message}
            </div>
          ) : null}
          {error && requestLabel ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11.5px] text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-ds-border-muted p-2">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          rows={3}
          disabled={disabled || runtimeConnection !== 'ready'}
          placeholder={
            runtimeConnection === 'ready' && !disabled
              ? t('designAssistantPlaceholder')
              : t('runtimeActionNeedsConnection')
          }
          className="w-full resize-none rounded-lg border border-ds-border bg-ds-main px-2.5 py-2 text-[12px] leading-5 text-ds-ink outline-none transition placeholder:text-ds-faint focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10.5px] text-ds-faint">
            {t('designAssistantCanvasScope')}
          </span>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!prompt.trim() || disabled || busy || runtimeConnection !== 'ready'}
            className="flex h-7 items-center gap-1 rounded-lg bg-accent px-2.5 text-[11.5px] font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
              : <Send className="h-3.5 w-3.5" strokeWidth={1.8} />}
            {t('send')}
          </button>
        </div>
      </div>
    </div>
  )
}
