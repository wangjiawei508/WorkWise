import { describe, expect, it } from 'vitest'
import {
  ROTATION_HANDLE_OFFSET,
  ROTATION_SNAP_STEP,
  computeRotation,
  rotationHandlePosition
} from './design-rotate'

const CX = 200
const CY = 200

describe('computeRotation - 基本方向', () => {
  it('鼠标在正上方 → 0 度', () => {
    expect(computeRotation(CX, CY, CX, CY - 100)).toBe(0)
  })
  it('鼠标在正右方 → 90 度', () => {
    expect(computeRotation(CX, CY, CX + 100, CY)).toBe(90)
  })
  it('鼠标在正下方 → 180 度', () => {
    expect(computeRotation(CX, CY, CX, CY + 100)).toBe(180)
  })
  it('鼠标在正左方 → -90 度', () => {
    expect(computeRotation(CX, CY, CX - 100, CY)).toBe(-90)
  })
})

describe('computeRotation - 对角方向', () => {
  it('右上 45 度', () => {
    expect(computeRotation(CX, CY, CX + 100, CY - 100)).toBe(45)
  })
  it('右下 135 度', () => {
    expect(computeRotation(CX, CY, CX + 100, CY + 100)).toBe(135)
  })
  it('左下 -135 度', () => {
    expect(computeRotation(CX, CY, CX - 100, CY + 100)).toBe(-135)
  })
  it('左上 -45 度', () => {
    expect(computeRotation(CX, CY, CX - 100, CY - 100)).toBe(-45)
  })
})

describe('computeRotation - 取整', () => {
  it('非整数角度取整', () => {
    const result = computeRotation(CX, CY, CX + 57.7, CY - 100)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(30)
  })
})

describe('computeRotation - Shift 吸附', () => {
  it('snapToStep 吸附到 15 度倍数', () => {
    expect(computeRotation(CX, CY, CX + 57.7, CY - 100, true)).toBe(30)
  })
  it('非 15 倍数时吸附到最近的', () => {
    const result = computeRotation(CX, CY, CX + 40.4, CY - 100, true)
    expect(result % ROTATION_SNAP_STEP).toBe(0)
    expect(result).toBe(15)
  })
  it('吸附结果都是 15 的倍数', () => {
    for (let angle = 0; angle < 360; angle += 7) {
      const rad = (angle * Math.PI) / 180
      const mx = CX + Math.sin(rad) * 100
      const my = CY - Math.cos(rad) * 100
      const result = computeRotation(CX, CY, mx, my, true)
      expect(Math.abs(result % ROTATION_SNAP_STEP), `angle ${angle}`).toBe(0)
    }
  })
})

describe('computeRotation - 范围', () => {
  it('所有结果在 -180 ~ 180', () => {
    for (let angle = 0; angle < 360; angle += 5) {
      const rad = (angle * Math.PI) / 180
      const mx = CX + Math.sin(rad) * 100
      const my = CY - Math.cos(rad) * 100
      const result = computeRotation(CX, CY, mx, my)
      expect(result).toBeGreaterThanOrEqual(-180)
      expect(result).toBeLessThanOrEqual(180)
    }
  })
})

describe('rotationHandlePosition', () => {
  it('手柄在元素上方中点偏上', () => {
    const pos = rotationHandlePosition({ x: 100, y: 100, w: 200, h: 150 })
    expect(pos.x).toBe(200)
    expect(pos.y).toBe(100 - ROTATION_HANDLE_OFFSET)
  })
})
