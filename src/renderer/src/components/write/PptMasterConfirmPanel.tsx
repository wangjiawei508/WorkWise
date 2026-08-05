import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  buildPptMasterResult,
  describePptMasterConfirmation,
  findPptMasterPendingConfirmation,
  PPT_CONFIRM_DISPLAY_FIELDS,
  type PptMasterConfirmEdits,
  type PptMasterPendingConfirmation,
  type PptMasterRecommendations
} from '@shared/ppt-confirm-contract'
import { useChatStore } from '../../store/chat-store'

const POLL_MS = 2000

type Candidate = { id?: string; name?: string; label?: string; desc?: string; description?: string }

function candidatesOf(value: unknown): Candidate[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const list = Array.isArray(record.candidates) ? record.candidates : Array.isArray(record.options) ? record.options : []
  return list.filter((item): item is Candidate => Boolean(item && typeof item === 'object'))
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>
      return String(record.label ?? record.name ?? record.id ?? '')
    }
    return String(item)
  }).filter(Boolean).join('、')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return String(record.label ?? record.name ?? record.id ?? JSON.stringify(record))
  }
  return String(value)
}

function FieldControl({
  value,
  onChange
}: {
  value: unknown
  onChange: (next: unknown) => void
}): ReactElement {
  if (typeof value === 'boolean') {
    return (
      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ds-ink">
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-[#2563EB]"
        />
        {value ? '开启' : '关闭'}
      </label>
    )
  }

  const candidates = candidatesOf(value)
  if (candidates.length > 0) {
    const selectedId = candidateId(value)
    return (
      <div className="flex flex-col gap-1.5">
        {candidates.map((candidate) => {
          const id = candidate.id ?? candidate.name ?? candidate.label ?? ''
          const label = candidate.label ?? candidate.name ?? candidate.id ?? id
          const desc = candidate.desc ?? candidate.description
          const selected = selectedId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ id, label, ...(candidate.name ? { name: candidate.name } : {}) })}
              className={`rounded-xl border px-3 py-2 text-left text-[12.5px] transition ${
                selected
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-400/10'
                  : 'border-ds-border bg-ds-card text-ds-ink hover:border-blue-300'
              }`}
            >
              <span className="block font-medium">{label}</span>
              {desc ? <span className="mt-0.5 block text-[11.5px] text-ds-faint">{desc}</span> : null}
            </button>
          )
        })}
      </div>
    )
  }

  if (Array.isArray(value)) {
    const stringItems = value.filter((item): item is string => typeof item === 'string')
    const selected = new Set(stringItems)
    return (
      <div className="flex flex-wrap gap-1.5">
        {stringItems.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              const next = new Set(selected)
              if (next.has(item)) next.delete(item)
              else next.add(item)
              onChange([...next])
            }}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
              selected.has(item)
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-400/10'
                : 'border-ds-border bg-ds-card text-ds-muted'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    )
  }

  if (typeof value === 'number') {
    return (
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          const parsed = Number(event.target.value)
          onChange(Number.isFinite(parsed) ? parsed : 0)
        }}
        className="w-full rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[12.5px] text-ds-ink outline-none focus:border-blue-400"
      />
    )
  }

  if (typeof value === 'string') {
    const multiline = value.length > 60
    return multiline ? (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-none rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[12.5px] text-ds-ink outline-none focus:border-blue-400"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[12.5px] text-ds-ink outline-none focus:border-blue-400"
      />
    )
  }

  const json = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')
  return (
    <textarea
      value={json}
      onChange={(event) => {
        try {
          onChange(JSON.parse(event.target.value) as unknown)
        } catch {
          // keep previous value; the panel reports invalid JSON on confirm
        }
      }}
      rows={4}
      className="w-full resize-none rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 font-mono text-[11.5px] text-ds-ink outline-none focus:border-blue-400"
    />
  )
}

function candidateId(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return String(record.id ?? record.name ?? record.label ?? '')
}

