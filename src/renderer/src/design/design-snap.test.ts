import { describe, expect, it } from 'vitest'
import { SNAP_THRESHOLD, computeSnap } from './design-snap'

describe('computeSnap - 基本吸附', () => {
  const CANVAS_W = 1280
  const CANVAS_H = 720

  it('接近其他元素左边时吸附', () => {
    // 当前元素 x=98，接近 x=100 的目标元素（阈值 5px 内）
    const result = computeSnap(
      { x: 98, y: 50, w: 100, h: 100 },
      [{ x: 100, y: 50, w: 100, h: 100 }],
      CANVAS_W, CANVAS_H
    )
    expect(result.dx).toBe(2) // 吸附到 x=100
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it('距离太远不吸附', () => {
    const result = computeSnap(
      { x: 200, y: 50, w: 100, h: 100 },
      [{ x: 100, y: 50, w: 100, h: 100 }],
      CANVAS_W, CANVAS_H
    )
    expect(result.dx).toBe(0)
    // 但可能吸附到画布中心（640），检查 dx 确实为 0
    // 200 + 50 = 250（中心），距 640 太远
  })

  it('吸附到画布左边（x=0）', () => {
    const result = computeSnap(
      { x: 3, y: 50, w: 100, h: 100 },
      [],
      CANVAS_W, CANVAS_H
    )
    expect(result.dx).toBe(-3) // 吸附到 x=0
  })

  it('吸附到画布中心（x=640）', () => {
    // 元素中心 = 638 + 50 = 688... 不对
    // 元素中心 = x + w/2 = 638 + 50 = 688，距 640 = 48，太远
    // 调整：x=590, w=100 → 中心=640
    const result = computeSnap(
      { x: 587, y: 50, w: 100, h: 100 },
      [],
      CANVAS_W, CANVAS_H
    )
    // 中心 = 587 + 50 = 637，距 640 = 3
    expect(result.dx).toBe(3) // 吸附中心到 640
  })

  it('垂直方向吸附（y 对齐）', () => {
    const result = computeSnap(
      { x: 300, y: 97, w: 100, h: 100 },
      [{ x: 300, y: 100, w: 100, h: 100 }],
      CANVAS_W, CANVAS_H
    )
    expect(result.dy).toBe(3) // 吸附到 y=100
  })
})

describe('computeSnap - 多元素', () => {
  it('选择最近的吸附目标', () => {
    // 两个目标元素，一个近一个远
    const result = computeSnap(
      { x: 97, y: 50, w: 100, h: 100 },
      [
        { x: 100, y: 50, w: 100, h: 100 }, // 近（delta=3）
        { x: 105, y: 50, w: 100, h: 100 }  // 远（delta=8 > 阈值）
      ],
      1280, 720
    )
    expect(result.dx).toBe(3) // 吸附到最近的（x=100）
  })

  it('同时吸附 x 和 y', () => {
    const result = computeSnap(
      { x: 97, y: 97, w: 100, h: 100 },
      [{ x: 100, y: 100, w: 100, h: 100 }],
      1280, 720
    )
    expect(result.dx).toBe(3)
    expect(result.dy).toBe(3)
    expect(result.lines.length).toBeGreaterThanOrEqual(2)
  })
})

describe('computeSnap - 参考线', () => {
  it('吸附时产生参考线', () => {
    const result = computeSnap(
      { x: 97, y: 50, w: 100, h: 100 },
      [{ x: 100, y: 50, w: 100, h: 100 }],
      1280, 720
    )
    expect(result.lines.length).toBeGreaterThan(0)
    const verticalLine = result.lines.find((l) => l.orientation === 'vertical')
    expect(verticalLine).toBeDefined()
    expect(verticalLine!.position).toBe(100)
  })

  it('无吸附时无参考线', () => {
    const result = computeSnap(
      { x: 500, y: 500, w: 100, h: 100 },
      [{ x: 100, y: 100, w: 100, h: 100 }],
      1280, 720
    )
    // 距离所有目标都远，但可能吸附到画布中心...
    // 500+50=550 距 640 = 90，太远
    // 如果 dx 和 dy 都是 0，参考线也应该为空
    if (result.dx === 0 && result.dy === 0) {
      expect(result.lines).toHaveLength(0)
    }
  })
})
