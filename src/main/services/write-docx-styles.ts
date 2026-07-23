/**
 * Write 导出模板 —— 样式换算纯函数。
 *
 * 把 ExportElementStyle（模板里的抽象样式）转换为 docx 库能直接消费的
 * IRunOptions（文本运行属性）和 IParagraphOptions（段落属性）。
 *
 * 关键换算逻辑：
 * - 字号：pt → half-points（docx 用半磅，size = fontSize * 2）
 * - 行距：根据 lineSpacingType 走不同换算路径
 *   · single=240/auto, 1.5=360/auto, double=480/auto（240 = 1 行的 twip 基准）
 *   · fixed/atLeast：pt → twip（val * 20），lineRule 为 exact/atLeast
 *   · multiple：行数 → 240ths（val * 240），lineRule 为 auto
 * - 缩进：按字号算字符宽度 twip（charWidthTwips = fontSize * 20），
 *   实现"首行缩进 2 字符"这类中文排版需求。用显式 twips 比 firstLineChars
 *   在各 Word 版本中更可靠。
 * - 字体：ascii/hAnsi 用西文字体，eastAsia 用中文字体，hint: 'eastAsia'
 *   是 CJK 正确渲染的关键（缺省会让中文回退到西文字体）。
 *
 * 移植自独立项目 Md2webV2 的 services/docxUtils/styles.ts，适配 WorkWise 类型。
 */
import { AlignmentType } from 'docx'
import {
  BUILTIN_EXPORT_TEMPLATES,
  cloneExportTemplate,
  DEFAULT_EXPORT_TEMPLATE_ID,
  type ExportElementStyle,
  type ExportElementType,
  type ExportPageLayout,
  type ExportStyleTemplate,
  type ExportTextAlignment
} from '../../shared/write-export-templates'

// ---------------------------------------------------------------------------
// 行距换算
// ---------------------------------------------------------------------------

/**
 * 1 行 = 240 twip 是 docx/Word 的标准基准（基于 12pt 单倍行距）。
 * single → 240, 1.5 → 360, double → 480。
 */
const SINGLE_LINE_TWIPS = 240

type LineSpacingResult = {
  /** 行距值，单位 twip */
  line: number
  /** 行距规则：auto（比例）/ exact（精确）/ atLeast（最小） */
  lineRule: 'auto' | 'exact' | 'atLeast'
}

function resolveLineSpacing(style: ExportElementStyle): LineSpacingResult {
  switch (style.lineSpacingType) {
    case 'single':
      return { line: SINGLE_LINE_TWIPS, lineRule: 'auto' }
    case '1.5':
      return { line: Math.round(1.5 * SINGLE_LINE_TWIPS), lineRule: 'auto' }
    case 'double':
      return { line: Math.round(2 * SINGLE_LINE_TWIPS), lineRule: 'auto' }
    case 'atLeast':
      // lineSpacingValue 单位 pt → twip（1pt = 20 twip）
      return { line: Math.round(style.lineSpacingValue * 20), lineRule: 'atLeast' }
    case 'fixed':
      return { line: Math.round(style.lineSpacingValue * 20), lineRule: 'exact' }
    case 'multiple':
      // lineSpacingValue 单位 行 → 240ths
      return { line: Math.round(style.lineSpacingValue * SINGLE_LINE_TWIPS), lineRule: 'auto' }
    default:
      return { line: SINGLE_LINE_TWIPS, lineRule: 'auto' }
  }
}

// ---------------------------------------------------------------------------
// 行（段前/段后）→ twip 换算
// ---------------------------------------------------------------------------

/** 行数 → twip（1 行 = 240 twip） */
function linesToTwips(lines: number): number {
  return Math.round(lines * SINGLE_LINE_TWIPS)
}

// ---------------------------------------------------------------------------
// 对齐映射
// ---------------------------------------------------------------------------

function resolveAlignment(align: ExportTextAlignment): (typeof AlignmentType)[keyof typeof AlignmentType] {
  switch (align) {
    case 'center':
      return AlignmentType.CENTER
    case 'right':
      return AlignmentType.RIGHT
    case 'both':
      // Word 的"两端对齐"在 docx 里是 BOTH
      return AlignmentType.BOTH
    case 'left':
    default:
      return AlignmentType.LEFT
  }
}

// ---------------------------------------------------------------------------
// 缩进换算
// ---------------------------------------------------------------------------

type IndentResult = {
  firstLine?: number
  left?: number
  hanging?: number
}

/**
 * 把缩进配置换算为 docx 的 indent twip 值。
 * 字符宽度按字号估算：1 字符 ≈ fontSize pt = fontSize * 20 twip。
 * 这样"首行缩进 2 字符"在 16pt 正文下就是 2 * 16 * 20 = 640 twip。
 */
