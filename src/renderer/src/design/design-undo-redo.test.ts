import { beforeEach, describe, expect, it } from 'vitest'
import { useDesignWorkspaceStore } from './design-workspace-store'
import { createDesignElement } from '@shared/design-document'

/**
 * B1 撤销/重做端到端测试。
 *
 * 模拟用户的完整操作流程，验证：
 * - 添加元素后 undo 能移除
 * - 改属性后 undo 能恢复
 * - redo 能重做
 * - 拖拽（transient）undo 只回退一步
 * - undo 后新操作清空 redo
 * - 无历史时 undo 安全
 */

function resetStore(): void {
  useDesignWorkspaceStore.setState({
    document: null,
    activePageId: null,
    selectedElementIds: [],
    activeTool: 'select',
    history: {
      undoStack: [],
      redoStack: [],
      transientInProgress: false,
      transientCommitted: false
    }
  })
}

function activeElements(): any[] {
  return useDesignWorkspaceStore.getState().getActivePage()?.elements ?? []
}

describe('B1 撤销/重做端到端：完整操作流', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('添加元素 → undo → 元素消失 → redo → 元素恢复', () => {
    const store = useDesignWorkspaceStore.getState()
    expect(activeElements()).toHaveLength(0)

    // 添加矩形
    store.addDefaultElement('rect')
    expect(activeElements()).toHaveLength(1)
    expect(store.canUndo()).toBe(true)

    // undo
    store.undo()
    expect(activeElements()).toHaveLength(0) // 元素消失
    expect(store.canRedo()).toBe(true)

    // redo
    store.redo()
    expect(activeElements()).toHaveLength(1) // 元素恢复
  })

  it('改属性 → undo → 属性恢复原值', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 50, h: 50, fill: 'FF0000', zIndex: 0 }))
    const elId = activeElements()[0].id
    const originalFill = activeElements()[0].fill

    // 改颜色
    store.updateElement(elId, { fill: '00FF00' })
    expect(activeElements()[0].fill).toBe('00FF00')

    // undo
    store.undo()
    expect(activeElements()[0].fill).toBe(originalFill) // 恢复原色

    // redo
    store.redo()
    expect(activeElements()[0].fill).toBe('00FF00')
  })

  it('删除元素 → undo → 元素恢复', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { zIndex: 0 }))
    store.addElement(createDesignElement('ellipse', { zIndex: 1 }))
    expect(activeElements()).toHaveLength(2)

    // 删除第二个
    const secondId = activeElements()[1].id
    store.removeElement(secondId)
    expect(activeElements()).toHaveLength(1)

    // undo
    store.undo()
    expect(activeElements()).toHaveLength(2) // 恢复
  })

  it('多步操作 → 连续 undo 到初始状态', () => {
    const store = useDesignWorkspaceStore.getState()
    // 添加 3 个元素
    store.addElement(createDesignElement('rect', { zIndex: 0 }))
    store.addElement(createDesignElement('ellipse', { zIndex: 1 }))
    store.addElement(createDesignElement('text', { zIndex: 2 }))
    expect(activeElements()).toHaveLength(3)

    // undo 3 次
    store.undo()
    expect(activeElements()).toHaveLength(2)
    store.undo()
    expect(activeElements()).toHaveLength(1)
    store.undo()
    expect(activeElements()).toHaveLength(0)

    // 第 4 次 undo 应该无效果（已到初始）
    store.undo()
    expect(activeElements()).toHaveLength(0)
    expect(store.canUndo()).toBe(false)
  })

  it('undo 后新操作 → redo 栈清空', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { zIndex: 0 }))
    store.undo()
    expect(store.canRedo()).toBe(true)

    // 新操作
    store.addElement(createDesignElement('ellipse', { zIndex: 0 }))
    expect(store.canRedo()).toBe(false) // redo 被清空
  })
})

