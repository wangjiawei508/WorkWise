import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  PptMasterDeliverableVerifyRequest,
  PptMasterDeliverableVerifyResult
} from '@shared/ppt-master-services'
import { useChatStore } from '../../store/chat-store'

function latestAssistantClaim(blocks: Array<{ kind: string; text?: string }>): string | null {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.kind !== 'assistant' || !block.text) continue
    if (
      /(完整交付|PPT\s*已生成|已交付|交付完成|导出成功|成果文件|输出文件|文件路径)/i.test(block.text) &&
      /\.pptx|ppt_master|slideCount/i.test(block.text)
    ) {
      return block.text
    }
  }
  return null
}

function projectDirFromClaim(claim: string, workspaceRoot: string): string | null {
  const projectMatch = claim.match(/projects\/([^/\s）)\]]+)/i)
  if (projectMatch) {
    try {
      return `${workspaceRoot.replace(/\/$/, '')}/projects/${decodeURIComponent(projectMatch[1])}`
    } catch {
      return `${workspaceRoot.replace(/\/$/, '')}/projects/${projectMatch[1]}`
    }
  }
  const absoluteMatch = claim.match(/(\/[^\s]*?\/projects\/[^\s]*?)(?:\s|$|，|。)/)
  if (absoluteMatch) {
    return absoluteMatch[1].replace(/\.pptx$/, '').split('/').slice(0, -1).join('/')
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function PptMasterDeliveryVerification({
  workspaceRoot
}: {
  workspaceRoot: string
}): ReactElement | null {
  const { t } = useTranslation('common')
  const blocks = useChatStore((state) => state.blocks)
  const [result, setResult] = useState<PptMasterDeliverableVerifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastClaimRef = useRef<string | null>(null)

  const claim = useMemo(
    () => latestAssistantClaim(blocks as Array<{ kind: string; text?: string }>),
    [blocks]
  )
  const projectDir = useMemo(
    () => (claim ? projectDirFromClaim(claim, workspaceRoot) : null),
    [claim, workspaceRoot]
  )

  useEffect(() => {
    if (!claim || !projectDir || !workspaceRoot.trim()) {
      setResult(null)
      lastClaimRef.current = null
      return
    }
    if (lastClaimRef.current === claim) return
    lastClaimRef.current = claim
    let cancelled = false
    const timer = window.setTimeout(() => {
      setBusy(true)
      setError(null)
      const request: PptMasterDeliverableVerifyRequest = { workspaceRoot, projectDir }
      window.workwise
        .verifyPptMasterDeliverable(request)
        .then((verifyResult) => {
          if (!cancelled) setResult(verifyResult)
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
        })
        .finally(() => {
          if (!cancelled) setBusy(false)
        })
    }, 800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [claim, projectDir, workspaceRoot])

  if (!claim || !projectDir) return null

  const PassIcon = result?.ok ? ShieldCheck : ShieldAlert
  return (
    <div
      className={`mx-3 mb-2 rounded-xl border px-3 py-2 text-[12px] leading-5 ${
        result?.ok
          ? 'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200'
          : result
            ? 'border-red-300/70 bg-red-50 text-red-800 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-200'
            : 'border-ds-border bg-ds-card/80 text-ds-muted'
      }`}
    >
      <div className="flex items-start gap-2">
        {busy ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ds-faint" />
        ) : (
          <PassIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {busy
              ? t('pptVerifyRunning')
              : result?.ok
                ? t('pptVerifyPassed')
                : result
                  ? t('pptVerifyFailed')
                  : t('pptVerifyChecking')}
          </div>
          {error ? (
            <div className="mt-0.5 text-red-600 dark:text-red-300">{error}</div>
          ) : result ? (
            <div className="mt-0.5 space-y-0.5">
              <div className="truncate">
                {result.file
                  ? `${result.file.path.split('/').pop()} · ${formatBytes(result.file.size)} · ${new Date(result.file.modifiedAt).toLocaleString()}`
                  : projectDir}
              </div>
              {result.slideCount !== undefined ? (
                <div>
                  {t('pptVerifySlides', {
                    actual: result.slideCount,
                    expected: result.expectedSlides ?? result.slideCount
                  })}
                </div>
              ) : null}
              {result.notesCount !== undefined ? (
                <div>{t('pptVerifyNotes', { count: result.notesCount })}</div>
              ) : null}
              {!result.ok && result.issues.length > 0 ? (
                <div className="text-red-600 dark:text-red-300">
                  {result.issues.map((issue) => (
                    <div key={issue}>· {issue}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
