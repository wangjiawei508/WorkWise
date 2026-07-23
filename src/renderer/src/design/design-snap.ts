/**
 * Design 画布对齐吸附逻辑。
 * 拖拽/缩放时，元素接近其他元素的边/中心时自动吸附并显示参考线。
 */

export const SNAP_THRESHOLD = 5

export type SnapLine = {
  position: number
  orientation: 'horizontal' | 'vertical'
  start: number
  end: number
}

export type SnapResult = {
  dx: number
  dy: number
  lines: SnapLine[]
}

type Bounds = { x: number; y: number; w: number; h: number }

export function computeSnap(
  current: Bounds,
  others: Bounds[],
  canvasW: number,
  canvasH: number
): SnapResult {
  const curLeft = current.x
  const curCX = current.x + current.w / 2
  const curRight = current.x + current.w
  const curTop = current.y
  const curCY = current.y + current.h / 2
  const curBottom = current.y + current.h

  const lines: SnapLine[] = []
  let bestDx = 0, bestDy = 0
  let bestDxAbs = SNAP_THRESHOLD + 1
  let bestDyAbs = SNAP_THRESHOLD + 1

  // 垂直目标（x 对齐）
  const xTargets: Array<{ pos: number; start: number; end: number }> = [
    { pos: 0, start: 0, end: canvasH },
    { pos: canvasW, start: 0, end: canvasH },
    { pos: canvasW / 2, start: 0, end: canvasH }
  ]
  for (const el of others) {
    xTargets.push({ pos: el.x, start: el.y, end: el.y + el.h })
    xTargets.push({ pos: el.x + el.w / 2, start: el.y, end: el.y + el.h })
    xTargets.push({ pos: el.x + el.w, start: el.y, end: el.y + el.h })
  }
  for (const t of xTargets) {
    for (const cx of [curLeft, curCX, curRight]) {
      const delta = t.pos - cx
      if (Math.abs(delta) <= SNAP_THRESHOLD && Math.abs(delta) < bestDxAbs) {
        bestDx = delta
        bestDxAbs = Math.abs(delta)
        lines.push({ position: t.pos, orientation: 'vertical', start: Math.min(current.y, t.start), end: Math.max(current.y + current.h, t.end) })
      }
    }
  }

  // 水平目标（y 对齐）
  const yTargets: Array<{ pos: number; start: number; end: number }> = [
    { pos: 0, start: 0, end: canvasW },
    { pos: canvasH, start: 0, end: canvasW },
    { pos: canvasH / 2, start: 0, end: canvasW }
  ]
  for (const el of others) {
    yTargets.push({ pos: el.y, start: el.x, end: el.x + el.w })
    yTargets.push({ pos: el.y + el.h / 2, start: el.x, end: el.x + el.w })
    yTargets.push({ pos: el.y + el.h, start: el.x, end: el.x + el.w })
  }
  for (const t of yTargets) {
    for (const cy of [curTop, curCY, curBottom]) {
      const delta = t.pos - cy
      if (Math.abs(delta) <= SNAP_THRESHOLD && Math.abs(delta) < bestDyAbs) {
        bestDy = delta
        bestDyAbs = Math.abs(delta)
        lines.push({ position: t.pos, orientation: 'horizontal', start: Math.min(current.x, t.start), end: Math.max(current.x + current.w, t.end) })
      }
    }
  }

  return { dx: bestDx, dy: bestDy, lines }
}
