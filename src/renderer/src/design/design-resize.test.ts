import { describe, expect, it } from 'vitest'
import {
  MIN_ELEMENT_SIZE,
  RESIZE_HANDLES,
  computeResizedBounds,
  cursorForHandle,
  handlePosition,
  type ElementBounds
} from './design-resize'

const START: ElementBounds = { x: 100, y: 100, w: 200, h: 150 }

describe('computeResizedBounds - 右边（e）', () => {
  it('拖 e 右移 50：w +50，x/y 不变', () => {
    const result = computeResizedBounds('e', START, 50, 0)
    expect(result).toEqual({ x: 100, y: 100, w: 250, h: 150 })
  })

  it('拖 e 左移 50（缩小）：w -50', () => {
    const result = computeResizedBounds('e', START, -50, 0)
    expect(result).toEqual({ x: 100, y: 100, w: 150, h: 150 })
  })

  it('拖 e 左移超过宽度：w 回退到 MIN_ELEMENT_SIZE', () => {
    const result = computeResizedBounds('e', START, -300, 0)
    expect(result.w).toBe(MIN_ELEMENT_SIZE)
    expect(result.x).toBe(100) // x 不变
  })
})

describe('computeResizedBounds - 左边（w）', () => {
  it('拖 w 右移 50（缩小）：x+50, w-50（右边固定）', () => {
    const result = computeResizedBounds('w', START, 50, 0)
    expect(result.x).toBe(150)
    expect(result.w).toBe(150) // 200-50
    expect(result.x + result.w).toBe(300) // 右边不变
  })

  it('拖 w 左移 50（放大）：x-50, w+50', () => {
    const result = computeResizedBounds('w', START, -50, 0)
    expect(result.x).toBe(50)
    expect(result.w).toBe(250)
  })

  it('拖 w 右移超过宽度：x 回退，w=MIN，右边不动', () => {
    const result = computeResizedBounds('w', START, 300, 0)
    expect(result.w).toBe(MIN_ELEMENT_SIZE)
    // 右边 = start.x + start.w = 300，x = 300 - MIN
    expect(result.x).toBe(300 - MIN_ELEMENT_SIZE)
  })
})

describe('computeResizedBounds - 角（nw/ne/se/sw）', () => {
  it('拖 se 右下 50,30：w+50, h+30, x/y 不变', () => {
    const result = computeResizedBounds('se', START, 50, 30)
    expect(result).toEqual({ x: 100, y: 100, w: 250, h: 180 })
  })

  it('拖 nw 左上 -50,-30：x-50, y-30, w+50, h+30', () => {
    const result = computeResizedBounds('nw', START, -50, -30)
    expect(result.x).toBe(50)
    expect(result.y).toBe(70)
    expect(result.w).toBe(250)
    expect(result.h).toBe(180)
  })

  it('拖 ne 右上 50,-30：w+50, y-30, h+30', () => {
    const result = computeResizedBounds('ne', START, 50, -30)
    expect(result.x).toBe(100)
    expect(result.y).toBe(70)
    expect(result.w).toBe(250)
    expect(result.h).toBe(180)
  })

  it('拖 sw 左下 -50,30：x-50, w+50, h+30', () => {
    const result = computeResizedBounds('sw', START, -50, 30)
    expect(result.x).toBe(50)
    expect(result.y).toBe(100)
    expect(result.w).toBe(250)
    expect(result.h).toBe(180)
  })
})

describe('computeResizedBounds - 边中点（n/s）', () => {
  it('拖 s 下移 30：h+30, x/y/w 不变', () => {
    const result = computeResizedBounds('s', START, 0, 30)
    expect(result).toEqual({ x: 100, y: 100, w: 200, h: 180 })
  })

  it('拖 n 上移 30：y-30, h+30（下边固定）', () => {
    const result = computeResizedBounds('n', START, 0, -30)
    expect(result.y).toBe(70)
    expect(result.h).toBe(180)
    expect(result.y + result.h).toBe(250) // 下边不变
  })
})

describe('computeResizedBounds - 最小尺寸约束', () => {
  it('所有方向都不会让 w < MIN', () => {
    for (const handle of RESIZE_HANDLES) {
      const result = computeResizedBounds(handle, START, -1000, -1000)
      expect(result.w, `${handle} w`).toBeGreaterThanOrEqual(MIN_ELEMENT_SIZE)
    }
  })

  it('所有方向都不会让 h < MIN', () => {
    for (const handle of RESIZE_HANDLES) {
      const result = computeResizedBounds(handle, START, -1000, -1000)
      expect(result.h, `${handle} h`).toBeGreaterThanOrEqual(MIN_ELEMENT_SIZE)
    }
  })
})

describe('computeResizedBounds - 取整', () => {
  it('结果都是整数（符合 canvas_contract 整数像素偏好）', () => {
    for (const handle of RESIZE_HANDLES) {
      const result = computeResizedBounds(handle, START, 10.7, 20.3)
      expect(Number.isInteger(result.x), `${handle} x`).toBe(true)
      expect(Number.isInteger(result.y), `${handle} y`).toBe(true)
      expect(Number.isInteger(result.w), `${handle} w`).toBe(true)
      expect(Number.isInteger(result.h), `${handle} h`).toBe(true)
    }
  })
})

describe('handlePosition', () => {
  it('8 个手柄位置正确', () => {
    const b: ElementBounds = { x: 100, y: 100, w: 200, h: 150 }
    expect(handlePosition('nw', b)).toEqual({ x: 100, y: 100 })
    expect(handlePosition('n', b)).toEqual({ x: 200, y: 100 }) // cx = 100+100
    expect(handlePosition('ne', b)).toEqual({ x: 300, y: 100 })
    expect(handlePosition('e', b)).toEqual({ x: 300, y: 175 }) // cy = 100+75
    expect(handlePosition('se', b)).toEqual({ x: 300, y: 250 })
    expect(handlePosition('s', b)).toEqual({ x: 200, y: 250 })
    expect(handlePosition('sw', b)).toEqual({ x: 100, y: 250 })
    expect(handlePosition('w', b)).toEqual({ x: 100, y: 175 })
  })
})

describe('cursorForHandle', () => {
  it('每个方向返回正确的 CSS 光标', () => {
    expect(cursorForHandle('n')).toBe('ns-resize')
    expect(cursorForHandle('s')).toBe('ns-resize')
    expect(cursorForHandle('e')).toBe('ew-resize')
    expect(cursorForHandle('w')).toBe('ew-resize')
    expect(cursorForHandle('nw')).toBe('nwse-resize')
    expect(cursorForHandle('se')).toBe('nwse-resize')
    expect(cursorForHandle('ne')).toBe('nesw-resize')
    expect(cursorForHandle('sw')).toBe('nesw-resize')
  })
})
