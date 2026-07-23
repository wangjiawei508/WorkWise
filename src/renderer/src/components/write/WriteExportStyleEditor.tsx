import { type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHINESE_FONT_SIZES,
  EXPORT_CJK_FONTS,
  EXPORT_INDENTATION_TYPES,
  EXPORT_LINE_SPACING_TYPES,
  EXPORT_TEXT_ALIGNMENTS,
  EXPORT_WESTERN_FONTS,
  STANDARD_COLORS,
  STANDARD_NUMERIC_SIZES,
  type ExportElementStyle,
  type ExportIndentationType,
  type ExportLineSpacingType,
  type ExportTextAlignment
} from '@shared/write-export-templates'

type Props = {
  style: ExportElementStyle
  onChange: (patch: Partial<ExportElementStyle>) => void
}

const ALIGNMENT_LABEL_KEYS: Record<ExportTextAlignment, string> = {
  left: 'writeExportAlignLeft',
  center: 'writeExportAlignCenter',
  right: 'writeExportAlignRight',
  both: 'writeExportAlignJustify'
}

const LINE_SPACING_LABEL_KEYS: Record<ExportLineSpacingType, string> = {
  single: 'writeExportLineSingle',
  '1.5': 'writeExportLine1_5',
  double: 'writeExportLineDouble',
  atLeast: 'writeExportLineAtLeast',
  fixed: 'writeExportLineFixed',
  multiple: 'writeExportLineMultiple'
}

const INDENT_LABEL_KEYS: Record<ExportIndentationType, string> = {
  none: 'writeExportIndentNone',
  firstLine: 'writeExportIndentFirstLine',
  hanging: 'writeExportIndentHanging'
}

// 合并中文字号名和数值字号，去重
const ALL_FONT_SIZES = (() => {
  const seen = new Set<number>()
  const merged: Array<{ label: string; value: number }> = []
  for (const { label, value } of CHINESE_FONT_SIZES) {
    if (!seen.has(value)) {
      merged.push({ label: `${label} (${value}pt)`, value })
      seen.add(value)
    }
  }
  for (const value of STANDARD_NUMERIC_SIZES) {
    if (!seen.has(value)) {
      merged.push({ label: `${value}pt`, value })
      seen.add(value)
    }
  }
  return merged.sort((a, b) => b.value - a.value)
})()

