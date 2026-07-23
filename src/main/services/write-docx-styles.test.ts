import { describe, expect, it } from 'vitest'
import {
  BUILTIN_EXPORT_TEMPLATES,
  BUILTIN_TEMPLATE_IDS,
  cloneExportTemplate,
  DEFAULT_EXPORT_PAGE_LAYOUT,
  DEFAULT_EXPORT_TEMPLATE_ID,
  type ExportElementStyle
} from '../../shared/write-export-templates'
import {
  elementStyleToParagraphOptions,
  elementStyleToRunOptions,
  mergeBuiltinAndUserTemplates,
  pageLayoutToSectionMargin,
  resolveExportTemplate
} from './write-docx-styles'

// 构造一个可控的元素样式用于断言
function makeStyle(overrides: Partial<ExportElementStyle> = {}): ExportElementStyle {
  return {
    fontFamilyAscii: 'Times New Roman',
    fontFamilyEastAsia: '宋体',
    fontSize: 12,
    color: '000000',
    bold: false,
    italic: false,
    spacingBefore: 0,
    spacingAfter: 0,
    lineSpacingType: 'single',
    lineSpacingValue: 1,
    alignment: 'left',
    indentationType: 'none',
    indentationValue: 0,
    ...overrides
  }
}

describe('elementStyleToRunOptions', () => {
  it('把字号 pt 转为半磅（size = fontSize * 2）', () => {
    const opts = elementStyleToRunOptions(makeStyle({ fontSize: 16 }))
    // 16pt → half-points 32
    expect(opts.size).toBe(32)
  })

  it('小数字号也能正确换算', () => {
    expect(elementStyleToRunOptions(makeStyle({ fontSize: 10.5 })).size).toBe(21)
  })

  it('中西文字体分离，并设置 hint: eastAsia（CJK 渲染关键）', () => {
    const opts = elementStyleToRunOptions(
      makeStyle({ fontFamilyAscii: 'Consolas', fontFamilyEastAsia: '微软雅黑' })
    )
    expect(opts.font.ascii).toBe('Consolas')
    expect(opts.font.hAnsi).toBe('Consolas')
    expect(opts.font.eastAsia).toBe('微软雅黑')
    expect(opts.font.hint).toBe('eastAsia')
  })

  it('颜色和粗斜体透传', () => {
    const opts = elementStyleToRunOptions(makeStyle({ color: 'FF0000', bold: true, italic: true }))
    expect(opts.color).toBe('FF0000')
    expect(opts.bold).toBe(true)
    expect(opts.italics).toBe(true)
  })
})

describe('elementStyleToParagraphOptions - 行距换算', () => {
  it('single → 240 twip / auto', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ lineSpacingType: 'single' }))
    expect(opts.spacing.line).toBe(240)
    expect(opts.spacing.lineRule).toBe('auto')
  })

  it('1.5 → 360 twip / auto', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ lineSpacingType: '1.5' }))
    expect(opts.spacing.line).toBe(360)
    expect(opts.spacing.lineRule).toBe('auto')
  })

  it('double → 480 twip / auto', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ lineSpacingType: 'double' }))
    expect(opts.spacing.line).toBe(480)
    expect(opts.spacing.lineRule).toBe('auto')
  })

  it('fixed → value*20 twip / exact（公文固定行距 28pt → 560 twip）', () => {
    const opts = elementStyleToParagraphOptions(
      makeStyle({ lineSpacingType: 'fixed', lineSpacingValue: 28 })
    )
    expect(opts.spacing.line).toBe(560)
    expect(opts.spacing.lineRule).toBe('exact')
  })

  it('atLeast → value*20 twip / atLeast', () => {
    const opts = elementStyleToParagraphOptions(
      makeStyle({ lineSpacingType: 'atLeast', lineSpacingValue: 20 })
    )
    expect(opts.spacing.line).toBe(400)
    expect(opts.spacing.lineRule).toBe('atLeast')
  })

  it('multiple → value*240 twip / auto（1.2 倍 → 288 twip）', () => {
    const opts = elementStyleToParagraphOptions(
      makeStyle({ lineSpacingType: 'multiple', lineSpacingValue: 1.2 })
    )
    expect(opts.spacing.line).toBe(288)
    expect(opts.spacing.lineRule).toBe('auto')
  })
})