describe('B1 撤销/重做端到端：连续操作（拖拽模拟）', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('拖拽（transient）→ undo 只回退一步到拖拽前', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 50, h: 50, zIndex: 0 }))
    const elId = activeElements()[0].id

    // 模拟拖拽：begin → 多次 update → end
    store.beginTransientChange()
    store.updateElement(elId, { x: 110, y: 110 })
    store.updateElement(elId, { x: 120, y: 120 })
    store.updateElement(elId, { x: 150, y: 130 })
    store.endTransientChange()

    expect(activeElements()[0].x).toBe(150)

    // undo 应一次回到拖拽前（x=100），不是中间步骤
    store.undo()
    expect(activeElements()[0].x).toBe(100)
  })

  it('多次独立拖拽 → 每次都能单独 undo', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 0, y: 0, w: 50, h: 50, zIndex: 0 }))
    const elId = activeElements()[0].id

    // 第一次拖拽
    store.beginTransientChange()
    store.updateElement(elId, { x: 50, y: 50 })
    store.endTransientChange()

    // 第二次拖拽
    store.beginTransientChange()
    store.updateElement(elId, { x: 100, y: 100 })
    store.endTransientChange()

    expect(activeElements()[0].x).toBe(100)

    // undo 第一次：回到 x=50
    store.undo()
    expect(activeElements()[0].x).toBe(50)

    // undo 第二次：回到 x=0
    store.undo()
    expect(activeElements()[0].x).toBe(0)
  })

  it('连续操作中的 redo → 恢复到拖拽结束状态', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 0, y: 0, w: 50, h: 50, zIndex: 0 }))
    const elId = activeElements()[0].id

    store.beginTransientChange()
    store.updateElement(elId, { x: 80, y: 60 })
    store.endTransientChange()

    store.undo()
    expect(activeElements()[0].x).toBe(0)

    store.redo()
    expect(activeElements()[0].x).toBe(80) // 恢复到拖拽后
  })
})

describe('B1 撤销/重做端到端：边界与安全', () => {
  beforeEach(() => {
    resetStore()
  })

  it('无文档时 undo/redo 不崩溃', () => {
    const store = useDesignWorkspaceStore.getState()
    expect(() => store.undo()).not.toThrow()
    expect(() => store.redo()).not.toThrow()
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
  })

  it('新建文档后历史重置（无 undo）', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    expect(store.canUndo()).toBe(true)

    // 新建另一个文档
    store.createNewDocument({ name: '文档2' })
    expect(store.canUndo()).toBe(false) // 历史重置
  })

  it('关闭文档后历史重置', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    store.closeDocument()
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
  })

  it('undo 后选中清空（元素 id 可能已不存在）', () => {
    const store = useDesignWorkspaceStore.getState()
    store.createNewDocument()
    store.addDefaultElement('rect')
    const elId = activeElements()[0].id
    store.selectElement(elId)
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toHaveLength(1)

    store.undo()
    // undo 后选中清空
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([])
  })
})

describe('B1 撤销/重做端到端：批量操作', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('批量更新选中元素 → undo 恢复', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 50, h: 50, fill: 'FF0000', zIndex: 0 }))
    store.addElement(createDesignElement('ellipse', { x: 200, y: 200, w: 50, h: 50, fill: '00FF00', zIndex: 1 }))
    const ids = activeElements().map((e) => e.id)

    // 选中两个并批量改色
    store.selectElement(ids[0])
    store.addToSelection(ids[1])
    store.updateSelectedElements({ fill: '0000FF' })

    expect(activeElements()[0].fill).toBe('0000FF')
    expect(activeElements()[1].fill).toBe('0000FF')

    // undo 恢复各自原色
    store.undo()
    expect(activeElements()[0].fill).toBe('FF0000')
    expect(activeElements()[1].fill).toBe('00FF00')
  })

  it('删除多个选中元素 → undo 全部恢复', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { zIndex: 0 }))
    store.addElement(createDesignElement('ellipse', { zIndex: 1 }))
    store.addElement(createDesignElement('text', { zIndex: 2 }))
    expect(activeElements()).toHaveLength(3)

    // 全选删除
    store.selectAll()
    store.removeSelectedElements()
    expect(activeElements()).toHaveLength(0)

    // undo 全部恢复
    store.undo()
    expect(activeElements()).toHaveLength(3)
  })
})