function resolveIndent(style: ExportElementStyle): IndentResult {
  const charWidthTwips = Math.max(1, style.fontSize) * 20
  if (style.indentationType === 'firstLine') {
    return { firstLine: Math.round(style.indentationValue * charWidthTwips) }
  }
  if (style.indentationType === 'hanging') {
    // 悬挂缩进：整段右移，首行回退。left 和 hanging 设相同值。
    const val = Math.round(style.indentationValue * charWidthTwips)
    return { left: val, hanging: val }
  }
  return {}
}

// ---------------------------------------------------------------------------
// 导出的换算函数
// ---------------------------------------------------------------------------

/**
 * 把 ExportElementStyle 转换为 docx TextRun 的属性片段。
 * 返回的片段可 spread 进 TextRun / textRun 工厂函数的 options。
 */
export function elementStyleToRunOptions(style: ExportElementStyle): {
  font: { ascii: string; hAnsi: string; eastAsia: string; hint: 'eastAsia' }
  size: number
  color: string
  bold: boolean
  italics: boolean
} {
  return {
    font: {
      ascii: style.fontFamilyAscii,
      hAnsi: style.fontFamilyAscii,
      eastAsia: style.fontFamilyEastAsia,
      hint: 'eastAsia'
    },
    // docx 用半磅：12pt → size 24
    size: Math.round(style.fontSize * 2),
    color: style.color,
    bold: style.bold,
    italics: style.italic
  }
}

/**
 * 把 ExportElementStyle 转换为 docx Paragraph 的 spacing/alignment/indent 属性片段。
 * 返回的片段可 spread 进 Paragraph 构造函数的 options。
 */
export function elementStyleToParagraphOptions(style: ExportElementStyle): {
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType]
  indent: IndentResult
  spacing: { before: number; after: number; line: number; lineRule: 'auto' | 'exact' | 'atLeast' }
} {
  const { line, lineRule } = resolveLineSpacing(style)
  return {
    alignment: resolveAlignment(style.alignment),
    indent: resolveIndent(style),
    spacing: {
      before: linesToTwips(style.spacingBefore),
      after: linesToTwips(style.spacingAfter),
      line,
      lineRule
    }
  }
}

/**
 * 把 ExportPageLayout 转换为 docx section properties 的 page.margin 片段。
 */
export function pageLayoutToSectionMargin(layout: ExportPageLayout): {
  top: number
  right: number
  bottom: number
  left: number
} {
  return {
    top: layout.marginTop,
    right: layout.marginRight,
    bottom: layout.marginBottom,
    left: layout.marginLeft
  }
}

// ---------------------------------------------------------------------------
// 模板解析（合并内置 + 用户 + 本次覆盖）
// ---------------------------------------------------------------------------

/**
 * 解析模板 id（可带本次覆盖），返回最终生效的 ExportStyleTemplate。
 *
 * 查找顺序：
 * 1. 在 userTemplates 中找（用户自定义模板优先）
 * 2. 在内置模板中找
 * 3. 都找不到则回退到默认模板（builtin-academic）
 *
 * 找到后，若提供了 styleOverride，则深拷贝该模板并逐元素合并覆盖
 * （只覆盖 override 中出现的元素/字段，不影响其他元素）。
 *
 * @param templateId 模板 id，缺省用默认模板
 * @param userTemplates 用户自定义模板列表（来自设置）
 * @param styleOverride 本次导出的临时样式覆盖（不持久化）
 */
export function resolveExportTemplate(
  templateId: string | undefined,
  userTemplates: ExportStyleTemplate[] = [],
  styleOverride?: Partial<Record<ExportElementType, Partial<ExportElementStyle>>>
): ExportStyleTemplate {
  const id = templateId && templateId.trim() ? templateId.trim() : DEFAULT_EXPORT_TEMPLATE_ID

  let base: ExportStyleTemplate | undefined
  // 用户模板优先（允许用户用同 id 覆盖内置样式）
  base = userTemplates.find((t) => t.id === id)
  if (!base) {
    base = BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === id)
  }
  if (!base) {
    base = BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === DEFAULT_EXPORT_TEMPLATE_ID) ?? BUILTIN_EXPORT_TEMPLATES[0]
  }

  // 深拷贝，避免污染内置模板或用户模板源数据
  const resolved = cloneExportTemplate(base)

  if (styleOverride) {
    for (const [elementType, override] of Object.entries(styleOverride)) {
      const key = elementType as ExportElementType
      if (resolved.styles[key] && override) {
        resolved.styles[key] = { ...resolved.styles[key], ...override }
      }
    }
  }

  return resolved
}

// mergeBuiltinAndUserTemplates 已移至 shared/write-export-templates.ts
// （它是纯数据函数，renderer 也需要用）。此处 re-export 保持 main 侧 import 兼容。
export { mergeBuiltinAndUserTemplates } from '../../shared/write-export-templates'