describe('elementStyleToParagraphOptions - 段前段后换算', () => {
  it('行数 → twip（1 行 = 240 twip）', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ spacingBefore: 0.5, spacingAfter: 1 }))
    expect(opts.spacing.before).toBe(120)
    expect(opts.spacing.after).toBe(240)
  })
})

describe('elementStyleToParagraphOptions - 首行缩进', () => {
  it('首行缩进 2 字符：16pt 正文 → 2 * 16 * 20 = 640 twip', () => {
    const opts = elementStyleToParagraphOptions(
      makeStyle({
        fontSize: 16,
        indentationType: 'firstLine',
        indentationValue: 2
      })
    )
    expect(opts.indent.firstLine).toBe(640)
    expect(opts.indent.left).toBeUndefined()
    expect(opts.indent.hanging).toBeUndefined()
  })

  it('首行缩进 2 字符：12pt 正文 → 2 * 12 * 20 = 480 twip', () => {
    const opts = elementStyleToParagraphOptions(
      makeStyle({
        fontSize: 12,
        indentationType: 'firstLine',
        indentationValue: 2
      })
    )
    expect(opts.indent.firstLine).toBe(480)
  })

  it('悬挂缩进：left 和 hanging 设相同值', () => {
    const opts = elementStyleToParagraphOptions(
      makeStyle({
        fontSize: 12,
        indentationType: 'hanging',
        indentationValue: 2
      })
    )
    expect(opts.indent.left).toBe(480)
    expect(opts.indent.hanging).toBe(480)
    expect(opts.indent.firstLine).toBeUndefined()
  })

  it('无缩进返回空对象', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ indentationType: 'none' }))
    expect(opts.indent.firstLine).toBeUndefined()
    expect(opts.indent.left).toBeUndefined()
  })
})

describe('elementStyleToParagraphOptions - 对齐', () => {
  it('both → 两端对齐（公文正文标准）', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ alignment: 'both' }))
    // AlignmentType.BOTH
    expect(opts.alignment).toMatch(/both/i)
  })

  it('center → 居中（公文标题）', () => {
    const opts = elementStyleToParagraphOptions(makeStyle({ alignment: 'center' }))
    expect(opts.alignment).toMatch(/center/i)
  })
})

describe('pageLayoutToSectionMargin', () => {
  it('透传四个边距', () => {
    const margin = pageLayoutToSectionMargin({
      ...DEFAULT_EXPORT_PAGE_LAYOUT,
      marginTop: 2000,
      marginLeft: 1800
    })
    expect(margin.top).toBe(2000)
    expect(margin.left).toBe(1800)
    expect(margin.bottom).toBe(DEFAULT_EXPORT_PAGE_LAYOUT.marginBottom)
    expect(margin.right).toBe(DEFAULT_EXPORT_PAGE_LAYOUT.marginRight)
  })
})

describe('resolveExportTemplate', () => {
  it('不传 id 时回退到默认模板', () => {
    const template = resolveExportTemplate(undefined)
    expect(template.id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
    expect(template.builtin).toBe(true)
  })

  it('能找到内置公文模板', () => {
    const template = resolveExportTemplate('builtin-government')
    expect(template.id).toBe('builtin-government')
    expect(template.name).toBe('行政公文')
    // 公文正文应为仿宋_GB2312 三号
    expect(template.styles.p.fontFamilyEastAsia).toBe('仿宋_GB2312')
    expect(template.styles.p.fontSize).toBe(16)
    // 公文标题应为方正小标宋简体 二号
    expect(template.styles.h1.fontFamilyEastAsia).toBe('方正小标宋简体')
    expect(template.styles.h1.fontSize).toBe(22)
  })

  it('找不到 id 时回退到默认模板', () => {
    const template = resolveExportTemplate('nonexistent-id')
    expect(template.id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
  })

  it('用户模板优先于同 id 的内置模板', () => {
    const userOverride = cloneExportTemplate(
      BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === 'builtin-government')!
    )
    userOverride.styles.p.fontSize = 99
    const template = resolveExportTemplate('builtin-government', [userOverride])
    expect(template.styles.p.fontSize).toBe(99)
  })

  it('styleOverride 只覆盖指定字段，不影响其他元素', () => {
    const template = resolveExportTemplate('builtin-academic', [], {
      p: { fontSize: 14, color: 'FF0000' }
    })
    // 正文被覆盖
    expect(template.styles.p.fontSize).toBe(14)
    expect(template.styles.p.color).toBe('FF0000')
    // 标题不受影响
    expect(template.styles.h1.fontSize).not.toBe(14)
    // 正文字体名不被覆盖（override 未指定）
    expect(template.styles.p.fontFamilyEastAsia).toBe('宋体')
  })

  it('styleOverride 不污染源模板（深拷贝）', () => {
    const academic = BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === 'builtin-academic')!
    const originalSize = academic.styles.p.fontSize
    resolveExportTemplate('builtin-academic', [], {
      p: { fontSize: 99 }
    })
    expect(academic.styles.p.fontSize).toBe(originalSize)
  })
})

