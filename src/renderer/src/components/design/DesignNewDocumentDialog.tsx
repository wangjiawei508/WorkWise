import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, FilePlus2, X } from 'lucide-react'
import {
  DEFAULT_DESIGN_CANVAS_FORMAT,
  DESIGN_CANVAS_FORMATS,
  DESIGN_CANVAS_PRESETS,
  canvasSizeForFormat,
  type DesignCanvasFormat
} from '@shared/design-document'

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (options: {
    name: string
    format: DesignCanvasFormat
    customSize?: { width: number; height: number }
  }) => void
}

/**
 * 新建文档对话框。
 *
 * 让用户选文档名 + 画布尺寸（9 种预设或自定义）。
 * 尺寸预设来自 DESIGN_CANVAS_PRESETS（✅ 已核实各预设尺寸）。
 * custom 格式时显示宽高输入框，支持任意正整数像素
 * （✅ canvas_contract.py 只要求正数 + 原点 0,0）。
 *
 * 对话框样式参考 WriteExportDialog（同项目对话框视觉一致性）。
 */
export function DesignNewDocumentDialog({ open, onClose, onCreate }: Props): ReactElement | null {
  const { t } = useTranslation('common')
  const [name, setName] = useState('')
  const [format, setFormat] = useState<DesignCanvasFormat>(DEFAULT_DESIGN_CANVAS_FORMAT)
  const [customWidth, setCustomWidth] = useState('1280')
  const [customHeight, setCustomHeight] = useState('720')

  if (!open) return null

  const handleCreate = (): void => {
    const trimmedName = name.trim() || t('designUntitled')
    const options: { name: string; format: DesignCanvasFormat; customSize?: { width: number; height: number } } = {
      name: trimmedName,
      format
    }
    if (format === 'custom') {
      const w = Math.max(1, Math.round(Number(customWidth) || 1280))
      const h = Math.max(1, Math.round(Number(customHeight) || 720))
      options.customSize = { width: w, height: h }
    }
    onCreate(options)
    // 重置
    setName('')
    setFormat(DEFAULT_DESIGN_CANVAS_FORMAT)
    setCustomWidth('1280')
    setCustomHeight('720')
  }

  // 预览当前选中尺寸
  const previewSize = canvasSizeForFormat(
    format,
    format === 'custom'
      ? { width: Number(customWidth) || 0, height: Number(customHeight) || 0 }
      : undefined
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/38 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl border border-ds-border bg-ds-card shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ds-border-muted px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <FilePlus2 className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-ds-ink">
                {t('designNewDocumentTitle')}
              </div>
              <div className="mt-1 truncate text-[12.5px] text-ds-faint">
                {t('designNewDocumentSub')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover hover:text-ds-ink"
            aria-label={t('cancel')}
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* 文档名 */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12.5px] font-medium text-ds-ink">
              {t('designDocumentName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('designDocumentNamePlaceholder')}
              className="w-full rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[13px] text-ds-ink outline-none focus:border-accent"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
          </div>

          {/* 尺寸预设网格 */}
          <div className="mb-2">
            <label className="mb-1.5 block text-[12.5px] font-medium text-ds-ink">
              {t('designCanvasSize')}
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DESIGN_CANVAS_PRESETS.map((preset) => (
              <SizePresetCard
                key={preset.format}
                selected={format === preset.format}
                onClick={() => setFormat(preset.format)}
                label={t(preset.labelKey)}
                width={preset.width}
                height={preset.height}
              />
            ))}
            {/* 自定义 */}
            <SizePresetCard
              selected={format === 'custom'}
              onClick={() => setFormat('custom')}
              label={t('designFormatCustom')}
              width={null}
              height={null}
            />
          </div>

          {/* 自定义尺寸输入 */}
          {format === 'custom' ? (
            <div className="mt-3 rounded-xl border border-ds-border-muted bg-ds-subtle/40 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ds-faint">
                    {t('designCustomWidth')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    className="w-full rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[13px] text-ds-ink outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-ds-faint">
                    {t('designCustomHeight')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    className="w-full rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[13px] text-ds-ink outline-none focus:border-accent"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-ds-faint">
                {t('designCustomHint', { width: previewSize.width, height: previewSize.height })}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11.5px] text-ds-faint">
              {previewSize.width} × {previewSize.height} px
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-ds-border-muted px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-accent/90"
          >
            <FilePlus2 className="h-3.5 w-3.5" strokeWidth={1.9} />
            {t('designCreate')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 尺寸预设卡片。显示格式名 + 尺寸 + 缩略比例框。
 */
function SizePresetCard({
  selected,
  onClick,
  label,
  width,
  height
}: {
  selected: boolean
  onClick: () => void
  label: string
  width: number | null
  height: number | null
}): ReactElement {
  // 计算缩略框的宽高比（最大 32×24 内）
  let thumbW = 24
  let thumbH = 18
  if (width !== null && height !== null && width > 0 && height > 0) {
    const ratio = width / height
    if (ratio >= 1) {
      thumbW = 28
      thumbH = Math.max(8, Math.round(28 / ratio))
    } else {
      thumbH = 24
      thumbW = Math.max(8, Math.round(24 * ratio))
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 transition ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-ds-border bg-ds-card hover:border-ds-border-muted hover:bg-ds-hover/40'
      }`}
    >
      <div className="flex h-7 items-center justify-center">
        <div
          className={`rounded-sm border-2 ${selected ? 'border-accent' : 'border-ds-faint/40'}`}
          style={{ width: thumbW, height: thumbH }}
        />
      </div>
      <span className={`text-[11.5px] font-medium ${selected ? 'text-accent' : 'text-ds-ink'}`}>
        {label}
      </span>
      {width !== null && height !== null ? (
        <span className="text-[10px] text-ds-faint">{width}×{height}</span>
      ) : (
        <span className="text-[10px] text-ds-faint">∞</span>
      )}
      {selected ? (
        <Check className="h-3 w-3 text-accent" strokeWidth={2.2} />
      ) : null}
    </button>
  )
}
