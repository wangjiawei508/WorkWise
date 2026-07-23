/**
 * Design 画布缩放手柄逻辑。
 *
 * 8 个方向的手柄：
 *   nw───n───ne
 *   │         │
 *   w    ·    e
 *   │         │
 *   sw───s───se
 *
 * 拖拽手柄时根据方向重算元素的 x/y/w/h：
 * - 拖右边（e）：w 变，x/y 不变
 * - 拖左边（w）：x 和 w 同时变（左边移动，右边固定）
 * - 拖角（如 nw）：x/y/w/h 都变
 *
 * 最小尺寸约束：w/h 不小于 MIN_ELEMENT_SIZE（避免缩到 0 或负数）。
 */

/** 8 个缩放方向 */
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type ResizeHandle = (typeof RESIZE_HANDLES)[number]

/** 最小元素尺寸（像素），防止缩到不可见 */
export const MIN_ELEMENT_SIZE = 5

/** 元素边界（缩放计算的输入/输出） */
export type ElementBounds = {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 根据手柄方向和鼠标 delta，计算缩放后的元素边界。
 *
 * @param handle 手柄方向
 * @param start 缩放开始时的元素边界
 * @param deltaX 鼠标 X 位移（SVG 坐标系）
 * @param deltaY 鼠标 Y 位移（SVG 坐标系）
 * @returns 新的元素边界（已取整，w/h ≥ MIN_ELEMENT_SIZE）
 */
export function computeResizedBounds(
  handle: ResizeHandle,
  start: ElementBounds,
  deltaX: number,
  deltaY: number
): ElementBounds {
  let { x, y, w, h } = start

  // 水平方向
  if (handle.includes('e')) {
    // 右边移动：w 变
    w = start.w + deltaX
  } else if (handle.includes('w')) {
    // 左边移动：x 和 w 同时变（右边固定）
    x = start.x + deltaX
    w = start.w - deltaX
  }

  // 垂直方向
  if (handle.includes('s')) {
    // 下边移动：h 变
    h = start.h + deltaY
  } else if (handle.includes('n')) {
    // 上边移动：y 和 h 同时变（下边固定）
    y = start.y + deltaY
    h = start.h - deltaY
  }

  // 最小尺寸约束：如果 w 缩到小于 MIN，回拉 x 使右边不超过原右边
  if (w < MIN_ELEMENT_SIZE) {
    // 如果是左边拖（w 方向），x 需要回退，保持右边不动
    if (handle.includes('w')) {
      x = start.x + start.w - MIN_ELEMENT_SIZE
    }
    w = MIN_ELEMENT_SIZE
  }
  if (h < MIN_ELEMENT_SIZE) {
    if (handle.includes('n')) {
      y = start.y + start.h - MIN_ELEMENT_SIZE
    }
    h = MIN_ELEMENT_SIZE
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h)
  }
}

/**
 * 获取手柄在元素边界上的位置（SVG 坐标）。
 * 用于渲染手柄的小方块。
 */
export function handlePosition(handle: ResizeHandle, bounds: ElementBounds): { x: number; y: number } {
  const { x, y, w, h } = bounds
  const cx = x + w / 2
  const cy = y + h / 2
  const right = x + w
  const bottom = y + h

  switch (handle) {
    case 'nw': return { x, y }
    case 'n': return { x: cx, y }
    case 'ne': return { x: right, y }
    case 'e': return { x: right, y: cy }
    case 'se': return { x: right, y: bottom }
    case 's': return { x: cx, y: bottom }
    case 'sw': return { x, y: bottom }
    case 'w': return { x, y: cy }
    default: return { x: cx, y: cy }
  }
}

/**
 * 手柄方向 → 鼠标光标 CSS 值。
 */
export function cursorForHandle(handle: ResizeHandle): string {
  switch (handle) {
    case 'n': case 's': return 'ns-resize'
    case 'e': case 'w': return 'ew-resize'
    case 'ne': case 'sw': return 'nesw-resize'
    case 'nw': case 'se': return 'nwse-resize'
    default: return 'default'
  }
}
