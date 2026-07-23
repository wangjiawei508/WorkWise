/**
 * Write 工作台 Word 导出模板系统 —— 共享数据模型与内置模板。
 *
 * 本文件是 renderer / main / preload 三层共享的单一数据源：
 * - 类型定义（ExportElementStyle / ExportStyleTemplate 等）
 * - 字体、字号、颜色枚举（供 UI 下拉框使用）
 * - 4 个内置模板的精确样式值（学术论文 / 行政公文 / 商务报告 / 技术文档）
 *
 * 设计来源：移植自独立项目 Md2webV2 的 types.ts / constants.ts，
 * 适配 WorkWise 命名风格（Export 前缀）并新增 pageLayout（页边距）与 builtin 标记。
 *
 * 中西文字体分离是中文排版的关键：docx 的 run font 需同时设置
 * ascii/hAnsi（西文）与 eastAsia（中文），并指定 hint: 'eastAsia'，
 * 否则中文字符会回退到西文字体显示。
 */

// ---------------------------------------------------------------------------
// 元素类型：Markdown → docx 映射中可配置样式的 6 类元素
// ---------------------------------------------------------------------------

export const EXPORT_ELEMENT_TYPES = ['h1', 'h2', 'h3', 'p', 'table', 'code'] as const

export type ExportElementType = (typeof EXPORT_ELEMENT_TYPES)[number]

// ---------------------------------------------------------------------------
// 行距 / 对齐 / 缩进 枚举
// ---------------------------------------------------------------------------

export const EXPORT_LINE_SPACING_TYPES = [
  'single',
  '1.5',
  'double',
  'atLeast',
  'fixed',
  'multiple'
] as const

export type ExportLineSpacingType = (typeof EXPORT_LINE_SPACING_TYPES)[number]

export const EXPORT_TEXT_ALIGNMENTS = ['left', 'center', 'right', 'both'] as const

export type ExportTextAlignment = (typeof EXPORT_TEXT_ALIGNMENTS)[number]

export const EXPORT_INDENTATION_TYPES = ['none', 'firstLine', 'hanging'] as const

export type ExportIndentationType = (typeof EXPORT_INDENTATION_TYPES)[number]

// ---------------------------------------------------------------------------
// 单元素样式（14 项可配置）
// ---------------------------------------------------------------------------

export type ExportElementStyle = {
  /** 西文字体（ascii / hAnsi） */
  fontFamilyAscii: string
  /** 中文字体（eastAsia） */
  fontFamilyEastAsia: string
  /** 字号，单位 pt */
  fontSize: number
  /** 颜色，hex 无 #，如 '000000' */
  color: string
  bold: boolean
  italic: boolean
  /** 段前，单位：行 */
  spacingBefore: number
  /** 段后，单位：行 */
  spacingAfter: number
  lineSpacingType: ExportLineSpacingType
  /**
   * 行距值：
   * - single / 1.5 / double：忽略此值
   * - fixed / atLeast：单位 pt
   * - multiple：单位 行
   */
  lineSpacingValue: number
  alignment: ExportTextAlignment
  indentationType: ExportIndentationType
  /** 缩进值，单位：字符数（如首行缩进 2 字符） */
  indentationValue: number
}

// ---------------------------------------------------------------------------
// 页面布局（页边距，公文排版必备）
// ---------------------------------------------------------------------------

export type ExportPageLayout = {
  /** 上边距，单位 twip（1 inch = 1440 twip） */
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
}

// ---------------------------------------------------------------------------
// 完整模板
// ---------------------------------------------------------------------------

