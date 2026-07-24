import { describe, expect, it } from 'vitest'
import {
  DESIGN_CANVAS_MAX_SCALE,
  DESIGN_CANVAS_MIN_SCALE,
  clampDesignCanvasScale,
  designCanvasFitScale,
  moveDesignCanvasPan,
  stepDesignCanvasScale
} from './design-canvas-viewport'

describe('Design canvas viewport', () => {
  it('fits a large board inside the visible viewport', () => {
    expect(designCanvasFitScale(1000, 700, 1920, 1080)).toBeCloseTo(936 / 1920)
  })

  it('moves the board without changing its starting offset', () => {
    const start = { x: 12, y: -8 }
    expect(moveDesignCanvasPan(start, 30, -10)).toEqual({ x: 42, y: -18 })
    expect(start).toEqual({ x: 12, y: -8 })
  })

  it('clamps zoom controls to safe bounds', () => {
    expect(clampDesignCanvasScale(0)).toBe(DESIGN_CANVAS_MIN_SCALE)
    expect(clampDesignCanvasScale(20)).toBe(DESIGN_CANVAS_MAX_SCALE)
    expect(stepDesignCanvasScale(DESIGN_CANVAS_MAX_SCALE, 1)).toBe(DESIGN_CANVAS_MAX_SCALE)
    expect(stepDesignCanvasScale(DESIGN_CANVAS_MIN_SCALE, -1)).toBe(DESIGN_CANVAS_MIN_SCALE)
  })
})
