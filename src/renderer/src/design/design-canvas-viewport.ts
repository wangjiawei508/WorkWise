export const DESIGN_CANVAS_MIN_SCALE = 0.1
export const DESIGN_CANVAS_MAX_SCALE = 4

export type DesignCanvasPan = {
  x: number
  y: number
}

export function clampDesignCanvasScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(
    DESIGN_CANVAS_MAX_SCALE,
    Math.max(DESIGN_CANVAS_MIN_SCALE, scale)
  )
}

export function designCanvasFitScale(
  viewportWidth: number,
  viewportHeight: number,
  pageWidth: number,
  pageHeight: number,
  padding = 64
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    return 1
  }
  const availableWidth = Math.max(1, viewportWidth - padding)
  const availableHeight = Math.max(1, viewportHeight - padding)
  return clampDesignCanvasScale(
    Math.min(availableWidth / pageWidth, availableHeight / pageHeight, 1)
  )
}

export function moveDesignCanvasPan(
  start: DesignCanvasPan,
  deltaX: number,
  deltaY: number
): DesignCanvasPan {
  return {
    x: start.x + deltaX,
    y: start.y + deltaY
  }
}

export function stepDesignCanvasScale(
  currentScale: number,
  direction: -1 | 1
): number {
  const factor = direction > 0 ? 1.2 : 1 / 1.2
  return clampDesignCanvasScale(currentScale * factor)
}