export type ExportStyleTemplate = {
  /** 模板 id，内置以 'builtin-' 开头，用户自定义以 'user-' 开头 */
  id: string
  /** 显示名（中文） */
  name: string
  /** 显示名（英文，可选） */
  nameEn?: string
  /** 内置模板不可删除、不可改名 */
  builtin: boolean
  /** 是否默认模板（合并后保证全表有且仅有一个 default） */
  isDefault: boolean
  pageLayout: ExportPageLayout
  styles: Record<ExportElementType, ExportElementStyle>
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// 字体枚举（22 种：11 西文 + 11 中文，含公文专用字体）
// ---------------------------------------------------------------------------

/** 西文字体列表 */
export const EXPORT_WESTERN_FONTS = [
  'Times New Roman',
  'Arial',
  'Segoe UI',
  'Helvetica',
  'Calibri',
  'Georgia',
  'Palatino',
  'Crimson Pro',
  'JetBrains Mono',
  'Consolas',
  'Courier New'
] as const

/** 中文字体列表（含公文专用方正小标宋简体、仿宋_GB2312） */
export const EXPORT_CJK_FONTS = [
  '宋体',
  '黑体',
  '楷体',
  '仿宋',
  '等线',
  '等线 Light',
  '微软雅黑',
  '苹方',
  '华文宋体',
  '华文黑体',
  '方正小标宋简体',
  '仿宋_GB2312'
] as const

// ---------------------------------------------------------------------------
// 字号枚举（中文字号名 + 数值字号）
// ---------------------------------------------------------------------------

/** 中文字号名 → pt 值，对应 Word 字号下拉中的"初号/小初/..."选项 */
export const CHINESE_FONT_SIZES: ReadonlyArray<{ label: string; value: number }> = [
  { label: '初号', value: 42 },
  { label: '小初', value: 36 },
  { label: '一号', value: 26 },
  { label: '小一', value: 24 },
  { label: '二号', value: 22 },
  { label: '小二', value: 18 },
  { label: '三号', value: 16 },
  { label: '小三', value: 15 },
  { label: '四号', value: 14 },
  { label: '小四', value: 12 },
  { label: '五号', value: 10.5 },
  { label: '小五', value: 9 },
  { label: '六号', value: 7.5 },
  { label: '小六', value: 6.5 },
  { label: '七号', value: 5.5 },
  { label: '八号', value: 5 }
]

/** 数值字号（pt），对应 Word 字号下拉中的数字选项 */
export const STANDARD_NUMERIC_SIZES: ReadonlyArray<number> = [
  5, 5.5, 6.5, 7.5, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72
]

// ---------------------------------------------------------------------------
// 颜色调色板（Word 主题色 + 标准色）
// ---------------------------------------------------------------------------

/** Word 主题色 6×10 色表 */
export const THEME_COLORS: ReadonlyArray<ReadonlyArray<string>> = [
  ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646'],
  ['F2F2F2', '7F7F7F', 'DDD9C3', 'C6D9F0', 'DBE5F1', 'F2DCDB', 'EBF1DD', 'E5E0EC', 'DBEEF3', 'FDEADA'],
  ['D8D8D8', '595959', 'C4BD97', '8DB3E2', 'B8CCE4', 'E5B9B7', 'D7E3BC', 'CCC1D9', 'B7DDE8', 'FBD5B5'],
  ['BFBFBF', '3F3F3F', '938953', '548DD4', '95B3D7', 'D99694', 'C3D69B', 'B2A2C7', '92CDDC', 'FAC08F'],
  ['A5A5A5', '262626', '494429', '17365D', '366092', '953734', '76923C', '5F497A', '31859B', 'E36C09'],
  ['7F7F7F', '0C0C0C', '1D1B10', '0F243E', '244061', '632423', '4F6128', '3F3151', '205867', '974806']
]

/** Word 标准色 10 色 */
export const STANDARD_COLORS: ReadonlyArray<string> = [
  'C00000', 'FF0000', 'FFC000', 'FFFF00', '92D050', '00B050', '00B0F0', '0070C0', '002060', '7030A0'
]

// ---------------------------------------------------------------------------
// 默认页边距（A4 标准，上下左右各 1 inch = 1440 twip）
// ---------------------------------------------------------------------------

export const DEFAULT_EXPORT_PAGE_LAYOUT: ExportPageLayout = {
  marginTop: 1440,
  marginBottom: 1440,
  marginLeft: 1440,
  marginRight: 1440
}

// ---------------------------------------------------------------------------
// 默认元素样式工厂（各内置模板在此基础上 override）
// ---------------------------------------------------------------------------

/**
 * 默认元素样式。各内置模板通过 deepClone + override 生成。
 * 这组值移植自 Md2webV2 的 DEFAULT_CONFIG，符合中文公文/学术排版习惯：
 * 标题黑体、正文宋体小四、固定 23pt 行距、首行缩进 2 字符。
 */
export function defaultExportElementStyle(elementType: ExportElementType): ExportElementStyle {
  const base: ExportElementStyle = {
    fontFamilyAscii: 'Times New Roman',
    fontFamilyEastAsia: '黑体',
    fontSize: 12,
    color: '000000',
    bold: false,
    italic: false,
    spacingBefore: 0,
    spacingAfter: 0,
    lineSpacingType: 'fixed',
    lineSpacingValue: 23,
    alignment: 'left',
    indentationType: 'none',
    indentationValue: 2
  }
  switch (elementType) {
    case 'h1':
      return { ...base, fontFamilyEastAsia: '黑体', fontSize: 16, bold: true, spacingBefore: 0.8, spacingAfter: 0.5 }
    case 'h2':
      return { ...base, fontFamilyEastAsia: '黑体', fontSize: 14, bold: true, spacingBefore: 0.5, spacingAfter: 0.5 }
    case 'h3':
      return { ...base, fontFamilyEastAsia: '黑体', fontSize: 14, bold: true, spacingBefore: 0.5, spacingAfter: 0.5 }
    case 'p':
      return {
        ...base,
        fontFamilyEastAsia: '宋体',
        fontSize: 12,
        alignment: 'both',
        indentationType: 'firstLine',
        indentationValue: 2
      }
    case 'table':
      return {
        ...base,
        fontFamilyEastAsia: '宋体',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      }
    case 'code':
      return {
        ...base,
        fontFamilyAscii: 'Consolas',
        fontFamilyEastAsia: '宋体',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1,
        spacingBefore: 0.5,
        spacingAfter: 0.5
      }
    default:
      return base
  }
}

/** 构造包含全部 6 类元素默认样式的 styles 对象 */
export function defaultExportStyles(): Record<ExportElementType, ExportElementStyle> {
  return {
    h1: defaultExportElementStyle('h1'),
    h2: defaultExportElementStyle('h2'),
    h3: defaultExportElementStyle('h3'),
    p: defaultExportElementStyle('p'),
    table: defaultExportElementStyle('table'),
    code: defaultExportElementStyle('code')
  }
}

// ---------------------------------------------------------------------------
// 4 个内置模板
// ---------------------------------------------------------------------------

function makeBuiltinTemplate(params: {
  id: string
  name: string
  nameEn: string
  isDefault: boolean
  overrides: Partial<Record<ExportElementType, Partial<ExportElementStyle>>>
}): ExportStyleTemplate {
  const styles = defaultExportStyles()
  for (const [elementType, override] of Object.entries(params.overrides)) {
    const key = elementType as ExportElementType
    styles[key] = { ...styles[key], ...(override as Partial<ExportElementStyle>) }
  }
  return {
    id: params.id,
    name: params.name,
    nameEn: params.nameEn,
    builtin: true,
    isDefault: params.isDefault,
    pageLayout: { ...DEFAULT_EXPORT_PAGE_LAYOUT },
    styles,
    createdAt: 0,
    updatedAt: 0
  }
}

/**
 * 4 个内置模板。移植自 Md2webV2 的 BUILTIN_STYLE_TEMPLATES，样式值一字不改。
 *
 * - builtin-academic：学术论文（默认）—— 标题居中、1.5 倍行距、宋体小四、首行缩进
 * - builtin-government：行政公文 —— 方正小标宋二号标题、黑体三号一级标题、
 *   仿宋_GB2312 三号正文、首行缩进 2 字符、固定行距（符合 GB/T 9704）
 * - builtin-business：商务报告 —— 微软雅黑、Calibri、1.5 倍行距
 * - builtin-technical：技术文档 —— 等线、Segoe UI、多倍行距 1.2
 */
export const BUILTIN_EXPORT_TEMPLATES: ReadonlyArray<ExportStyleTemplate> = [
  makeBuiltinTemplate({
    id: 'builtin-academic',
    name: '学术论文',
    nameEn: 'Academic Paper',
    isDefault: true,
    overrides: {
      h1: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '黑体',
        fontSize: 16,
        bold: true,
        alignment: 'center',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.8,
        spacingAfter: 0.6
      },
      h2: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '黑体',
        fontSize: 14,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.6,
        spacingAfter: 0.4
      },
      h3: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '黑体',
        fontSize: 13,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.5,
        spacingAfter: 0.3
      },
      p: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '宋体',
        fontSize: 12,
        alignment: 'both',
        indentationType: 'firstLine',
        indentationValue: 2,
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0,
        spacingAfter: 0.2
      },
      table: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '宋体',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      },
      code: {
        fontFamilyAscii: 'JetBrains Mono',
        fontFamilyEastAsia: '宋体',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      }
    }
  }),
  makeBuiltinTemplate({
    id: 'builtin-government',
    name: '行政公文',
    nameEn: 'Administrative Document',
    isDefault: false,
    overrides: {
      h1: {
        // 方正小标宋简体 + 二号（22pt），公文标题标准
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '方正小标宋简体',
        fontSize: 22,
        bold: true,
        alignment: 'center',
        lineSpacingType: 'fixed',
        lineSpacingValue: 34,
        spacingBefore: 1,
        spacingAfter: 1
      },
      h2: {
        // 黑体三号（16pt），公文一级标题"一、"
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '黑体',
        fontSize: 16,
        bold: true,
        alignment: 'left',
        lineSpacingType: 'fixed',
        lineSpacingValue: 30,
        spacingBefore: 0.6,
        spacingAfter: 0.4
      },
      h3: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '黑体',
        fontSize: 14,
        bold: true,
        alignment: 'left',
        lineSpacingType: 'fixed',
        lineSpacingValue: 28,
        spacingBefore: 0.5,
        spacingAfter: 0.3
      },
      p: {
        // 仿宋_GB2312 三号（16pt），公文正文标准，首行缩进 2 字符
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '仿宋_GB2312',
        fontSize: 16,
        alignment: 'both',
        indentationType: 'firstLine',
        indentationValue: 2,
        lineSpacingType: 'fixed',
        lineSpacingValue: 28,
        spacingBefore: 0,
        spacingAfter: 0
      },
      table: {
        fontFamilyAscii: 'Times New Roman',
        fontFamilyEastAsia: '仿宋_GB2312',
        fontSize: 12,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      },
      code: {
        fontFamilyAscii: 'Consolas',
        fontFamilyEastAsia: '仿宋_GB2312',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      }
    }
  }),
  makeBuiltinTemplate({
    id: 'builtin-business',
    name: '商务报告',
    nameEn: 'Business Report',
    isDefault: false,
    overrides: {
      h1: {
        fontFamilyAscii: 'Calibri',
        fontFamilyEastAsia: '微软雅黑',
        fontSize: 20,
        bold: true,
        alignment: 'center',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.8,
        spacingAfter: 0.6
      },
      h2: {
        fontFamilyAscii: 'Calibri',
        fontFamilyEastAsia: '微软雅黑',
        fontSize: 16,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.6,
        spacingAfter: 0.4
      },
      h3: {
        fontFamilyAscii: 'Calibri',
        fontFamilyEastAsia: '微软雅黑',
        fontSize: 14,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.5,
        spacingAfter: 0.3
      },
      p: {
        fontFamilyAscii: 'Calibri',
        fontFamilyEastAsia: '微软雅黑',
        fontSize: 11,
        alignment: 'both',
        indentationType: 'none',
        indentationValue: 0,
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0,
        spacingAfter: 0.3
      },
      table: {
        fontFamilyAscii: 'Calibri',
        fontFamilyEastAsia: '微软雅黑',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      },
      code: {
        fontFamilyAscii: 'JetBrains Mono',
        fontFamilyEastAsia: '微软雅黑',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      }
    }
  }),
  makeBuiltinTemplate({
    id: 'builtin-technical',
    name: '技术文档',
    nameEn: 'Technical Document',
    isDefault: false,
    overrides: {
      h1: {
        fontFamilyAscii: 'Segoe UI',
        fontFamilyEastAsia: '等线',
        fontSize: 18,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.6,
        spacingAfter: 0.4
      },
      h2: {
        fontFamilyAscii: 'Segoe UI',
        fontFamilyEastAsia: '等线',
        fontSize: 16,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.5,
        spacingAfter: 0.3
      },
      h3: {
        fontFamilyAscii: 'Segoe UI',
        fontFamilyEastAsia: '等线',
        fontSize: 14,
        bold: true,
        alignment: 'left',
        lineSpacingType: '1.5',
        lineSpacingValue: 1.5,
        spacingBefore: 0.4,
        spacingAfter: 0.2
      },
      p: {
        fontFamilyAscii: 'Segoe UI',
        fontFamilyEastAsia: '等线',
        fontSize: 11,
        alignment: 'both',
        indentationType: 'none',
        indentationValue: 0,
        lineSpacingType: 'multiple',
        lineSpacingValue: 1.2,
        spacingBefore: 0,
        spacingAfter: 0.2
      },
      table: {
        fontFamilyAscii: 'Segoe UI',
        fontFamilyEastAsia: '等线',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1
      },
      code: {
        fontFamilyAscii: 'JetBrains Mono',
        fontFamilyEastAsia: '等线',
        fontSize: 10.5,
        lineSpacingType: 'single',
        lineSpacingValue: 1,
        spacingBefore: 0.5,
        spacingAfter: 0.5
      }
    }
  })
]

