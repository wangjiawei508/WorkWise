import type { DesignDocumentV1 } from '@shared/design-document'

/**
 * Design 工作区撤销/重做历史管理。
 *
 * 方案：快照栈 + 限深。
 * - undoStack：按时间顺序存历史快照（旧的在下，新的在上）
 * - redoStack：undo 后的快照（用于 redo）
 * - 限深 MAX_HISTORY（默认 50），超出时丢弃最旧的
 *
 * 何时记录快照（由 store 层调用 commitBeforeChange）：
 * - 在"会改变文档的操作开始前"记录一次当前状态
 * - 拖拽/缩放等连续操作：mousedown 时记录一次，mousemove 不记录
 *   （store 提供 beginTransientChange / endTransientChange 管理这个）
 *
 * 不记录的操作：选中、切换工具、切换页面（这些不改文档）
 *
 * 深拷贝用 JSON.parse(JSON.stringify())——DesignDocumentV1 是纯数据，
 * 无函数/循环引用，JSON 序列化安全。
 */
export const MAX_DESIGN_HISTORY = 50

export type DesignHistoryState = {
  /** 历史快照栈（index 0 最旧，末尾最新） */
  undoStack: DesignDocumentV1[]
  /** redo 快照栈 */
  redoStack: DesignDocumentV1[]
  /** 是否在连续操作中（mousedown 到 mouseup 之间），此时中间 update 不记录 */
  transientInProgress: boolean
  /** 连续操作开始时是否已记录过快照 */
  transientCommitted: boolean
}

export function createDesignHistoryState(): DesignHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    transientInProgress: false,
    transientCommitted: false
  }
}

/**
 * 在改变文档前记录快照。
 * 推当前 document 到 undoStack，清空 redoStack（新操作使 redo 失效）。
 * 限深：超出 MAX_HISTORY 时移除最旧的。
 */
export function commitHistorySnapshot(
  history: DesignHistoryState,
  currentDocument: DesignDocumentV1
): DesignHistoryState {
  const snapshot = deepCloneDocument(currentDocument)
  const undoStack = [...history.undoStack, snapshot]
  // 限深：移除最旧的
  const trimmed = undoStack.length > MAX_DESIGN_HISTORY
    ? undoStack.slice(undoStack.length - MAX_DESIGN_HISTORY)
    : undoStack
  return {
    ...history,
    undoStack: trimmed,
    redoStack: [], // 新操作清空 redo
    transientCommitted: true
  }
}

/**
 * 撤销：弹出 undoStack 顶部，当前文档推入 redoStack。
 * 返回 { history, restoredDoc }，restoredDoc 为恢复后的文档（null 表示无法撤销）。
 */
export function undoHistory(
  history: DesignHistoryState,
  currentDocument: DesignDocumentV1
): { history: DesignHistoryState; restoredDoc: DesignDocumentV1 | null } {
  if (history.undoStack.length === 0) {
    return { history, restoredDoc: null }
  }
  const undoStack = [...history.undoStack]
  const previous = undoStack.pop()!
  const redoStack = [...history.redoStack, deepCloneDocument(currentDocument)]
  return {
    history: { ...history, undoStack, redoStack },
    restoredDoc: previous
  }
}

/**
 * 重做：弹出 redoStack 顶部，当前文档推入 undoStack。
 * 返回 { history, restoredDoc }，restoredDoc 为恢复后的文档（null 表示无法重做）。
 */
export function redoHistory(
  history: DesignHistoryState,
  currentDocument: DesignDocumentV1
): { history: DesignHistoryState; restoredDoc: DesignDocumentV1 | null } {
  if (history.redoStack.length === 0) {
    return { history, restoredDoc: null }
  }
  const redoStack = [...history.redoStack]
  const next = redoStack.pop()!
  const undoStack = [...history.undoStack, deepCloneDocument(currentDocument)]
  return {
    history: { ...history, undoStack, redoStack },
    restoredDoc: next
  }
}

/**
 * 开始连续操作（如拖拽）。
 * 标记 transientInProgress=true，后续的 commitIfNotTransient 会跳过记录。
 * 第一次调用时记录一次快照。
 */
export function beginTransientChange(
  history: DesignHistoryState,
  currentDocument: DesignDocumentV1
): DesignHistoryState {
  if (history.transientInProgress) return history
  // 连续操作开始时记录一次快照
  const committed = commitHistorySnapshot(history, currentDocument)
  return { ...committed, transientInProgress: true }
}

/**
 * 结束连续操作。
 * 重置 transient 标记，使后续单独操作能正常记录。
 */
export function endTransientChange(history: DesignHistoryState): DesignHistoryState {
  return {
    ...history,
    transientInProgress: false,
    transientCommitted: false
  }
}

/**
 * 判断当前是否可以撤销。
 */
export function canUndo(history: DesignHistoryState): boolean {
  return history.undoStack.length > 0
}

/**
 * 判断当前是否可以重做。
 */
export function canRedo(history: DesignHistoryState): boolean {
  return history.redoStack.length > 0
}

/** 深拷贝文档（JSON 序列化，DesignDocumentV1 是纯数据） */
function deepCloneDocument(doc: DesignDocumentV1): DesignDocumentV1 {
  return JSON.parse(JSON.stringify(doc)) as DesignDocumentV1
}
