import { beforeEach, describe, expect, it } from 'vitest'
import { useDesignWorkspaceStore } from './design-workspace-store'
import { createDesignElement } from '@shared/design-document'
import {
  computeResizedBounds,
  handlePosition,
  type ElementBounds,
  type ResizeHandle
} from './design-resize'

/**
 * B2 缩放手柄端到端测试。
 *
 * 模拟 DesignCanvas 的 resize 流程（不依赖 DOM）：
 * 手柄 mousedown 记录起始边界 → mousemove 用 computeResizedBounds 重算 → updateElement。
 * 验证整条链路的正确性（计算函数 + store 接入）。
 */

function resetStore(): void {
  useDesignWorkspaceStore.setState({
    document: null, activePageId: null, selectedElementIds: [], activeTool: 'select',
    history: { undoStack: [], redoStack: [], transientInProgress: false, transientCommitted: false }
  })
}

function activeElements(): any[] {
  return useDesignWorkspaceStore.getState().getActivePage()?.elements ?? []
}

/**
 * 模拟一次完整的 resize 操作（从 mousedown 到 mouseup）。
 * 这是 DesignCanvas handleResizeMouseDown + handleMouseMove + handleMouseUp 的逻辑复现。
 */
function simulateResize(
  elementId: string,
  handle: ResizeHandle,
  startBounds: ElementBounds,
  mouseMoves: Array<{ x: number; y: number }> // SVG 坐标
): void {
  const store = useDesignWorkspaceStore.getState()

  // mousedown：记录起始
  const resizeState = { handle, startBounds, elementId }

  // 第一次 move：begin transient
  store.beginTransientChange()

  for (const pos of mouseMoves) {
    const handleStart = handlePosition(handle, resizeState.startBounds)
    const newBounds = computeResizedBounds(
      handle,
      resizeState.startBounds,
      pos.x - handleStart.x,
      pos.y - handleStart.y
    )
    useDesignWorkspaceStore.getState().updateElement(elementId, {
      x: newBounds.x, y: newBounds.y, w: newBounds.w, h: newBounds.h
    })
  }

  // mouseup：end transient
  useDesignWorkspaceStore.getState().endTransientChange()
}

describe('B2 缩放端到端：各方向', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('拖 e（右边）右移 50：w+50，x/y/h 不变', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    // e 手柄起始位置 = (300, 175)，鼠标移到 (350, 175)
    simulateResize(elId, 'e', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 350, y: 175 }])

    const el = activeElements()[0]
    expect(el.x).toBe(100)
    expect(el.y).toBe(100)
    expect(el.w).toBe(250) // +50
    expect(el.h).toBe(150)
  })

  it('拖 w（左边）右移 50：x+50, w-50（右边固定）', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    // w 手柄起始 = (100, 175)，鼠标移到 (150, 175)
    simulateResize(elId, 'w', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 150, y: 175 }])

    const el = activeElements()[0]
    expect(el.x).toBe(150) // +50
    expect(el.w).toBe(150) // -50
    expect(el.x + el.w).toBe(300) // 右边不变
  })

  it('拖 se（右下角）右下移：w/h 变，x/y 不变', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    simulateResize(elId, 'se', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 350, y: 280 }])

    const el = activeElements()[0]
    expect(el.x).toBe(100)
    expect(el.y).toBe(100)
    expect(el.w).toBe(250) // +50
    expect(el.h).toBe(180) // +30
  })

  it('拖 nw（左上角）左上移：x/y/w/h 都变', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    // nw 手柄起始 = (100, 100)，鼠标移到 (50, 70)
    simulateResize(elId, 'nw', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 50, y: 70 }])

    const el = activeElements()[0]
    expect(el.x).toBe(50)
    expect(el.y).toBe(70)
    expect(el.w).toBe(250) // +50
    expect(el.h).toBe(180) // +30
  })

  it('拖 n（上边中点）上移：y/h 变，x/w 不变', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    // n 手柄起始 = (200, 100)，鼠标移到 (200, 70)
    simulateResize(elId, 'n', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 200, y: 70 }])

    const el = activeElements()[0]
    expect(el.x).toBe(100)
    expect(el.y).toBe(70) // -30
    expect(el.w).toBe(200)
    expect(el.h).toBe(180) // +30
    expect(el.y + el.h).toBe(250) // 下边不变
  })
})

describe('B2 缩放端到端：最小尺寸约束', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('缩到小于 MIN 时 w/h 回退到 MIN', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    // e 手柄，鼠标大幅度左移（超过宽度）
    simulateResize(elId, 'e', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 50, y: 175 }])

    const el = activeElements()[0]
    expect(el.w).toBeGreaterThanOrEqual(5) // MIN_ELEMENT_SIZE
    expect(el.x).toBe(100) // x 不变
  })

  it('w 手柄缩过小时 x 回退（右边不动）', () => {
    useDesignWorkspaceStore.getState().addElement(
      createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 })
    )
    const elId = activeElements()[0].id

    // w 手柄，鼠标大幅度右移
    simulateResize(elId, 'w', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 350, y: 175 }])

    const el = activeElements()[0]
    expect(el.w).toBeGreaterThanOrEqual(5)
    // 右边 = 100 + 200 = 300，x = 300 - MIN
    expect(el.x + el.w).toBeGreaterThanOrEqual(295) // 近似 300
  })
})

describe('B2 缩放端到端：撤销（与 B1 联动）', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('resize 后 undo 恢复原尺寸', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 }))
    const elId = activeElements()[0].id

    // resize
    simulateResize(elId, 'se', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 350, y: 280 }])
    expect(activeElements()[0].w).toBe(250)

    // undo
    useDesignWorkspaceStore.getState().undo()
    expect(activeElements()[0].w).toBe(200) // 恢复
    expect(activeElements()[0].h).toBe(150)
  })

  it('多次 resize mousemove 只产生一次 undo 步骤', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 }))
    const elId = activeElements()[0].id

    // 模拟多次 mousemove（一次 resize 内）
    simulateResize(elId, 'e', { x: 100, y: 100, w: 200, h: 150 }, [
      { x: 320, y: 175 },
      { x: 340, y: 175 },
      { x: 360, y: 175 }
    ])

    // 一次 undo 应回到原尺寸（不是中间步骤）
    useDesignWorkspaceStore.getState().undo()
    expect(activeElements()[0].w).toBe(200)
  })
})

describe('B2 缩放端到端：多步操作', () => {
  beforeEach(() => {
    resetStore()
    useDesignWorkspaceStore.getState().createNewDocument()
  })

  it('连续两次 resize → undo 两次', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, zIndex: 0 }))
    const elId = activeElements()[0].id

    // 第一次 resize
    simulateResize(elId, 'e', { x: 100, y: 100, w: 200, h: 150 }, [{ x: 350, y: 175 }])
    expect(activeElements()[0].w).toBe(250)

    // 第二次 resize（基于新尺寸）
    simulateResize(elId, 'e', { x: 100, y: 100, w: 250, h: 150 }, [{ x: 380, y: 175 }])
    expect(activeElements()[0].w).toBe(280)

    // undo 第一次：回到 w=250
    useDesignWorkspaceStore.getState().undo()
    expect(activeElements()[0].w).toBe(250)

    // undo 第二次：回到 w=200
    useDesignWorkspaceStore.getState().undo()
    expect(activeElements()[0].w).toBe(200)
  })
})