/** 内置模板 id 集合，用于判断某 id 是否内置 */
export const BUILTIN_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  BUILTIN_EXPORT_TEMPLATES.map((t) => t.id)
)

/** 默认模板 id（内置中标记为 isDefault 的那个） */
export const DEFAULT_EXPORT_TEMPLATE_ID = BUILTIN_EXPORT_TEMPLATES.find((t) => t.isDefault)?.id ?? 'builtin-academic'
export const MAX_USER_EXPORT_TEMPLATES = 32

const MAX_EXPORT_TEMPLATE_ID_LENGTH = 128
const MAX_EXPORT_TEMPLATE_NAME_LENGTH = 128
const MAX_EXPORT_FONT_NAME_LENGTH = 64
const MAX_EXPORT_PAGE_MARGIN_TWIPS = 14_400
const HEX_COLOR_PATTERN = /^[0-9A-Fa-f]{6}$/
const TEMPLATE_ID_PATTERN = /^[A-Za-z0-9._-]+$/

// ---------------------------------------------------------------------------
// 工具函数：深拷贝、模板归一化
// ---------------------------------------------------------------------------

/** 深拷贝一个模板（避免共享引用污染内置模板） */
export function cloneExportTemplate(template: ExportStyleTemplate): ExportStyleTemplate {
  return JSON.parse(JSON.stringify(template)) as ExportStyleTemplate
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 31 && codePoint !== 127
    })
    .join('')
}

