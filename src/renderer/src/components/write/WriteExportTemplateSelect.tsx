import { useState, type ReactElement } from 'react'
import { Check, ChevronDown, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExportStyleTemplate } from '@shared/write-export-templates'

type Props = {
  templates: ExportStyleTemplate[]
  selectedId: string
  isBuiltin: boolean
  onSelect: (id: string) => void
  onSetDefault: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function WriteExportTemplateSelect({
  templates,
  selectedId,
  isBuiltin,
  onSelect,
  onSetDefault,
  onDelete
}: Props): ReactElement {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const selected = templates.find((tpl) => tpl.id === selectedId) ?? templates[0]

  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-medium text-ds-ink">
        {t('writeExportTemplate')}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-left text-[13px] text-ds-ink transition hover:border-accent/60"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.isDefault ? (
              <Star className="h-3.5 w-3.5 shrink-0 fill-accent text-accent" strokeWidth={1.9} />
            ) : null}
            <span className="truncate font-medium">{selected?.name}</span>
            {selected?.nameEn ? (
              <span className="truncate text-[11.5px] text-ds-faint">{selected.nameEn}</span>
            ) : null}
            {selected?.builtin ? (
              <span className="shrink-0 rounded bg-ds-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ds-faint">
                {t('writeExportBuiltinBadge')}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ds-faint transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.9}
          />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-ds-border bg-ds-card/98 p-1 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 transition ${
                  tpl.id === selectedId ? 'bg-accent/10' : 'hover:bg-ds-hover/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(tpl.id)
                    setOpen(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {tpl.id === selectedId ? (
                      <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ds-ink">{tpl.name}</span>
                      {tpl.builtin ? (
                        <span className="shrink-0 rounded bg-ds-subtle px-1 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ds-faint">
                          {t('writeExportBuiltinBadge')}
                        </span>
                      ) : null}
                    </span>
                    {tpl.nameEn ? (
                      <span className="block truncate text-[11px] text-ds-faint">{tpl.nameEn}</span>
                    ) : null}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void onSetDefault(tpl.id)}
                    className={`flex h-6 w-6 items-center justify-center rounded-md transition hover:bg-ds-hover ${
                      tpl.isDefault ? 'text-accent' : 'text-ds-faint hover:text-ds-ink'
                    }`}
                    title={t('writeExportSetDefault')}
                  >
                    <Star className={`h-3.5 w-3.5 ${tpl.isDefault ? 'fill-accent' : ''}`} strokeWidth={1.9} />
                  </button>
                  {!tpl.builtin ? (
                    <button
                      type="button"
                      onClick={() => void onDelete(tpl.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-ds-faint transition hover:bg-red-500/10 hover:text-red-600"
                      title={t('writeExportDeleteTemplate')}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {isBuiltin ? (
        <p className="mt-1.5 text-[11.5px] text-ds-faint">{t('writeExportBuiltinHint')}</p>
      ) : null}
    </div>
  )
}
