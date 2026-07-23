import { describe, expect, it } from 'vitest'
import {
  BUILTIN_EXPORT_TEMPLATES,
  BUILTIN_TEMPLATE_IDS,
  cloneExportTemplate,
  DEFAULT_EXPORT_PAGE_LAYOUT,
  DEFAULT_EXPORT_TEMPLATE_ID,
  defaultExportElementStyle,
  defaultExportStyles,
  EXPORT_ELEMENT_TYPES,
  mergeBuiltinAndUserTemplates,
  MAX_USER_EXPORT_TEMPLATES,
  normalizeExportTemplate,
  type ExportElementStyle,
  type ExportStyleTemplate
} from './write-export-templates'

/**
 * 构造一个可控的元素样式，便于断言。
 */
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

/**
 * 构造一个完整的用户模板（用于持久化往返测试）。
 */
function makeUserTemplate(id: string, name: string): ExportStyleTemplate {
  return {
    id,
    name,
    nameEn: name,
    builtin: false,
    isDefault: false,
    pageLayout: { ...DEFAULT_EXPORT_PAGE_LAYOUT },
    styles: defaultExportStyles(),
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  }
}

describe('normalizeExportTemplate - 数据完整性', () => {
  it('完整输入原样保留核心字段', () => {
    const input = makeUserTemplate('user-test', '测试模板')
    const result = normalizeExportTemplate(input)
    expect(result.id).toBe('user-test')
    expect(result.name).toBe('测试模板')
    expect(result.builtin).toBe(false)
    expect(result.styles.h1).toBeDefined()
    expect(result.styles.p).toBeDefined()
  })

  it('空 id 回退到默认模板 id', () => {
    const result = normalizeExportTemplate({ ...makeUserTemplate('', '空id'), id: '' })
    expect(result.id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
  })

  it('空 name 回退到默认模板名', () => {
    const result = normalizeExportTemplate({ ...makeUserTemplate('user-x', ''), name: '' })
    expect(result.name).toBe(BUILTIN_EXPORT_TEMPLATES[0].name)
  })

  it('缺失 styles 字段时用默认样式补全', () => {
    const result = normalizeExportTemplate({ id: 'user-x', name: 'X' })
    // 应该补全全部 6 类元素的样式
    for (const elementType of EXPORT_ELEMENT_TYPES) {
      expect(result.styles[elementType]).toBeDefined()
      expect(result.styles[elementType].fontSize).toBeGreaterThan(0)
    }
  })

  it('部分 styles（只有 h1）时，其他元素用默认补全', () => {
    const partialStyle = makeStyle({ fontSize: 99 })
    const result = normalizeExportTemplate({
      id: 'user-x',
      name: 'X',
      styles: { h1: partialStyle } as any
    })
    // h1 用传入的
    expect(result.styles.h1.fontSize).toBe(99)
    // 其他元素用默认补全
    expect(result.styles.p.fontSize).not.toBe(99)
    expect(result.styles.code.fontSize).not.toBe(99)
  })

  it('缺失 pageLayout 时用默认页边距补全', () => {
    const result = normalizeExportTemplate({ id: 'user-x', name: 'X' })
    expect(result.pageLayout.marginTop).toBe(DEFAULT_EXPORT_PAGE_LAYOUT.marginTop)
    expect(result.pageLayout.marginLeft).toBe(DEFAULT_EXPORT_PAGE_LAYOUT.marginLeft)
  })

  it('部分 pageLayout 时，缺失字段用默认补全', () => {
    const result = normalizeExportTemplate({
      id: 'user-x',
      name: 'X',
      pageLayout: { marginTop: 2000 } as any
    })
    expect(result.pageLayout.marginTop).toBe(2000)
    expect(result.pageLayout.marginBottom).toBe(DEFAULT_EXPORT_PAGE_LAYOUT.marginBottom)
  })

  it('缺失时间戳时自动补全', () => {
    const result = normalizeExportTemplate({ id: 'user-x', name: 'X' })
    expect(result.createdAt).toBeGreaterThan(0)
    expect(result.updatedAt).toBeGreaterThan(0)
  })

  it('损坏或越界字段会回退或钳制到安全范围', () => {
    const result = normalizeExportTemplate({
      id: '../bad\u0000id',
      name: `  测试\u0000${'名'.repeat(200)}  `,
      nameEn: '\u0001English',
      pageLayout: {
        marginTop: -1,
        marginBottom: Number.POSITIVE_INFINITY,
        marginLeft: 999_999,
        marginRight: 1000
      },
      styles: {
        h1: {
          ...makeStyle(),
          fontFamilyAscii: `${'A'.repeat(80)}\u0000`,
          fontSize: 500,
          color: 'not-a-color',
          spacingBefore: -10,
          lineSpacingType: 'invalid' as any,
          alignment: 'invalid' as any,
          indentationValue: 500
        }
      } as any
    })

    expect(result.id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
    expect(result.name).not.toContain('\u0000')
    expect(result.name.length).toBeLessThanOrEqual(128)
    expect(result.nameEn).toBe('English')
    expect(result.pageLayout.marginTop).toBe(0)
    expect(result.pageLayout.marginBottom).toBe(DEFAULT_EXPORT_PAGE_LAYOUT.marginBottom)
    expect(result.pageLayout.marginLeft).toBe(14_400)
    expect(result.styles.h1.fontFamilyAscii.length).toBeLessThanOrEqual(64)
    expect(result.styles.h1.fontSize).toBe(200)
    expect(result.styles.h1.color).toBe(BUILTIN_EXPORT_TEMPLATES[0].styles.h1.color)
    expect(result.styles.h1.spacingBefore).toBe(0)
    expect(result.styles.h1.lineSpacingType).toBe(
      BUILTIN_EXPORT_TEMPLATES[0].styles.h1.lineSpacingType
    )
    expect(result.styles.h1.alignment).toBe(
      BUILTIN_EXPORT_TEMPLATES[0].styles.h1.alignment
    )
    expect(result.styles.h1.indentationValue).toBe(40)
  })
})

describe('mergeBuiltinAndUserTemplates - 存储往返与合并', () => {
  it('用户模板持久化往返：存进去读出来保持一致', () => {
    const original = makeUserTemplate('user-roundtrip', '往返模板')
    original.styles.p.fontSize = 14
    original.styles.h1.color = 'FF0000'

    // 模拟持久化往返：序列化为 JSON 再解析回来
    const serialized = JSON.parse(JSON.stringify([original])) as ExportStyleTemplate[]
    const merged = mergeBuiltinAndUserTemplates(serialized)

    const recovered = merged.find((t) => t.id === 'user-roundtrip')
    expect(recovered).toBeDefined()
    expect(recovered?.styles.p.fontSize).toBe(14)
    expect(recovered?.styles.h1.color).toBe('FF0000')
  })

  it('内置模板永远存在（用户列表为空时）', () => {
    const merged = mergeBuiltinAndUserTemplates([])
    expect(merged.length).toBeGreaterThanOrEqual(4)
    for (const builtin of BUILTIN_EXPORT_TEMPLATES) {
      expect(merged.find((t) => t.id === builtin.id)).toBeDefined()
    }
  })

  it('内置模板永远存在（用户列表为 null/undefined 时容错）', () => {
    expect(() => mergeBuiltinAndUserTemplates(null as any)).not.toThrow()
    expect(() => mergeBuiltinAndUserTemplates(undefined)).not.toThrow()
    const merged = mergeBuiltinAndUserTemplates(undefined)
    expect(merged.length).toBeGreaterThanOrEqual(4)
  })

  it('删除所有用户模板后，内置模板仍在', () => {
    const withUser = mergeBuiltinAndUserTemplates([makeUserTemplate('user-1', '用户1')])
    expect(withUser.find((t) => t.id === 'user-1')).toBeDefined()

    // 删除用户模板
    const afterDelete = mergeBuiltinAndUserTemplates([])
    expect(afterDelete.find((t) => t.id === 'user-1')).toBeUndefined()
    expect(afterDelete.find((t) => t.id === 'builtin-academic')).toBeDefined()
  })

  it('用户覆盖内置模板样式：合并后内置标记保持 true', () => {
    // 用户用同 id 覆盖了 academic 的样式
    const override = makeUserTemplate('builtin-academic', '学术')
    override.styles.p.fontSize = 99
    const merged = mergeBuiltinAndUserTemplates([override])

    const academic = merged.find((t) => t.id === 'builtin-academic')
    expect(academic?.builtin).toBe(true) // 内置标记保持
    expect(academic?.styles.p.fontSize).toBe(99) // 样式被覆盖
  })

  it('有且仅有一个 isDefault（即使用户模板和内置都标了 default）', () => {
    const userTemplate = makeUserTemplate('user-default', '我的默认')
    userTemplate.isDefault = true
    const merged = mergeBuiltinAndUserTemplates([userTemplate], 'user-default')

    const defaults = merged.filter((t) => t.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe('user-default')
  })

  it('defaultTemplateId 指向不存在的 id 时，回退到内置默认', () => {
    const merged = mergeBuiltinAndUserTemplates([], 'nonexistent-id')
    const defaults = merged.filter((t) => t.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
  })

  it('损坏的用户模板（非对象）被跳过，不影响其他模板', () => {
    const validUser = makeUserTemplate('user-valid', '有效')
    const merged = mergeBuiltinAndUserTemplates([
      null as any,
      undefined as any,
      'string-not-object' as any,
      123 as any,
      validUser
    ])
    // 损坏的被跳过，有效的保留
    expect(merged.find((t) => t.id === 'user-valid')).toBeDefined()
    // 内置不受影响
    expect(merged.find((t) => t.id === 'builtin-academic')).toBeDefined()
  })

  it('重复 id 的用户模板去重（保留第一个）', () => {
    const first = makeUserTemplate('user-dup', '第一个')
    first.styles.p.fontSize = 14
    const second = makeUserTemplate('user-dup', '第二个')
    second.styles.p.fontSize = 18

    const merged = mergeBuiltinAndUserTemplates([first, second])
    const dup = merged.filter((t) => t.id === 'user-dup')
    expect(dup).toHaveLength(1)
    expect(dup[0].name).toBe('第一个')
    expect(dup[0].styles.p.fontSize).toBe(14)
  })

  it('最多合并安全上限数量的用户模板', () => {
    const users = Array.from(
      { length: MAX_USER_EXPORT_TEMPLATES + 5 },
      (_, index) => makeUserTemplate(`user-${index}`, `用户${index}`)
    )
    const merged = mergeBuiltinAndUserTemplates(users)
    expect(merged.filter((template) => !template.builtin)).toHaveLength(
      MAX_USER_EXPORT_TEMPLATES
    )
  })

  it('用户模板强制 builtin = false（即使输入误标为 true）', () => {
    const fakeBuiltin = makeUserTemplate('user-fake', '假冒内置')
    fakeBuiltin.builtin = true // 用户输入误标
    const merged = mergeBuiltinAndUserTemplates([fakeBuiltin])
    const found = merged.find((t) => t.id === 'user-fake')
    expect(found?.builtin).toBe(false)
  })

  it('合并不修改内置模板源数据（深拷贝隔离）', () => {
    const academic = BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === 'builtin-academic')!
    const originalFontSize = academic.styles.p.fontSize

    mergeBuiltinAndUserTemplates([], 'builtin-government')

    // 内置 academic 的 isDefault 不应被改变（government 被设为 default，但源数据不变）
    expect(academic.isDefault).toBe(true) // academic 原本就是 default
    expect(academic.styles.p.fontSize).toBe(originalFontSize)
  })
})

describe('cloneExportTemplate - 深拷贝隔离', () => {
  it('修改克隆不影响原模板', () => {
    const original = BUILTIN_EXPORT_TEMPLATES[0]
    const cloned = cloneExportTemplate(original)

    cloned.styles.p.fontSize = 999
    cloned.name = '被修改的克隆'

    // 原模板不受影响
    expect(original.styles.p.fontSize).not.toBe(999)
    expect(original.name).not.toBe('被修改的克隆')
  })

  it('嵌套对象也是深拷贝（styles.h1.fontFamilyEastAsia）', () => {
    const original = BUILTIN_EXPORT_TEMPLATES[0]
    const cloned = cloneExportTemplate(original)

    cloned.styles.h1.fontFamilyEastAsia = '克隆字体'
    expect(original.styles.h1.fontFamilyEastAsia).not.toBe('克隆字体')
  })
})

describe('defaultExportElementStyle / defaultExportStyles - 默认值', () => {
  it('每类元素都有合理的默认字号（> 0）', () => {
    for (const elementType of EXPORT_ELEMENT_TYPES) {
      const style = defaultExportElementStyle(elementType)
      expect(style.fontSize).toBeGreaterThan(0)
      expect(style.color).toMatch(/^[0-9A-Fa-f]{6}$/)
      expect(style.fontFamilyAscii.length).toBeGreaterThan(0)
      expect(style.fontFamilyEastAsia.length).toBeGreaterThan(0)
    }
  })

  it('defaultExportStyles 返回全部 6 类元素', () => {
    const styles = defaultExportStyles()
    for (const elementType of EXPORT_ELEMENT_TYPES) {
      expect(styles[elementType]).toBeDefined()
    }
  })
})

describe('内置模板数据完整性', () => {
  it('每个内置模板都有完整的 6 类元素样式', () => {
    for (const template of BUILTIN_EXPORT_TEMPLATES) {
      for (const elementType of EXPORT_ELEMENT_TYPES) {
        const style = template.styles[elementType]
        expect(style, `${template.id} 缺失 ${elementType} 样式`).toBeDefined()
        expect(style.fontSize).toBeGreaterThan(0)
        expect(style.color).toMatch(/^[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('每个内置模板都有 pageLayout', () => {
    for (const template of BUILTIN_EXPORT_TEMPLATES) {
      expect(template.pageLayout).toBeDefined()
      expect(template.pageLayout.marginTop).toBeGreaterThan(0)
      expect(template.pageLayout.marginLeft).toBeGreaterThan(0)
    }
  })

  it('内置模板 id 以 builtin- 开头', () => {
    for (const template of BUILTIN_EXPORT_TEMPLATES) {
      expect(template.id.startsWith('builtin-')).toBe(true)
    }
  })

  it('有且仅有一个内置模板标记为 isDefault', () => {
    const defaults = BUILTIN_EXPORT_TEMPLATES.filter((t) => t.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe(DEFAULT_EXPORT_TEMPLATE_ID)
  })

  it('公文模板的 4 项关键样式值符合 GB/T 9704（回归保护）', () => {
    const gov = BUILTIN_EXPORT_TEMPLATES.find((t) => t.id === 'builtin-government')!
    expect(gov.styles.h1.fontFamilyEastAsia).toBe('方正小标宋简体')
    expect(gov.styles.h1.fontSize).toBe(22)
    expect(gov.styles.h1.alignment).toBe('center')
    expect(gov.styles.p.fontFamilyEastAsia).toBe('仿宋_GB2312')
    expect(gov.styles.p.fontSize).toBe(16)
    expect(gov.styles.p.indentationType).toBe('firstLine')
    expect(gov.styles.p.indentationValue).toBe(2)
  })

  it('BUILTIN_TEMPLATE_IDS 与 BUILTIN_EXPORT_TEMPLATES 一致', () => {
    expect(BUILTIN_TEMPLATE_IDS.size).toBe(BUILTIN_EXPORT_TEMPLATES.length)
    for (const template of BUILTIN_EXPORT_TEMPLATES) {
      expect(BUILTIN_TEMPLATE_IDS.has(template.id)).toBe(true)
    }
  })
})