export function WriteExportStyleEditor({ style, onChange }: Props): ReactElement {
  const { t } = useTranslation('common')

  // fixed/atLeast 显示 pt 输入；multiple 显示行数输入；single/1.5/double 不显示
  const showLineSpacingValue = ['atLeast', 'fixed', 'multiple'].includes(style.lineSpacingType)
  const showIndentValue = style.indentationType !== 'none'

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
      {/* 西文字体 */}
      <Field label={t('writeExportFontAscii')}>
        <select
          value={style.fontFamilyAscii}
          onChange={(e) => onChange({ fontFamilyAscii: e.target.value })}
          className={selectClass}
        >
          {EXPORT_WESTERN_FONTS.map((font) => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </Field>

      {/* 中文字体 */}
      <Field label={t('writeExportFontEastAsia')}>
        <select
          value={style.fontFamilyEastAsia}
          onChange={(e) => onChange({ fontFamilyEastAsia: e.target.value })}
          className={selectClass}
        >
          {EXPORT_CJK_FONTS.map((font) => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </Field>

      {/* 字号 */}
      <Field label={t('writeExportFontSize')}>
        <select
          value={style.fontSize}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className={selectClass}
        >
          {ALL_FONT_SIZES.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>

      {/* 颜色 */}
      <Field label={t('writeExportColor')}>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={`#${style.color}`}
            onChange={(e) => onChange({ color: e.target.value.replace('#', '').toUpperCase() })}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-ds-border bg-transparent"
            aria-label={t('writeExportColorPicker')}
          />
          <input
            type="text"
            value={style.color}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 6)
              onChange({ color: val })
            }}
            className="min-w-0 flex-1 rounded-lg border border-ds-border bg-ds-card px-2 py-1.5 font-mono text-[12px] text-ds-ink outline-none focus:border-accent"
            placeholder="000000"
          />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {STANDARD_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ color })}
              className="h-4 w-4 rounded border border-black/10 transition hover:scale-110"
              style={{ backgroundColor: `#${color}` }}
              title={`#${color}`}
              aria-label={color}
            />
          ))}
        </div>
      </Field>

      {/* 粗体 / 斜体 */}
      <Field label={t('writeExportTextStyle')}>
        <div className="flex gap-1.5">
          <ToggleButton
            active={style.bold}
            onClick={() => onChange({ bold: !style.bold })}
            label="B"
            labelClass="font-bold"
          />
          <ToggleButton
            active={style.italic}
            onClick={() => onChange({ italic: !style.italic })}
            label="I"
            labelClass="italic"
          />
        </div>
      </Field>

      {/* 对齐 */}
      <Field label={t('writeExportAlignment')}>
        <select
          value={style.alignment}
          onChange={(e) => onChange({ alignment: e.target.value as ExportTextAlignment })}
          className={selectClass}
        >
          {EXPORT_TEXT_ALIGNMENTS.map((align) => (
            <option key={align} value={align}>{t(ALIGNMENT_LABEL_KEYS[align])}</option>
          ))}
        </select>
      </Field>

      {/* 段前 */}
      <Field label={t('writeExportSpacingBefore')}>
        <input
          type="number"
          min={0}
          max={20}
          step={0.1}
          value={style.spacingBefore}
          onChange={(e) => onChange({ spacingBefore: Number(e.target.value) || 0 })}
          className={inputClass}
        />
      </Field>

      {/* 段后 */}
      <Field label={t('writeExportSpacingAfter')}>
        <input
          type="number"
          min={0}
          max={20}
          step={0.1}
          value={style.spacingAfter}
          onChange={(e) => onChange({ spacingAfter: Number(e.target.value) || 0 })}
          className={inputClass}
        />
      </Field>

      {/* 行距类型 */}
      <Field label={t('writeExportLineSpacing')}>
        <select
          value={style.lineSpacingType}
          onChange={(e) => onChange({ lineSpacingType: e.target.value as ExportLineSpacingType })}
          className={selectClass}
        >
          {EXPORT_LINE_SPACING_TYPES.map((type) => (
            <option key={type} value={type}>{t(LINE_SPACING_LABEL_KEYS[type])}</option>
          ))}
        </select>
      </Field>

      {/* 行距值（仅 fixed/atLeast/multiple 显示） */}
      {showLineSpacingValue ? (
        <Field
          label={
            style.lineSpacingType === 'multiple'
              ? t('writeExportLineSpacingValueLines')
              : t('writeExportLineSpacingValuePt')
          }
        >
          <input
            type="number"
            min={0}
            max={200}
            step={style.lineSpacingType === 'multiple' ? 0.1 : 1}
            value={style.lineSpacingValue}
            onChange={(e) => onChange({ lineSpacingValue: Number(e.target.value) || 0 })}
            className={inputClass}
          />
        </Field>
      ) : null}

      {/* 缩进类型 */}
      <Field label={t('writeExportIndentation')}>
        <select
          value={style.indentationType}
          onChange={(e) => onChange({ indentationType: e.target.value as ExportIndentationType })}
          className={selectClass}
        >
          {EXPORT_INDENTATION_TYPES.map((type) => (
            <option key={type} value={type}>{t(INDENT_LABEL_KEYS[type])}</option>
          ))}
        </select>
      </Field>

      {/* 缩进值（仅非 none 显示） */}
      {showIndentValue ? (
        <Field label={t('writeExportIndentValue')}>
          <input
            type="number"
            min={0}
            max={40}
            step={0.5}
            value={style.indentationValue}
            onChange={(e) => onChange({ indentationValue: Number(e.target.value) || 0 })}
            className={inputClass}
          />
        </Field>
      ) : null}
    </div>
  )
}

// --- 内部组件与样式常量 ---

const selectClass =
  'w-full rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[12.5px] text-ds-ink outline-none focus:border-accent'

const inputClass = selectClass

function Field({ label, children }: { label: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-ds-faint">{label}</label>
      {children}
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  label,
  labelClass
}: {
  active: boolean
  onClick: () => void
  label: string
  labelClass?: string
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-[13px] transition ${
        active
          ? 'border-accent bg-accent/12 text-accent'
          : 'border-ds-border bg-ds-card text-ds-faint hover:bg-ds-hover/60'
      } ${labelClass ?? ''}`}
    >
      {label}
    </button>
  )
}
