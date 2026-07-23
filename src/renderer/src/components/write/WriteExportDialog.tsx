import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ChevronDown, Download, FileText, Loader2, Save, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  BUILTIN_TEMPLATE_IDS,
  cloneExportTemplate,
  type ExportElementType,
  type ExportElementStyle,
  type ExportStyleTemplate
} from '@shared/write-export-templates'
import { WriteExportStyleEditor } from './WriteExportStyleEditor'
import { WriteExportTemplateSelect } from './WriteExportTemplateSelect'

type Props = {
  open: boolean
  exporting: boolean
  /** 合并后的全部模板（内置 + 用户自定义） */
  templates: ExportStyleTemplate[]
  /** 当前默认模板 id */
  defaultTemplateId: string
  onClose: () => void
  /** 执行导出，传入选定的模板 id 和本次覆盖样式 */
  onExport: (payload: { templateId: string; styleOverride?: Partial<Record<ExportElementType, Partial<ExportElementStyle>>> }) => void
  /** 保存用户模板（新增或更新）。返回保存后的模板列表 */
  onSaveTemplate: (template: ExportStyleTemplate) => Promise<void>
  /** 删除用户模板（内置不可删） */
  onDeleteTemplate: (templateId: string) => Promise<void>
  /** 设为默认模板 */
  onSetDefaultTemplate: (templateId: string) => Promise<void>
}

const ELEMENT_TABS: ReadonlyArray<{ key: ExportElementType; icon: typeof FileText }> = [
  { key: 'h1', icon: FileText },
  { key: 'h2', icon: FileText },
  { key: 'h3', icon: FileText },
  { key: 'p', icon: FileText },
  { key: 'table', icon: FileText },
  { key: 'code', icon: FileText }
]

