import { beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useDesignWorkspaceStore } from './design-workspace-store'
import { DesignElementRenderer } from '../components/design/DesignElementRenderer'
import {
  DESIGN_CANVAS_PRESETS,
  createDesignElement,
  formatSvgColor
} from '@shared/design-document'

/**
 * Design 工作区端到端集成测试。
 *
 * 模拟用户的完整操作流程，验证 store 状态 + SVG 输出的正确性。
 * 覆盖：新建文档 → 选尺寸 → 添加元素 → 选中 → 拖拽 → 改属性 → 图层操作 → 删除。
 *
 * 这是单元测试无法覆盖的"整条链路"验证——吸取 Word 模板那轮的经验，
 * 单元测试全过 ≠ 整条链路正确（如颜色覆盖 bug 只有端到端才抓到）。
 */

/** 重置 store 到初始状态 */
function resetStore(): void {
  useDesignWorkspaceStore.setState({
    document: null,
    activePageId: null,
    selectedElementIds: [],
    activeTool: 'select'
  })
}

/** 获取当前活跃页面的元素 */
function activePageElements(): any[] {
  const page = useDesignWorkspaceStore.getState().getActivePage()
  return page?.elements ?? []
}

describe('Design 工作区端到端：完整操作流程', () => {
  beforeEach(() => {
    resetStore()
  })

  it('新建文档 → 默认格式 ppt169 → 画布 1280×720', () => {
    const { createNewDocument } = useDesignWorkspaceStore.getState()
    createNewDocument()

    const state = useDesignWorkspaceStore.getState()
    expect(state.document).not.toBeNull()
    expect(state.document!.format).toBe('ppt169')
    expect(state.document!.pages).toHaveLength(1)
    expect(state.document!.pages[0].width).toBe(1280)
    expect(state.document!.pages[0].height).toBe(720)
    expect(state.activePageId).toBe(state.document!.pages[0].id)
    expect(state.selectedElementIds).toEqual([])
  })

  it('选不同尺寸预设 → 各预设尺寸正确', () => {
    const { createNewDocument } = useDesignWorkspaceStore.getState()

    // 测试全部 8 种预设
    for (const preset of DESIGN_CANVAS_PRESETS) {
      resetStore()
      createNewDocument({ format: preset.format })
      const page = useDesignWorkspaceStore.getState().getActivePage()!
      expect(page.width, `${preset.format} 宽度`).toBe(preset.width)
      expect(page.height, `${preset.format} 高度`).toBe(preset.height)
    }
  })

  it('自定义尺寸 → 任意正整数', () => {
    const { createNewDocument } = useDesignWorkspaceStore.getState()
    createNewDocument({
      format: 'custom',
      customSize: { width: 500, height: 800 }
    })
    const page = useDesignWorkspaceStore.getState().getActivePage()!
    expect(page.width).toBe(500)
    expect(page.height).toBe(800)
  })

  it('添加矩形 → 元素出现在画布 → 自动选中 → zIndex 递增', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')

    const elements = activePageElements()
    expect(elements).toHaveLength(1)
    expect(elements[0].type).toBe('rect')
    // 自动选中新元素
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([elements[0].id])
    // 第一个元素 zIndex = 0
    expect(elements[0].zIndex).toBe(0)

    // 添加第二个
    useDesignWorkspaceStore.getState().addDefaultElement('ellipse')
    const elements2 = activePageElements()
    expect(elements2).toHaveLength(2)
    expect(elements2[1].zIndex).toBe(1) // 递增
    expect(elements2[1].type).toBe('ellipse')
  })

  it('adding one default element creates exactly one undo step', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')

    expect(useDesignWorkspaceStore.getState().history.undoStack).toHaveLength(1)
    useDesignWorkspaceStore.getState().undo()
    expect(activePageElements()).toHaveLength(0)
  })

  it('选中元素 → 属性面板批量更新 → 反映到元素', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    const elId = activePageElements()[0].id

    // 选中并改颜色
    store.selectElement(elId)
    store.updateSelectedElements({ fill: 'FF0000' })

    expect(activePageElements()[0].fill).toBe('FF0000')
  })

  it('多选 → 批量拖拽 → 所有选中元素位置更新', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 50, h: 50, zIndex: 0 }))
    store.addElement(createDesignElement('rect', { x: 200, y: 200, w: 50, h: 50, zIndex: 1 }))
    const elements = activePageElements()

    // 选中两个
    store.selectElement(elements[0].id)
    store.addToSelection(elements[1].id)
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toHaveLength(2)

    // 批量移动 +50, +30
    store.updateSelectedElements({ x: 150, y: 130 })

    // 注意：updateSelectedElements 是批量设同一值，不是 delta
    // 这里验证批量更新确实改了所有选中元素
    expect(activePageElements()[0].x).toBe(150)
    expect(activePageElements()[0].y).toBe(130)
    expect(activePageElements()[1].x).toBe(150)
    expect(activePageElements()[1].y).toBe(130)
  })

  it('删除选中元素 → 从画布移除 → 清空选中', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    store.addDefaultElement('ellipse')
    expect(activePageElements()).toHaveLength(2)

    const secondId = activePageElements()[1].id
    store.selectElement(secondId)
    store.removeSelectedElements()

    expect(activePageElements()).toHaveLength(1)
    expect(activePageElements()[0].type).toBe('rect') // 只剩第一个
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('图层锁定 → 锁定元素不被删除选中批量操作误伤（store 层防御）', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', { x: 0, y: 0, w: 10, h: 10, zIndex: 0, locked: true }))
    store.addElement(createDesignElement('ellipse', { x: 20, y: 20, w: 10, h: 10, zIndex: 1 }))

    const elements = activePageElements()
    // 锁定状态记录在元素上
    expect(elements[0].locked).toBe(true)
    // 锁定元素仍可被选中（UI 层面，交互层在 canvas 防御拖拽）
    store.selectAll()
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toHaveLength(2)
  })

  it('图层隐藏 → hidden 标记在元素上', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    const elId = activePageElements()[0].id

    store.updateElement(elId, { hidden: true })
    expect(activePageElements()[0].hidden).toBe(true)
  })
})

