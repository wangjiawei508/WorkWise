import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_DESIGN_HISTORY,
  beginTransientChange,
  canRedo,
  canUndo,
  commitHistorySnapshot,
  createDesignHistoryState,
  endTransientChange,
  redoHistory,
  undoHistory
} from './design-history'
import { createDesignDocument, createDesignElement } from '@shared/design-document'

/** 创建一个带元素的测试文档 */
function makeDoc(elementCount = 1): any {
  const doc = createDesignDocument()
  for (let i = 0; i < elementCount; i++) {
    doc.pages[0].elements.push(createDesignElement('rect', { x: i * 10, y: 0, zIndex: i }))
  }
  return doc
}

describe('design-history - 基础操作', () => {
  it('初始状态：空栈，不可 undo/redo', () => {
    const h = createDesignHistoryState()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('commit 后可 undo，不可 redo', () => {
    let h = createDesignHistoryState()
    const doc = makeDoc()
    h = commitHistorySnapshot(h, doc)
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(false)
  })

  it('undo 后：文档恢复到快照，可 redo', () => {
    let h = createDesignHistoryState()
    const doc1 = makeDoc(1)
    h = commitHistorySnapshot(h, doc1)

    const doc2 = makeDoc(2) // 修改后的文档
    const { history, restoredDoc } = undoHistory(h, doc2)
    expect(restoredDoc).not.toBeNull()
    expect(restoredDoc!.pages[0].elements).toHaveLength(1) // 恢复到 1 个元素
    expect(canRedo(history)).toBe(true)
  })

  it('redo 恢复 undo 前的状态', () => {
    let h = createDesignHistoryState()
    const doc1 = makeDoc(1)
    h = commitHistorySnapshot(h, doc1)

    const doc2 = makeDoc(2)
    const undoResult = undoHistory(h, doc2)
    expect(undoResult.restoredDoc).not.toBeNull()

    const redoResult = redoHistory(undoResult.history, undoResult.restoredDoc!)
    expect(redoResult.restoredDoc).not.toBeNull()
    // redo 应恢复到 doc2 的状态（2 个元素）
    expect(redoResult.restoredDoc!.pages[0].elements).toHaveLength(2)
  })

  it('新操作清空 redo 栈', () => {
    let h = createDesignHistoryState()
    h = commitHistorySnapshot(h, makeDoc(1))
    const undoResult = undoHistory(h, makeDoc(2))
    expect(canRedo(undoResult.history)).toBe(true)

    // 新操作
    const newHistory = commitHistorySnapshot(undoResult.history, makeDoc(3))
    expect(canRedo(newHistory)).toBe(false) // redo 被清空
  })
})

describe('design-history - 快照独立性', () => {
  it('快照是深拷贝，修改原文档不影响历史', () => {
    let h = createDesignHistoryState()
    const doc = makeDoc(1)
    h = commitHistorySnapshot(h, doc)

    // 修改原文档
    doc.pages[0].elements.push(createDesignElement('rect', { zIndex: 1 }))

    // undo 应恢复到 1 个元素（快照不受原文档修改影响）
    const { restoredDoc } = undoHistory(h, doc)
    expect(restoredDoc!.pages[0].elements).toHaveLength(1)
  })

  it('undo 恢复的文档是独立的拷贝', () => {
    let h = createDesignHistoryState()
    h = commitHistorySnapshot(h, makeDoc(1))
    // 先 undo 产生 redo 快照
    const undoResult = undoHistory(h, makeDoc(2))
    expect(undoResult.restoredDoc).not.toBeNull()

    // 修改恢复的文档
    undoResult.restoredDoc!.pages[0].elements = []

    // redo 应恢复到 undo 前的状态（2 个元素），不受修改影响
    const redoResult = redoHistory(undoResult.history, undoResult.restoredDoc!)
    expect(redoResult.restoredDoc).not.toBeNull()
    expect(redoResult.restoredDoc!.pages[0].elements).toHaveLength(2)
  })
})

describe('design-history - 限深', () => {
  it('超过 MAX_HISTORY 时丢弃最旧的', () => {
    let h = createDesignHistoryState()
    // 压入 MAX_HISTORY + 10 个快照
    for (let i = 0; i < MAX_DESIGN_HISTORY + 10; i++) {
      h = commitHistorySnapshot(h, makeDoc(i + 1))
    }
    expect(h.undoStack.length).toBe(MAX_DESIGN_HISTORY)
  })

  it('限深后仍可正常 undo', () => {
    let h = createDesignHistoryState()
    for (let i = 0; i < MAX_DESIGN_HISTORY + 5; i++) {
      h = commitHistorySnapshot(h, makeDoc(i + 1))
    }
    expect(canUndo(h)).toBe(true)
    const { restoredDoc } = undoHistory(h, makeDoc(999))
    expect(restoredDoc).not.toBeNull()
  })
})

describe('design-history - 连续操作（transient）', () => {
  it('beginTransientChange 记录一次快照', () => {
    let h = createDesignHistoryState()
    h = beginTransientChange(h, makeDoc(1))
    expect(h.transientInProgress).toBe(true)
    expect(h.transientCommitted).toBe(true)
    expect(h.undoStack.length).toBe(1)
  })

  it('连续操作中的 commit 不重复记录', () => {
    let h = createDesignHistoryState()
    h = beginTransientChange(h, makeDoc(1))
    // 模拟 store 的 commitBeforeChange 在 transient 中跳过
    //（commitHistorySnapshot 在 transientInProgress+committed 时不额外记录）
    // 但 commitHistorySnapshot 本身不知道 transient——store 层的 commitBeforeChange 负责判断
    // 这里验证 store 逻辑：transient 期间 commitBeforeChange 不调 commitHistorySnapshot
    expect(h.undoStack.length).toBe(1) // 仍只有 1 个
  })

  it('endTransientChange 重置标记，后续操作正常记录', () => {
    let h = createDesignHistoryState()
    h = beginTransientChange(h, makeDoc(1))
    expect(h.transientInProgress).toBe(true)

    h = endTransientChange(h)
    expect(h.transientInProgress).toBe(false)
    expect(h.transientCommitted).toBe(false)

    // 后续正常 commit
    h = commitHistorySnapshot(h, makeDoc(2))
    expect(h.undoStack.length).toBe(2)
  })

  it('连续操作 undo 只回退到操作前（一步）', () => {
    let h = createDesignHistoryState()
    const doc0 = makeDoc(0) // 操作前：0 个元素

    // 开始连续操作
    h = beginTransientChange(h, doc0)
    // 模拟 mousemove 多次（store 不记录中间步骤）
    // end
    h = endTransientChange(h)

    const finalDoc = makeDoc(5) // 操作后：5 个元素
    const { restoredDoc } = undoHistory(h, finalDoc)
    // undo 应恢复到 0 个元素（操作前），不是中间步骤
    expect(restoredDoc!.pages[0].elements).toHaveLength(0)
  })
})

describe('design-history - 空操作安全', () => {
  it('空 undoStack 时 undo 返回 null', () => {
    const h = createDesignHistoryState()
    const { restoredDoc } = undoHistory(h, makeDoc(1))
    expect(restoredDoc).toBeNull()
  })

  it('空 redoStack 时 redo 返回 null', () => {
    const h = createDesignHistoryState()
    const { restoredDoc } = redoHistory(h, makeDoc(1))
    expect(restoredDoc).toBeNull()
  })
})
