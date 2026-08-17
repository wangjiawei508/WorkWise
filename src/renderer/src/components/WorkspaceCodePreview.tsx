import type { WorkspaceFileReadResult } from '@shared/workspace-file'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { highlightCodeHtml, renderFallbackCodeHtml } from '../lib/code-highlighting'

type WorkspaceFileReadSuccess = Extract<WorkspaceFileReadResult, { ok: true }>

export function WorkspaceCodePreview({
  result,
  language
}: {
  result: WorkspaceFileReadSuccess
  language: string
}): ReactElement {
  const { t } = useTranslation('common')
  const [highlightHtml, setHighlightHtml] = useState(() => renderFallbackCodeHtml(result.content))
  const scrollRef = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => result.content.split('\n'), [result.content])
  const activeLine = result.line && result.line >= 1 && result.line <= lines.length
    ? result.line
    : null
  const codeSurfaceStyle = activeLine
    ? ({ '--ds-file-preview-active-line': activeLine - 1 } as CSSProperties)
    : undefined

  useEffect(() => {
    if (!activeLine) return
    const id = window.requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`[data-line="${activeLine}"]`)?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [activeLine])

  useEffect(() => {
    let cancelled = false
    setHighlightHtml(renderFallbackCodeHtml(result.content))
    void highlightCodeHtml(result.content, language).then((html) => {
      if (!cancelled) setHighlightHtml(html)
    })
    return () => {
      cancelled = true
    }
  }, [language, result.content])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {result.truncated ? (
        <div className="shrink-0 border-b border-ds-border-muted/70 px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          {t('filePreviewTruncated')}
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="ds-file-preview-scroll min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[22px] text-ds-ink"
      >
        <div className="ds-file-preview-code-surface" style={codeSurfaceStyle}>
          {activeLine ? <div className="ds-file-preview-active-line" aria-hidden="true" /> : null}
          <div className="ds-file-preview-gutter">
            {lines.map((_, index) => {
              const lineNo = index + 1
              return (
                <div
                  key={lineNo}
                  data-line={lineNo}
                  className={`ds-file-preview-line-number ${activeLine === lineNo ? 'is-active' : ''}`}
                >
                  {lineNo}
                </div>
              )
            })}
          </div>
          <div
            className="ds-file-preview-code-html"
            dangerouslySetInnerHTML={{ __html: highlightHtml }}
          />
        </div>
      </div>
    </div>
  )
}
