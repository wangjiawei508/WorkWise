import { beforeEach, describe, expect, it } from 'vitest'
import { useDesignWorkspaceStore } from './design-workspace-store'
import { createDesignElement } from '@shared/design-document'
import { computeSnap } from './design-snap'

function resetStore(): void {
  useDesignWorkspaceStore.setState({
    document: null, activePageId: null, selectedElementIds: [], activeTool: 'select',
    history: { undoStack: [], redoStack: [], transientInProgress: false, transientCommitted: false }
  })
}

/**
 * B6 对齐吸附端到端测试。
 * 模拟拖拽流程 + 吸附计算，验证整条链路。
 */
describe('B6 吸附端到端', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('拖拽接近另一元素 → 吸附对齐', () => {
    const store = useDesignWorkspaceStore.getState()
    // 元素 A 在 x=100，元素 B 在 x=200
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 100, h: 80, zIndex: 0 }))
    store.addElement(createDesignElement('rect', { x: 200, y: 100, w: 100, h: 80, zIndex: 1 }))
    const elA = store.getActivePage()!.elements[0]

    // 模拟拖拽 A 到 x=197（接近 B 的左边 x=200）
    const newBounds = { x: 197, y: 100, w: 100, h: 80 }
    const others = [{ x: 200, y: 100, w: 100, h: 80 }]
    const snap = computeSnap(newBounds, others, 1280, 720)

    expect(snap.dx).toBe(3) // 吸附到 x=200
    expect(snap.lines.length).toBeGreaterThan(0)

    // 应用吸附修正
    store.updateElement(elA.id, {
      x: Math.round(newBounds.x + snap.dx),
      y: Math.round(newBounds.y + snap.dy)
    })
    expect(store.getActivePage()!.elements[0].x).toBe(200) // 吸附后对齐
  })

  it('拖拽远离任何元素 → 不吸附', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 100, h: 80, zIndex: 0 }))
    store.addElement(createDesignElement('rect', { x: 500, y: 400, w: 100, h: 80, zIndex: 1 }))
    const elA = store.getActivePage()!.elements[0]

    // 拖拽 A 到 x=350（远离 B 和画布边/中心）
    const newBounds = { x: 350, y: 300, w: 100, h: 80 }
    const others = [{ x: 500, y: 400, w: 100, h: 80 }]
    const snap = computeSnap(newBounds, others, 1280, 720)

    // 350 + 50 = 400（中心），距画布中心 640 = 240，太远
    expect(snap.dx).toBe(0)
  })

  it('吸附到画布中心线', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 100, h: 80, zIndex: 0 }))
    const elA = store.getActivePage()!.elements[0]

    // 拖拽使中心接近 640（画布水平中心）
    // x = 640 - 50 = 590，拖到 587 → 中心 = 637，距 640 = 3
    const newBounds = { x: 587, y: 100, w: 100, h: 80 }
    const snap = computeSnap(newBounds, [], 1280, 720)

    expect(snap.dx).toBe(3) // 中心吸附到 640
    expect(snap.lines.some((l) => l.position === 640)).toBe(true)
  })

  it('同时吸附 x 和 y', () => {
    const newBounds = { x: 97, y: 97, w: 100, h: 80 }
    const others = [{ x: 100, y: 100, w: 100, h: 80 }]
    const snap = computeSnap(newBounds, others, 1280, 720)

    expect(snap.dx).toBe(3)
    expect(snap.dy).toBe(3)
    // 应该有垂直和水平参考线
    expect(snap.lines.some((l) => l.orientation === 'vertical')).toBe(true)
    expect(snap.lines.some((l) => l.orientation === 'horizontal')).toBe(true)
  })

  it('吸附后 undo 恢复到吸附前位置', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 100, h: 80, zIndex: 0 }))
    store.addElement(createDesignElement('rect', { x: 300, y: 100, w: 100, h: 80, zIndex: 1 }))
    const elA = store.getActivePage()!.elements[0]
    const originalX = elA.x

    // begin transient + 拖拽（含吸附）+ end
    store.beginTransientChange()
    store.updateElement(elA.id, { x: 297, y: 100 }) // 接近 B 的 x=300
    store.endTransientChange()

    expect(store.getActivePage()!.elements[0].x).toBe(297)

    // undo 恢复
    store.undo()
    expect(store.getActivePage()!.elements[0].x).toBe(originalX)
  })
})