function normalizeBoundedString(
  value: unknown,
  fallback: string,
  maxLength: number
): string {
  if (typeof value !== 'string') return fallback
  const normalized = stripControlCharacters(value).trim().slice(0, maxLength)
  return normalized || fallback
}

function normalizeFiniteNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const numeric = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback
}

function normalizeElementStyle(
  input: Partial<ExportElementStyle> | null | undefined,
  fallback: ExportElementStyle
): ExportElementStyle {
  const safe = input && typeof input === 'object' ? input : {}
  return {
    fontFamilyAscii: normalizeBoundedString(
      safe.fontFamilyAscii,
      fallback.fontFamilyAscii,
      MAX_EXPORT_FONT_NAME_LENGTH
    ),
    fontFamilyEastAsia: normalizeBoundedString(
      safe.fontFamilyEastAsia,
      fallback.fontFamilyEastAsia,
      MAX_EXPORT_FONT_NAME_LENGTH
    ),
    fontSize: normalizeFiniteNumber(safe.fontSize, fallback.fontSize, 4, 200),
    color: typeof safe.color === 'string' && HEX_COLOR_PATTERN.test(safe.color)
      ? safe.color.toUpperCase()
      : fallback.color,
    bold: typeof safe.bold === 'boolean' ? safe.bold : fallback.bold,
    italic: typeof safe.italic === 'boolean' ? safe.italic : fallback.italic,
    spacingBefore: normalizeFiniteNumber(safe.spacingBefore, fallback.spacingBefore, 0, 20),
    spacingAfter: normalizeFiniteNumber(safe.spacingAfter, fallback.spacingAfter, 0, 20),
    lineSpacingType: EXPORT_LINE_SPACING_TYPES.includes(
      safe.lineSpacingType as ExportLineSpacingType
    )
      ? safe.lineSpacingType as ExportLineSpacingType
      : fallback.lineSpacingType,
    lineSpacingValue: normalizeFiniteNumber(
      safe.lineSpacingValue,
      fallback.lineSpacingValue,
      0,
      200
    ),
    alignment: EXPORT_TEXT_ALIGNMENTS.includes(safe.alignment as ExportTextAlignment)
      ? safe.alignment as ExportTextAlignment
      : fallback.alignment,
    indentationType: EXPORT_INDENTATION_TYPES.includes(
      safe.indentationType as ExportIndentationType
    )
      ? safe.indentationType as ExportIndentationType
      : fallback.indentationType,
    indentationValue: normalizeFiniteNumber(
      safe.indentationValue,
      fallback.indentationValue,
      0,
      40
    )
  }
}