export function PptMasterConfirmPanel({ workspaceRoot }: { workspaceRoot: string }): ReactElement | null {
  const { t } = useTranslation('common')
  const sendMessage = useChatStore((state) => state.sendMessage)
  const [pending, setPending] = useState<PptMasterPendingConfirmation | null>(null)
  const [edits, setEdits] = useState<PptMasterConfirmEdits>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const scanningRef = useRef(false)

  useEffect(() => {
    if (!workspaceRoot.trim()) return
    const scan = async (): Promise<void> => {
      if (scanningRef.current || !window.workwise?.listWorkspaceDirectory || !window.workwise?.readWorkspaceFile) return
      scanningRef.current = true
      try {
        const found = await findPptMasterPendingConfirmation(
          workspaceRoot,
          async (path) => {
            const result = await window.workwise.listWorkspaceDirectory({ workspaceRoot, path })
            return result.ok ? result.entries : []
          },
          async (path) => {
            const result = await window.workwise.readWorkspaceFile({ path, workspaceRoot })
            if (!result.ok) throw new Error(result.message)
            return result.content
          }
        )
        if (found) {
          setPending((current) => {
            if (current && current.confirmDir === found.confirmDir) return current
            setEdits({})
            setDone(false)
            setError(null)
            return found
          })
        } else if (pending !== null && !done) {
          setPending(null)
          setEdits({})
        }
      } catch {
        // transient scan errors are ignored; the next poll retries
      } finally {
        scanningRef.current = false
      }
    }
    void scan()
    const timer = window.setInterval(() => void scan(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [done, pending, workspaceRoot])

  const recommendations = pending?.recommendations
  const fields = useMemo(() => {
    if (!recommendations) return []
    return PPT_CONFIRM_DISPLAY_FIELDS.filter(({ key }) => recommendations[key] !== undefined && recommendations[key] !== null)
  }, [recommendations])

  const updateField = useCallback((key: string, value: unknown): void => {
    setEdits((current) => ({ ...current, [key]: value }))
  }, [])

  const handleConfirm = async (): Promise<void> => {
    if (!pending || !recommendations) return
    setBusy(true)
    setError(null)
    try {
      const result = buildPptMasterResult(recommendations, edits, pending.projectDir)
      const writeResult = await window.workwise.writeWorkspaceFile({
        workspaceRoot,
        path: `${pending.confirmDir}/result.json`,
        content: JSON.stringify(result, null, 2)
      })
      if (!writeResult.ok) throw new Error(writeResult.message)
      const summary = describePptMasterConfirmation(result)
      await sendMessage(summary, 'agent')
      setDone(true)
      setPending(null)
      setEdits({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!pending || !recommendations) return null

  return (
    <div className="mx-3 mb-2 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/70 shadow-sm dark:border-blue-400/25 dark:bg-blue-400/8">
      <div className="flex items-center gap-2 border-b border-blue-100 px-3 py-2 dark:border-blue-400/15">
        <Sparkles className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" strokeWidth={1.9} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ds-ink">
          {t('pptConfirmTitle')}
        </span>
        {done ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} />
        ) : null}
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ds-faint transition hover:bg-blue-100 hover:text-ds-ink dark:hover:bg-blue-400/10"
          aria-label={collapsed ? t('pptConfirmExpand') : t('pptConfirmCollapse')}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => { setPending(null); setEdits({}) }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ds-faint transition hover:bg-blue-100 hover:text-ds-ink dark:hover:bg-blue-400/10"
          aria-label={t('pptConfirmCollapse')}
        >
          <X className="h-4 w-4" strokeWidth={1.9} />
        </button>
      </div>
      {!collapsed ? (
        <div className="max-h-[42vh] overflow-y-auto px-3 py-2">
          <p className="mb-2 text-[12px] leading-5 text-ds-muted">{t('pptConfirmIntro')}</p>
          {fields.length === 0 ? (
            <p className="py-2 text-[12px] text-ds-faint">{t('pptConfirmNoFields')}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {fields.map(({ key, label }) => (
                <div key={key}>
                  <div className="mb-1 text-[11.5px] font-medium text-ds-ink">{label}</div>
                  <FieldControl value={edits[key] ?? recommendations[key]} onChange={(next) => updateField(key, next)} />
                </div>
              ))}
            </div>
          )}
          {error ? <p className="mt-2 text-[12px] font-medium text-red-600">{t('pptConfirmWriteFailed')}{error}</p> : null}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2 border-t border-blue-100 px-3 py-2 dark:border-blue-400/15">
        {done ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('pptConfirmSuccess')}
          </span>
        ) : null}
        <button
          type="button"
          disabled={busy || fields.length === 0}
          onClick={() => void handleConfirm()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-blue-600 px-3.5 text-[12.5px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {t('pptConfirmButton')}
        </button>
      </div>
    </div>
  )
}