describe('mergeBuiltinAndUserTemplates', () => {
  it('无用户模板时返回全部内置模板', () => {
    const merged = mergeBuiltinAndUserTemplates([])
    expect(merged).toHaveLength(BUILTIN_EXPORT_TEMPLATES.length)
    expect(merged.map((t) => t.id).sort()).toEqual(
      [...BUILTIN_EXPORT_TEMPLATES.map((t) => t.id)].sort()
    )
  })

  it('内置模板永远存在（不可被用户删除）', () => {
    // 即使传了空用户列表，内置 4 个都在
    const merged = mergeBuiltinAndUserTemplates([])
    for (const builtinId of BUILTIN_TEMPLATE_IDS) {
      expect(merged.find((t) => t.id === builtinId)).toBeTruthy()
    }
  })

  it('用户自定义模板追加在内置之后', () => {
    const userTemplate = cloneExportTemplate(BUILTIN_EXPORT_TEMPLATES[0])
    userTemplate.id = 'user-my-template'
    userTemplate.name = '我的模板'
    userTemplate.builtin = false
    const merged = mergeBuiltinAndUserTemplates([userTemplate])
    expect(merged.find((t) => t.id === 'user-my-template')).toBeTruthy()
    expect(merged.find((t) => t.id === 'user-my-template')?.builtin).toBe(false)
  })

  it('有且仅有一个 isDefault', () => {
    const userTemplate = cloneExportTemplate(BUILTIN_EXPORT_TEMPLATES[0])
    userTemplate.id = 'user-custom'
    userTemplate.isDefault = true
    const merged = mergeBuiltinAndUserTemplates([userTemplate], 'user-custom')
    const defaults = merged.filter((t) => t.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe('user-custom')
  })

  it('defaultTemplateId 缺省时用内置默认模板', () => {
    const merged = mergeBuiltinAndUserTemplates([])
    const defaults = merged.filter((t) => t.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
  })

  it('合并不修改内置模板源数据（深拷贝）', () => {
    mergeBuiltinAndUserTemplates([], 'builtin-government')
    const government = BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === 'builtin-government')!
    // 内置公文原本 isDefault 应为 false（默认是 academic）
    expect(government.isDefault).toBe(false)
  })
})

describe('公文模板关键样式值（回归保护）', () => {
  it('builtin-government 符合 GB/T 9704 公文格式核心要求', () => {
    const gov = resolveExportTemplate('builtin-government')
    // 标题：方正小标宋简体，二号（22pt），居中
    expect(gov.styles.h1.fontFamilyEastAsia).toBe('方正小标宋简体')
    expect(gov.styles.h1.fontSize).toBe(22)
    expect(gov.styles.h1.alignment).toBe('center')
    // 一级标题：黑体，三号（16pt）
    expect(gov.styles.h2.fontFamilyEastAsia).toBe('黑体')
    expect(gov.styles.h2.fontSize).toBe(16)
    // 正文：仿宋_GB2312，三号（16pt），首行缩进 2 字符
    expect(gov.styles.p.fontFamilyEastAsia).toBe('仿宋_GB2312')
    expect(gov.styles.p.fontSize).toBe(16)
    expect(gov.styles.p.indentationType).toBe('firstLine')
    expect(gov.styles.p.indentationValue).toBe(2)
  })
})