/**
 * 将任意输入归一化为合法的 ExportStyleTemplate。
 * 用于处理从设置文件读取的旧/部分数据：补全缺失字段、修正非法值。
 */
export function normalizeExportTemplate(input: Partial<ExportStyleTemplate> | null | undefined): ExportStyleTemplate {
  const fallback = cloneExportTemplate(BUILTIN_EXPORT_TEMPLATES[0])
  // 防御 null/undefined/非对象输入（损坏的 settings 数据）
  const safe = input && typeof input === 'object' ? input : {}
  const styles = { ...fallback.styles }
  if (safe.styles && typeof safe.styles === 'object') {
    for (const elementType of EXPORT_ELEMENT_TYPES) {
      const incoming = safe.styles[elementType]
      styles[elementType] = normalizeElementStyle(incoming, styles[elementType])
    }
  }
  const candidateId = typeof safe.id === 'string'
    ? stripControlCharacters(safe.id).trim().slice(0, MAX_EXPORT_TEMPLATE_ID_LENGTH)
    : ''
  const id = candidateId && TEMPLATE_ID_PATTERN.test(candidateId) ? candidateId : fallback.id
  const pageLayout: Partial<ExportPageLayout> =
    safe.pageLayout && typeof safe.pageLayout === 'object'
      ? safe.pageLayout
      : {}
  const now = Date.now()
  return {
    id,
    name: normalizeBoundedString(safe.name, fallback.name, MAX_EXPORT_TEMPLATE_NAME_LENGTH),
    nameEn: typeof safe.nameEn === 'string'
      ? normalizeBoundedString(safe.nameEn, '', MAX_EXPORT_TEMPLATE_NAME_LENGTH) || undefined
      : undefined,
    builtin: safe.builtin === true,
    isDefault: safe.isDefault === true,
    pageLayout: {
      marginTop: normalizeFiniteNumber(
        pageLayout.marginTop,
        fallback.pageLayout.marginTop,
        0,
        MAX_EXPORT_PAGE_MARGIN_TWIPS
      ),
      marginBottom: normalizeFiniteNumber(
        pageLayout.marginBottom,
        fallback.pageLayout.marginBottom,
        0,
        MAX_EXPORT_PAGE_MARGIN_TWIPS
      ),
      marginLeft: normalizeFiniteNumber(
        pageLayout.marginLeft,
        fallback.pageLayout.marginLeft,
        0,
        MAX_EXPORT_PAGE_MARGIN_TWIPS
      ),
      marginRight: normalizeFiniteNumber(
        pageLayout.marginRight,
        fallback.pageLayout.marginRight,
        0,
        MAX_EXPORT_PAGE_MARGIN_TWIPS
      )
    },
    styles,
    createdAt: normalizeFiniteNumber(safe.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: normalizeFiniteNumber(safe.updatedAt, now, 0, Number.MAX_SAFE_INTEGER)
  }
}

// ---------------------------------------------------------------------------
// 模板合并（内置 + 用户自定义）—— 纯数据函数，renderer/main 共用
// ---------------------------------------------------------------------------

/**
 * 合并内置模板与用户模板，返回完整模板列表（用于 UI 下拉展示）。
 *
 * 规则：
 * - 内置模板永远存在，不可删除。
 * - 若用户模板与内置模板同 id，用户模板的样式值覆盖内置（但 builtin 标记保持 true）。
 * - 保证全表有且仅有一个 isDefault = true。
 *   优先级：传入的 defaultTemplateId > 内置 isDefault > 第一个内置模板。
 *
 * 此函数不依赖 docx 库（纯数据操作），故放在 shared 层供 renderer 直接调用。
 */
export function mergeBuiltinAndUserTemplates(
  userTemplates: ExportStyleTemplate[] = [],
  defaultTemplateId?: string
): ExportStyleTemplate[] {
  // 防御 null/非数组输入（损坏的 settings 数据或调用方误传）
  const safeList = Array.isArray(userTemplates) ? userTemplates : []
  const userById = new Map<string, ExportStyleTemplate>()
  for (const raw of safeList.slice(0, MAX_USER_EXPORT_TEMPLATES)) {
    // 跳过损坏数据（null、非对象），避免崩溃影响其他模板
    if (!raw || typeof raw !== 'object') continue
    const normalized = normalizeExportTemplate(raw)
    // 用户自定义模板强制 builtin = false（防止误标或脏数据）
    normalized.builtin = false
    if (!userById.has(normalized.id)) {
      userById.set(normalized.id, normalized)
    }
  }

  const result: ExportStyleTemplate[] = []
  for (const builtin of BUILTIN_EXPORT_TEMPLATES) {
    const userOverride = userById.get(builtin.id)
    if (userOverride) {
      // 用户覆盖了内置模板的样式：合并样式，但保持 builtin 元数据
      const merged = cloneExportTemplate(builtin)
      for (const elementType of Object.keys(merged.styles) as ExportElementType[]) {
        merged.styles[elementType] = { ...merged.styles[elementType], ...userOverride.styles[elementType] }
      }
      merged.pageLayout = { ...merged.pageLayout, ...userOverride.pageLayout }
      result.push(merged)
      userById.delete(builtin.id)
    } else {
      result.push(cloneExportTemplate(builtin))
    }
  }

  // 追加纯用户自定义模板
  for (const userTemplate of userById.values()) {
    if (!BUILTIN_TEMPLATE_IDS.has(userTemplate.id)) {
      result.push(userTemplate)
    }
  }

  // 确保 default 唯一
  const effectiveDefaultId = defaultTemplateId && defaultTemplateId.trim()
    ? defaultTemplateId.trim()
    : DEFAULT_EXPORT_TEMPLATE_ID
  let hasDefault = false
  for (const template of result) {
    const shouldBeDefault = template.id === effectiveDefaultId
    template.isDefault = shouldBeDefault
    if (shouldBeDefault) hasDefault = true
  }
  if (!hasDefault && result.length > 0) {
    result[0].isDefault = true
  }

  return result
}
