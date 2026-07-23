import { beforeEach, describe, expect, it } from 'vitest'
import { useDesignWorkspaceStore } from './design-workspace-store'
import { createDesignElement } from '@shared/design-document'

function resetStore(): void {
  useDesignWorkspaceStore.setState({
    document: null, activePageId: null, selectedElementIds: [], activeTool: 'select',
    history: { undoStack: [], redoStack: [], transientInProgress: false, transientCommitted: false }
  })
}

function pages() {
  return useDesignWorkspaceStore.getState().document?.pages ?? []
}

describe('B5 多页管理 - 基本操作', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('新文档初始有 1 页', () => {
    expect(pages()).toHaveLength(1)
  })

  it('addPage 增加页面并切换到新页面', () => {
    const store = useDesignWorkspaceStore.getState()
    const firstPageId = pages()[0].id
    store.addPage()
    expect(pages()).toHaveLength(2)
    expect(pages()[1].name).toBe('Page 2')
    expect(useDesignWorkspaceStore.getState().activePageId).toBe(pages()[1].id)
    expect(useDesignWorkspaceStore.getState().activePageId).not.toBe(firstPageId)
  })

  it('addPage 支持指定格式', () => {
    useDesignWorkspaceStore.getState().addPage({ format: 'social-square' })
    const newPage = pages()[1]
    expect(newPage.width).toBe(1080)
    expect(newPage.height).toBe(1080)
  })

  it('removePage 删除页面（至少保留 1 页）', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addPage()
    store.addPage()
    expect(pages()).toHaveLength(3)

    const secondPageId = pages()[1].id
    store.removePage(secondPageId)
    expect(pages()).toHaveLength(2)
  })

  it('removePage 至少保留 1 页（只有 1 页时不删）', () => {
    const store = useDesignWorkspaceStore.getState()
    expect(pages()).toHaveLength(1)
    store.removePage(pages()[0].id)
    expect(pages()).toHaveLength(1)
  })

  it('removePage 删活跃页时切换到前一页', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addPage()
    store.addPage()
    const secondPageId = pages()[1].id

    // 激活第二页
    store.setActivePage(secondPageId)
    expect(useDesignWorkspaceStore.getState().activePageId).toBe(secondPageId)

    // 删除当前活跃的第二页
    store.removePage(secondPageId)
    // 应切换到第一页（前一个）
    expect(useDesignWorkspaceStore.getState().activePageId).toBe(pages()[0].id)
  })

  it('renamePage 重命名', () => {
    const store = useDesignWorkspaceStore.getState()
    const pageId = pages()[0].id
    store.renamePage(pageId, '封面')
    expect(pages()[0].name).toBe('封面')
  })

  it('renamePage 空名不生效', () => {
    const store = useDesignWorkspaceStore.getState()
    const pageId = pages()[0].id
    const original = pages()[0].name
    store.renamePage(pageId, '   ')
    expect(pages()[0].name).toBe(original)
  })
})

describe('B5 多页管理 - 复制与移动', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('duplicatePage 复制页面（含元素，生成新 id）', () => {
    const store = useDesignWorkspaceStore.getState()
    // 给第一页加元素
    store.addElement(createDesignElement('rect', { x: 10, y: 10, w: 50, h: 50, zIndex: 0 }))
    expect(pages()[0].elements).toHaveLength(1)

    store.duplicatePage(pages()[0].id)
    expect(pages()).toHaveLength(2)
    // 复制的页面有元素
    expect(pages()[1].elements).toHaveLength(1)
    // 元素 id 不同（深拷贝生成新 id）
    expect(pages()[1].elements[0].id).not.toBe(pages()[0].elements[0].id)
    // 但属性相同
    expect(pages()[1].elements[0].x).toBe(10)
    expect(pages()[1].elements[0].w).toBe(50)
    // 页面名称带 copy
    expect(pages()[1].name).toContain('copy')
  })

  it('duplicatePage 后切换到复制页', () => {
    const store = useDesignWorkspaceStore.getState()
    store.duplicatePage(pages()[0].id)
    expect(useDesignWorkspaceStore.getState().activePageId).toBe(pages()[1].id)
  })

  it('movePage 调整顺序', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addPage()
    store.addPage()
    // 3 页：Page 1, Page 2, Page 3
    const id1 = pages()[0].id
    const id2 = pages()[1].id
    const id3 = pages()[2].id

    // 把第一页移到末尾
    store.movePage(0, 2)
    expect(pages()[0].id).toBe(id2)
    expect(pages()[1].id).toBe(id3)
    expect(pages()[2].id).toBe(id1)
  })

  it('movePage 非法索引不生效', () => {
    const store = useDesignWorkspaceStore.getState()
    const originalIds = pages().map((p) => p.id)
    store.movePage(-1, 0)
    store.movePage(0, 99)
    store.movePage(0, 0)
    expect(pages().map((p) => p.id)).toEqual(originalIds)
  })
})

describe('B5 多页管理 - 与撤销联动', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('addPage 后 undo 移除页面', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addPage()
    expect(pages()).toHaveLength(2)

    store.undo()
    expect(pages()).toHaveLength(1)
  })

  it('removePage 后 undo 恢复页面', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addPage()
    store.addPage()
    const middleId = pages()[1].id
    store.removePage(middleId)
    expect(pages()).toHaveLength(2)

    store.undo()
    expect(pages()).toHaveLength(3)
  })

  it('duplicatePage 后 undo', () => {
    const store = useDesignWorkspaceStore.getState()
    store.duplicatePage(pages()[0].id)
    expect(pages()).toHaveLength(2)

    store.undo()
    expect(pages()).toHaveLength(1)
  })

  it('movePage 后 undo 恢复原序', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addPage()
    const originalIds = pages().map((p) => p.id)

    store.movePage(0, 1)
    store.undo()
    expect(pages().map((p) => p.id)).toEqual(originalIds)
  })

  it('renamePage 记录历史，可撤销', () => {
    const store = useDesignWorkspaceStore.getState()
    const originalName = pages()[0].name
    store.renamePage(pages()[0].id, '新名字')
    expect(pages()[0].name).toBe('新名字')
    expect(store.canUndo()).toBe(true)

    store.undo()
    expect(pages()[0].name).toBe(originalName)
  })
})

describe('B5 多页管理 - 切换页面隔离', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('不同页面元素隔离', () => {
    const store = useDesignWorkspaceStore.getState()

    // 第一页加元素
    store.addElement(createDesignElement('rect', { zIndex: 0 }))
    expect(store.getActivePage()?.elements).toHaveLength(1)

    // 切到第二页
    store.addPage()
    expect(store.getActivePage()?.elements).toHaveLength(0)

    // 切回第一页，元素还在
    store.setActivePage(pages()[0].id)
    expect(store.getActivePage()?.elements).toHaveLength(1)
  })

  it('切换页面清空选中', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { zIndex: 0 }))
    store.selectElement(store.getActivePage()!.elements[0].id)
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toHaveLength(1)

    store.addPage()
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([])
  })
})