export function WriteExportDialog({
  open,
  exporting,
  templates,
  defaultTemplateId,
  onClose,
  onExport,
  onSaveTemplate,
  onDeleteTemplate,
  onSetDefaultTemplate
}: Props): ReactElement | null {
  const { t } = useTranslation('common')
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplateId)
  const [activeElement, setActiveElement] = useState<ExportElementType>('p')
  const [showAdvanced, setShowAdvanced] = useState(false)
  /** 本次导出的临时样式覆盖（编辑后未保存为模板的调整） */
  const [styleOverride, setStyleOverride] = useState<Partial<Record<ExportElementType, Partial<ExportElementStyle>>>>({})
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [operationError, setOperationError] = useState('')

  // 对话框打开时重置状态
  useEffect(() => {
    if (open) {
      setSelectedTemplateId(defaultTemplateId)
      setStyleOverride({})
      setShowAdvanced(false)
      setSaveDialogOpen(false)
      setNewTemplateName('')
      setOperationError('')
    }
  }, [open, defaultTemplateId])

  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === selectedTemplateId) ?? templates[0],
    [templates, selectedTemplateId]
  )

  // 当前生效的样式（模板 + 本次覆盖）
  const effectiveStyle = useMemo<ExportElementStyle | undefined>(() => {
    if (!selectedTemplate) return undefined
    const base = selectedTemplate.styles[activeElement]
    const override = styleOverride[activeElement]
    return override ? { ...base, ...override } : base
  }, [selectedTemplate, activeElement, styleOverride])

  if (!open || !selectedTemplate) return null

  const isBuiltin = BUILTIN_TEMPLATE_IDS.has(selectedTemplate.id)

  const updateElementStyle = (elementType: ExportElementType, patch: Partial<ExportElementStyle>): void => {
    setStyleOverride((prev) => ({
      ...prev,
      [elementType]: { ...prev[elementType], ...patch }
    }))
  }

  const handleSaveAsTemplate = async (): Promise<void> => {
    const name = newTemplateName.trim()
    if (!name) return
    setSaving(true)
    setOperationError('')
    try {
      // 基于当前模板 + 本次覆盖，生成新模板
      const base = cloneExportTemplate(selectedTemplate)
      for (const elementType of Object.keys(styleOverride) as ExportElementType[]) {
        const override = styleOverride[elementType]
        if (override) {
          base.styles[elementType] = { ...base.styles[elementType], ...override }
        }
      }
      const newTemplate: ExportStyleTemplate = {
        ...base,
        id: `user-${crypto.randomUUID()}`,
        name,
        builtin: false,
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      await onSaveTemplate(newTemplate)
      setSelectedTemplateId(newTemplate.id)
      setStyleOverride({})
      setSaveDialogOpen(false)
      setNewTemplateName('')
    } catch (error) {
      setOperationError(
        t('writeExportTemplateOperationFailed', {
          message: error instanceof Error ? error.message : String(error)
        })
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (templateId = selectedTemplate.id): Promise<void> => {
    if (BUILTIN_TEMPLATE_IDS.has(templateId)) return
    setOperationError('')
    try {
      await onDeleteTemplate(templateId)
      if (templateId === selectedTemplateId) {
        setSelectedTemplateId(defaultTemplateId)
      }
    } catch (error) {
      setOperationError(
        t('writeExportTemplateOperationFailed', {
          message: error instanceof Error ? error.message : String(error)
        })
      )
    }
  }

  const handleSetDefaultTemplate = async (templateId: string): Promise<void> => {
    setOperationError('')
    try {
      await onSetDefaultTemplate(templateId)
    } catch (error) {
      setOperationError(
        t('writeExportTemplateOperationFailed', {
          message: error instanceof Error ? error.message : String(error)
        })
      )
    }
  }

  const handleExport = (): void => {
    onExport({
      templateId: selectedTemplate.id,
      styleOverride: Object.keys(styleOverride).length > 0 ? styleOverride : undefined
    })
  }

  const hasOverride = Object.keys(styleOverride).length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/38 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl min-w-0 flex-col overflow-hidden rounded-2xl border border-ds-border bg-ds-card shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border-muted px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <Download className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-ds-ink">
                {t('writeExportDialogTitle')}
              </div>
              <div className="mt-1 truncate text-[12.5px] text-ds-faint">
                {t('writeExportDialogSub')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover hover:text-ds-ink"
            aria-label={t('writeExportDialogClose')}
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* 模板选择 */}
          <WriteExportTemplateSelect
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
            onSetDefault={handleSetDefaultTemplate}
            onDelete={handleDeleteTemplate}
            isBuiltin={isBuiltin}
          />

          {operationError ? (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-red-200/80 bg-red-50/90 px-3 py-2 text-[12px] text-red-700 dark:border-red-900/60 dark:bg-red-950/70 dark:text-red-200"
            >
              {operationError}
            </div>
          ) : null}

          {/* 高级样式设置（可折叠） */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[13px] font-medium text-ds-ink transition hover:bg-ds-hover/60"
            >
              <span>{t('writeExportAdvancedSettings')}</span>
              <ChevronDown
                className={`h-4 w-4 text-ds-faint transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                strokeWidth={1.9}
              />
            </button>

            {showAdvanced ? (
              <div className="mt-2 rounded-xl border border-ds-border-muted bg-ds-subtle/40 p-3">
                {/* 元素类型 Tab */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {ELEMENT_TABS.map(({ key, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveElement(key)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                        activeElement === key
                          ? 'bg-accent/15 text-accent'
                          : 'text-ds-faint hover:bg-ds-hover/60 hover:text-ds-ink'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                      {t(`writeExportElement_${key}`)}
                    </button>
                  ))}
                </div>

                {/* 当前元素的样式编辑器 */}
                {effectiveStyle ? (
                  <WriteExportStyleEditor
                    style={effectiveStyle}
                    onChange={(patch) => updateElementStyle(activeElement, patch)}
                  />
                ) : null}

                {hasOverride ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
                    {t('writeExportHasOverride')}
                    <button
                      type="button"
                      onClick={() => setStyleOverride({})}
                      className="ml-auto font-semibold underline-offset-2 hover:underline"
                    >
                      {t('writeExportResetOverride')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 另存为新模板 */}
          {saveDialogOpen ? (
            <div className="mt-4 rounded-xl border border-ds-border-muted bg-ds-subtle/40 p-3">
              <div className="text-[13px] font-medium text-ds-ink">{t('writeExportSaveAsTitle')}</div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder={t('writeExportSaveAsPlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[13px] text-ds-ink outline-none focus:border-accent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveAsTemplate()
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSaveAsTemplate()}
                  disabled={!newTemplateName.trim() || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.9} /> : <Save className="h-3.5 w-3.5" strokeWidth={1.9} />}
                  {t('writeExportSaveAsConfirm')}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-ds-border-muted px-5 py-3.5">
          <div className="flex items-center gap-2">
            {!isBuiltin ? (
              <button
                type="button"
                onClick={() => void handleDeleteTemplate()}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-red-600 transition hover:bg-red-500/10 dark:text-red-300"
                title={t('writeExportDeleteTemplate')}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                {t('writeExportDeleteTemplate')}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSaveDialogOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-ds-border px-3 py-2 text-[13px] font-medium text-ds-ink transition hover:bg-ds-hover/60"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={1.9} />
              {t('writeExportSaveAsTemplate')}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.9} /> : <Download className="h-3.5 w-3.5" strokeWidth={1.9} />}
              {t('writeExportConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
