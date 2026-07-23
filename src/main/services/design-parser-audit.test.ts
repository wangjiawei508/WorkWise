import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseSvgToPage } from '../../shared/design-svg-parser'
import type { DesignElement } from '../../shared/design-document'

const SVG_PATH = join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master', 'examples', 'ppt169_顶级咨询风_甘孜州经济财政分析', 'svg_final', 'slide_05_gdp_analysis.svg')
const skipOrNot = existsSync(SVG_PATH) ? describe : describe.skip

skipOrNot('C2 审查：真实 SVG 解析质量审计', () => {
  let page = parseSvgToPage(readFileSync(SVG_PATH, 'utf8'), 'audit')!

  it('元素总数合理（原 SVG 有 70+ 标签，解析出 >15 个可视元素）', () => {
    console.log('解析出元素数:', page.elements.length)
    console.log('按类型:', page.elements.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {} as Record<string, number>))
    expect(page.elements.length).toBeGreaterThan(15)
  })

  it('text 内容完整且准确', () => {
    const texts = page.elements.filter(e => e.type === 'text')
    console.log('text 元素:', texts.map(t => `"${t.text?.slice(0, 20)}" sz=${t.fontSize}`).slice(0, 8))
    // 应该有含"甘孜州"的文字
    const hasGanzi = texts.some(t => t.text?.includes('甘孜州'))
    expect(hasGanzi).toBe(true)
  })

  it('无异常元素（非 line 的 w/h 不为 0 或巨大）', () => {
    // line 允许 w=0（竖线）或 h=0（水平线），这是正常的
    const weird = page.elements.filter(e =>
      e.type !== 'line' && (e.x < -1000 || e.y < -1000 || e.w > 5000 || e.h > 5000 || e.w <= 0 || e.h <= 0)
    )
    console.log('异常元素数（非 line）:', weird.length)
    expect(weird.length).toBe(0)
  })

  it('颜色全部为合法 6 位 hex（无 #）', () => {
    const colored = page.elements.filter(e => e.fill)
    for (const e of colored) {
      expect(e.fill, `${e.type} fill`).toMatch(/^[0-9A-F]{6}$/)
    }
  })

  it('path 的 bounds 估算合理（w/h > 0）', () => {
    const paths = page.elements.filter(e => e.type === 'path')
    console.log('path 元素 bounds 样例:', paths.slice(0, 3).map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })))
    for (const p of paths) {
      expect(p.w, 'path w').toBeGreaterThan(0)
      expect(p.h, 'path h').toBeGreaterThan(0)
      expect(p.pathData, 'path d').toBeDefined()
    }
  })
})
