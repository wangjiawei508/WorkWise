import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ImagePlus, Loader2, WandSparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AGNES_IMAGE_DEFAULT_MODEL,
  AGNES_IMAGE_PROMPT_TEMPLATES,
  AGNES_IMAGE_SIZES,
  fillAgnesImagePrompt,
  variableDefaultsForTemplate,
  type AgnesImageSize
} from '@shared/agnes-image'

type Props = {
  open: boolean
  disabled?: boolean
  generating: boolean
  onClose: () => void
  onGenerate: (payload: {
    prompt: string
    model: string
    size: AgnesImageSize
  }) => void
}

export function WriteAgnesImageDialog({
  open,
  disabled = false,
  generating,
  onClose,
  onGenerate
}: Props): ReactElement | null {
  const { t } = useTranslation('common')
  const firstTemplate = AGNES_IMAGE_PROMPT_TEMPLATES[0]!
  const [templateId, setTemplateId] = useState(firstTemplate.id)
  const activeTemplate = useMemo(
    () => AGNES_IMAGE_PROMPT_TEMPLATES.find((template) => template.id === templateId) ?? firstTemplate,
    [firstTemplate, templateId]
  )
  const [variables, setVariables] = useState<Record<string, string>>(() =>
    variableDefaultsForTemplate(firstTemplate)
  )
  const [prompt, setPrompt] = useState(() =>
    fillAgnesImagePrompt(firstTemplate, variableDefaultsForTemplate(firstTemplate))
  )
  const [model, setModel] = useState(AGNES_IMAGE_DEFAULT_MODEL)
  const [size, setSize] = useState<AgnesImageSize>(firstTemplate.size)

  useEffect(() => {
    if (!open) return
    const defaults = variableDefaultsForTemplate(activeTemplate)
    setVariables(defaults)
    setPrompt(fillAgnesImagePrompt(activeTemplate, defaults))
    setSize(activeTemplate.size)
  }, [activeTemplate, open])

  if (!open) return null

  const updateVariable = (name: string, value: string): void => {
    const nextVariables = { ...variables, [name]: value }
    setVariables(nextVariables)
    setPrompt(fillAgnesImagePrompt(activeTemplate, nextVariables))
  }

  const canGenerate = !disabled && !generating && prompt.trim().length > 0 && model.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/38 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-2xl border border-ds-border bg-ds-card shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border-muted px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-ds-ink">
                {t('writeAgnesImageTitle')}
              </div>
              <div className="mt-1 truncate text-[12.5px] text-ds-faint">
                {t('writeAgnesImageSub')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-40"
            title={t('close')}
            aria-label={t('close')}
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-ds-border-muted bg-ds-main/32 p-3 lg:border-b-0 lg:border-r">
            <div className="px-2 pb-2 text-[12px] font-semibold text-ds-muted">
              {t('writeAgnesImageTemplate')}
            </div>
            <div className="grid gap-2">
              {AGNES_IMAGE_PROMPT_TEMPLATES.map((template) => {
                const active = template.id === activeTemplate.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    disabled={generating}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-accent/35 bg-accent/10 text-accent'
                        : 'border-ds-border-muted bg-ds-card/76 text-ds-ink hover:bg-ds-hover'
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <span className="block text-[13px] font-semibold">{template.title}</span>
                    <span className="mt-1 block text-[12px] leading-5 text-ds-faint">
                      {template.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto p-5">
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                {activeTemplate.variables.map((variable) => (
                  <label key={variable.name} className="grid gap-1.5 text-[12px] font-semibold text-ds-muted">
                    {variable.label}
                    <input
                      className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-main/45 px-3 py-2 text-[13.5px] font-normal text-ds-ink outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
                      value={variables[variable.name] ?? ''}
                      onChange={(event) => updateVariable(variable.name, event.target.value)}
                      disabled={generating}
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <label className="grid gap-1.5 text-[12px] font-semibold text-ds-muted">
                  {t('writeAgnesImageModel')}
                  <input
                    className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-main/45 px-3 py-2 text-[13.5px] font-normal text-ds-ink outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={generating}
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-semibold text-ds-muted">
                  {t('writeAgnesImageSize')}
                  <select
                    className="w-full min-w-0 rounded-xl border border-ds-border bg-ds-main/45 px-3 py-2 text-[13.5px] font-normal text-ds-ink outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
                    value={size}
                    onChange={(event) => setSize(event.target.value as AgnesImageSize)}
                    disabled={generating}
                  >
                    {AGNES_IMAGE_SIZES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-1.5 text-[12px] font-semibold text-ds-muted">
                {t('writeAgnesImagePrompt')}
                <textarea
                  className="min-h-[220px] w-full min-w-0 resize-y rounded-xl border border-ds-border bg-ds-main/45 px-3 py-3 text-[13.5px] font-normal leading-6 text-ds-ink outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={generating}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ds-border-muted px-5 py-4">
          <div className="max-w-2xl text-[12.5px] leading-5 text-ds-faint">
            {t('writeAgnesImageHint')}
          </div>
          <button
            type="button"
            onClick={() => onGenerate({ prompt, model, size })}
            disabled={!canGenerate}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.9} />
            ) : (
              <WandSparkles className="h-4 w-4" strokeWidth={1.9} />
            )}
            {generating ? t('writeAgnesImageGenerating') : t('writeAgnesImageGenerate')}
          </button>
        </div>
      </div>
    </div>
  )
}