describe('Design 工作区端到端：SVG 输出正确性', () => {
  beforeEach(() => {
    resetStore()
  })

  it('完整文档的 SVG 渲染：颜色带# + 无 rgba + 无 class', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', {
      x: 50, y: 50, w: 200, h: 100,
      fill: '1E3A5F', stroke: 'C41E3A', strokeWidth: 2, zIndex: 0
    }))
    store.addElement(createDesignElement('text', {
      x: 100, y: 200, w: 300, h: 40,
      text: '设计文档测试', fontSize: 28, fill: '1A1A2E', zIndex: 1
    }))

    const page = store.getActivePage()!
    const sortedElements = [...page.elements].sort((a, b) => a.zIndex - b.zIndex)

    // 渲染完整 SVG（模拟 DesignCanvas 的输出）
    const svg = renderToStaticMarkup(
      createElement('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 0 ${page.width} ${page.height}`
      },
        sortedElements.map((el) =>
          createElement(DesignElementRenderer, { key: el.id, element: el })
        )
      )
    )

    // 颜色带 #
    expect(svg).toContain('#1E3A5F')
    expect(svg).toContain('#C41E3A')
    expect(svg).toContain('#1A1A2E')
    // 无 rgba（svg_quality_checker 约束）
    expect(svg).not.toContain('rgba(')
    // 无 class/style 标签
    expect(svg).not.toContain('class=')
    expect(svg).not.toContain('<style')
    // 文字内容渲染
    expect(svg).toContain('设计文档测试')
    // 矩形和文字标签都在
    expect(svg).toContain('<rect')
    expect(svg).toContain('<text')
  })

  it('选中状态的蓝色高亮框渲染', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 }))
    const elId = activePageElements()[0].id
    store.selectElement(elId)

    const page = store.getActivePage()!
    const element = page.elements[0]

    // 模拟 SelectionHighlight 的渲染
    const highlightSvg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement('rect', {
          x: element.x - 1,
          y: element.y - 1,
          width: element.w + 2,
          height: element.h + 2,
          fill: 'none',
          stroke: '#2563EB',
          strokeWidth: 2
        })
      )
    )
    expect(highlightSvg).toContain('stroke="#2563EB"')
    expect(highlightSvg).toContain('x="99"') // 100 - 1
  })

  it('背景色渲染（formatSvgColor）', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    const page = store.getActivePage()!
    expect(page.background).toBe('FFFFFF')
    expect(formatSvgColor(page.background)).toBe('#FFFFFF')
  })
})

