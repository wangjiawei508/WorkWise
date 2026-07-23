import { describe, expect, it, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderPresetShape, listPresetShapes } from './design-preset-service'

const SCRIPTS = join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master', 'scripts', 'preset_shape_svg.py')
const skipOrNot = existsSync(SCRIPTS) ? describe : describe.skip

skipOrNot('C3 预设形状集成', () => {
  let warmedShapes: string[] = []

  beforeAll(async () => {
    // macOS 第一次加载 Python 原生扩展可能触发 Gatekeeper/dyld 冷启动。
    // 在套件级只预热一次，避免异步 5 秒用例超时后产生并发 Python 雪崩。
    warmedShapes = await listPresetShapes()
  }, 70_000)

  it('listPresetShapes 返回 187 个形状', async () => {
    const shapes = warmedShapes.length > 0 ? warmedShapes : await listPresetShapes()
    expect(shapes.length).toBeGreaterThan(180)
    expect(shapes).toContain('rightArrow')
    expect(shapes).toContain('rect')
    expect(shapes).toContain('star5')
  })

  it('renderPresetShape rightArrow 产出 SVG 含 <g> 和 <path>', async () => {
    const result = await renderPresetShape('rightArrow', { x: 100, y: 100, w: 300, h: 150 }, '#2563EB')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.svg).toContain('<g')
    expect(result.svg).toContain('<path')
    expect(result.svg).toContain('rightArrow')
  })

  it('renderPresetShape star5 产出有效 SVG', async () => {
    const result = await renderPresetShape('star5', { x: 0, y: 0, w: 200, h: 200 }, '#FFD700')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.svg).toContain('<path')
  })

  it('renderPresetShape preserves complex multi-path presets', async () => {
    const result = await renderPresetShape(
      'actionButtonHome',
      { x: 0, y: 0, w: 200, h: 150 },
      '#1E3A5F'
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.svg.match(/<path /g)?.length).toBeGreaterThan(1)
    expect(result.svg).toContain('fill="none"')
  })

  it('renderPresetShape 含坐标信息', async () => {
    const result = await renderPresetShape('rect', { x: 50, y: 60, w: 200, h: 100 }, '#1E3A5F')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // SVG 里应该包含坐标相关信息
    expect(result.svg).toContain('50')
    expect(result.svg).toContain('60')
  })

  it('不存在的形状名返回失败', async () => {
    const result = await renderPresetShape('nonExistentShape123', { x: 0, y: 0, w: 100, h: 100 })
    expect(result.ok).toBe(false)
  })
})