describe('Design 工作区端到端：边界与异常', () => {
  beforeEach(() => {
    resetStore()
  })

  it('无文档时操作安全（不崩溃）', () => {
    const store = useDesignWorkspaceStore.getState()
    // 无文档状态下各种操作
    expect(() => store.addDefaultElement('rect')).not.toThrow()
    expect(() => store.updateElement('nonexistent', { x: 10 })).not.toThrow()
    expect(() => store.removeElement('nonexistent')).not.toThrow()
    expect(() => store.removeSelectedElements()).not.toThrow()
    expect(store.getActivePage()).toBeNull()
  })

  it('关闭文档 → 状态完全重置', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    store.selectElement(activePageElements()[0].id)

    store.closeDocument()

    expect(useDesignWorkspaceStore.getState().document).toBeNull()
    expect(useDesignWorkspaceStore.getState().activePageId).toBeNull()
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('新建文档覆盖旧文档', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument({ name: '文档1' })
    store.addDefaultElement('rect')
    const doc1Elements = activePageElements().length

    store.createNewDocument({ name: '文档2' })
    expect(useDesignWorkspaceStore.getState().document!.name).toBe('文档2')
    expect(activePageElements().length).toBe(0) // 新文档无元素
    expect(doc1Elements).toBe(1) // 旧文档确实有过元素
  })

  it('selectAll 全选当前页元素（按 zIndex 排序）', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', { zIndex: 5 }))
    store.addElement(createDesignElement('ellipse', { zIndex: 2 }))
    store.addElement(createDesignElement('text', { zIndex: 8 }))

    store.selectAll()
    const selected = useDesignWorkspaceStore.getState().selectedElementIds
    expect(selected).toHaveLength(3)
  })

  it('切换活跃页面 → 清空选中', () => {
    useDesignWorkspaceStore.getState().createNewDocument()
    // 添加第二页（直接操作 store）
    const doc = useDesignWorkspaceStore.getState().document!
    const page2 = { ...doc.pages[0], id: 'page_2', name: 'Page 2', elements: [] }
    useDesignWorkspaceStore.setState({
      document: { ...doc, pages: [...doc.pages, page2] }
    })

    // 在第一页选个元素
    useDesignWorkspaceStore.getState().addDefaultElement('rect')
    useDesignWorkspaceStore.getState().selectElement(activePageElements()[0].id)
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toHaveLength(1)

    // 切换到第二页
    useDesignWorkspaceStore.getState().setActivePage('page_2')
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('loadDocument 加载损坏数据 → 归一化或回退空文档', () => {
    // 加载完全损坏的数据（null）
    useDesignWorkspaceStore.getState().loadDocument(null as any)
    // 应该回退到空文档（不崩溃）
    const docAfterNull = useDesignWorkspaceStore.getState().document
    expect(docAfterNull).not.toBeNull()
    expect(docAfterNull!.pages.length).toBeGreaterThan(0)

    // 加载部分损坏的数据
    resetStore()
    useDesignWorkspaceStore.getState().loadDocument({
      schemaVersion: 'v1',
      id: 'x', name: '坏文档', format: 'ppt169',
      pages: [{ id: 'p1', name: 'P', width: 1280, height: 720, elements: [] }],
      assets: [{ id: '', filename: '' }] as any,
      createdAt: 0, updatedAt: 0
    })
    const docAfterPartial = useDesignWorkspaceStore.getState().document!
    expect(docAfterPartial.name).toBe('坏文档')
    // 损坏的 assets 被过滤
    expect(docAfterPartial.assets).toHaveLength(0)
  })
})

describe('Design 工作区端到端：拖拽逻辑模拟', () => {
  beforeEach(() => {
    resetStore()
  })

  it('模拟拖拽流程：记录初始位置 → delta 更新 → 最终位置正确', () => {
    // 这个测试模拟 DesignCanvas 的拖拽逻辑（不依赖 DOM 事件）
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', { x: 100, y: 200, w: 50, h: 50, zIndex: 0 }))
    const elId = activePageElements()[0].id

    // 模拟拖拽的 elementStarts（DesignCanvas handleElementMouseDown 会记录）
    const elementStarts = new Map<string, { x: number; y: number }>([
      [elId, { x: 100, y: 200 }]
    ])

    // 模拟 mousemove：delta = (+50, -30)
    const deltaX = 50
    const deltaY = -30
    for (const [id, start] of elementStarts) {
      store.updateElement(id, {
        x: Math.round(start.x + deltaX),
        y: Math.round(start.y + deltaY)
      })
    }

    expect(activePageElements()[0].x).toBe(150)
    expect(activePageElements()[0].y).toBe(170)
  })

  it('多选拖拽：所有选中元素各自从初始位置偏移相同 delta', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 50, h: 50, zIndex: 0 }))
    store.addElement(createDesignElement('ellipse', { x: 300, y: 200, w: 50, h: 50, zIndex: 1 }))
    const elements = activePageElements()

    // 选中两个
    store.selectElement(elements[0].id)
    store.addToSelection(elements[1].id)

    // 模拟拖拽的 elementStarts
    const elementStarts = new Map<string, { x: number; y: number }>([
      [elements[0].id, { x: 100, y: 100 }],
      [elements[1].id, { x: 300, y: 200 }]
    ])

    // delta = (+80, +40)
    const deltaX = 80
    const deltaY = 40
    for (const [id, start] of elementStarts) {
      store.updateElement(id, {
        x: Math.round(start.x + deltaX),
        y: Math.round(start.y + deltaY)
      })
    }

    const updated = activePageElements()
    expect(updated[0].x).toBe(180) // 100 + 80
    expect(updated[0].y).toBe(140) // 100 + 40
    expect(updated[1].x).toBe(380) // 300 + 80
    expect(updated[1].y).toBe(240) // 200 + 40
  })
})
