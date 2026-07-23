import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePresetPathsFromSvg,
  parseSvgStringsToDocument,
  parseSvgToPage
} from '../../shared/design-svg-parser'

/** 一个简单的测试 SVG */
const SIMPLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#FFFFFF" />
  <rect x="100" y="100" width="300" height="200" fill="#1E3A5F" />
  <text x="150" y="150" font-family="system-ui" font-size="24" fill="#1A1A2E">标题文字</text>
  <ellipse cx="600" cy="300" rx="80" ry="60" fill="#4A90D9" />
  <line x1="50" y1="50" x2="200" y2="200" stroke="#888888" stroke-width="2" />
</svg>`

describe('parseSvgToPage - 基本', () => {
  it('提取 viewBox 尺寸', () => {
    const page = parseSvgToPage(SIMPLE_SVG)
    expect(page).not.toBeNull()
    expect(page!.width).toBe(1280)
    expect(page!.height).toBe(720)
  })

  it('解析 rect 元素', () => {
    const page = parseSvgToPage(SIMPLE_SVG)!
    const rects = page.elements.filter((e) => e.type === 'rect')
    expect(rects.length).toBeGreaterThanOrEqual(2) // 背景 + 内容矩形
    const contentRect = rects.find((r) => r.w === 300)
    expect(contentRect).toBeDefined()
    expect(contentRect!.x).toBe(100)
    expect(contentRect!.fill).toBe('1E3A5F')
  })

  it('解析 text 元素', () => {
    const page = parseSvgToPage(SIMPLE_SVG)!
    const texts = page.elements.filter((e) => e.type === 'text')
    expect(texts).toHaveLength(1)
    expect(texts[0].text).toBe('标题文字')
    expect(texts[0].fontSize).toBe(24)
    expect(texts[0].fill).toBe('1A1A2E')
  })

  it('解析 ellipse 元素', () => {
    const page = parseSvgToPage(SIMPLE_SVG)!
    const ellipses = page.elements.filter((e) => e.type === 'ellipse')
    expect(ellipses).toHaveLength(1)
    // cx=600 cy=300 rx=80 ry=60 → x=520 y=240 w=160 h=120
    expect(ellipses[0].x).toBe(520)
    expect(ellipses[0].w).toBe(160)
  })

  it('解析 line 元素', () => {
    const page = parseSvgToPage(SIMPLE_SVG)!
    const lines = page.elements.filter((e) => e.type === 'line')
    expect(lines).toHaveLength(1)
    expect(lines[0].stroke).toBe('888888')
    expect(lines[0].strokeWidth).toBe(2)
  })

  it('颜色去掉 # 存为内部格式', () => {
    const page = parseSvgToPage(SIMPLE_SVG)!
    const rects = page.elements.filter((e) => e.type === 'rect' && e.fill)
    for (const r of rects) {
      expect(r.fill).not.toContain('#')
      expect(r.fill).toMatch(/^[0-9A-F]{6}$/)
    }
  })

  it('zIndex 自动递增', () => {
    const page = parseSvgToPage(SIMPLE_SVG)!
    const zIndices = page.elements.map((e) => e.zIndex)
    expect(zIndices).toEqual([0, 1, 2, 3, 4])
  })

  it('preserves source z-order across different SVG element types', () => {
    const svg = `<svg viewBox="0 0 100 100">
      <text x="10" y="20">bottom</text>
      <rect x="0" y="0" width="20" height="20" fill="#FF0000"/>
      <ellipse cx="40" cy="40" rx="10" ry="10" fill="#00FF00"/>
      <path d="M0,0 L10,10" stroke="#000000"/>
    </svg>`
    const page = parseSvgToPage(svg)!
    expect(page.elements.map((element) => element.type)).toEqual([
      'text',
      'rect',
      'ellipse',
      'path'
    ])
  })

  it('忽略 <defs>', () => {
    const svgWithDefs = `<svg viewBox="0 0 100 100"><defs><linearGradient id="g1"><stop offset="0"/></linearGradient></defs><rect x="10" y="10" width="50" height="50" fill="#FF0000"/></svg>`
    const page = parseSvgToPage(svgWithDefs)!
    expect(page.elements).toHaveLength(1) // 只有 rect
  })

  it('preserves supported image assets and element rotation', () => {
    const svg = `<svg viewBox="0 0 200 100">
      <image href="../media/photo.png" x="10" y="20" width="80" height="40" transform="rotate(15 50 40)"/>
      <rect x="100" y="10" width="50" height="30" fill="#FF0000" transform="rotate(-10 125 25)"/>
    </svg>`
    const page = parseSvgToPage(svg, 'Images', {
      imageAssetIdForHref: (href) => href === '../media/photo.png' ? 'asset_photo' : undefined
    })!
    expect(page.elements).toHaveLength(2)
    expect(page.elements[0]).toMatchObject({
      type: 'image',
      imageAssetId: 'asset_photo',
      x: 10,
      y: 20,
      w: 80,
      h: 40,
      rotation: 15
    })
    expect(page.elements[1]).toMatchObject({ type: 'rect', rotation: -10 })
  })

  it('does not create an image element when no safe asset mapping exists', () => {
    const page = parseSvgToPage(
      '<svg viewBox="0 0 100 100"><image href="https://example.com/a.png" x="0" y="0" width="10" height="10"/></svg>'
    )!
    expect(page.elements).toEqual([])
  })
})

describe('parseSvgStringsToDocument', () => {
  it('多页文档', () => {
    const doc = parseSvgStringsToDocument([SIMPLE_SVG, SIMPLE_SVG], '测试文档')
    expect(doc.pages).toHaveLength(2)
    expect(doc.name).toBe('测试文档')
  })

  it('空 SVG 列表时创建默认页', () => {
    const doc = parseSvgStringsToDocument([])
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0].elements).toHaveLength(0)
  })
})

describe('parsePresetPathsFromSvg', () => {
  it('preserves ordered paths and inherited/overridden paint', () => {
    const paths = parsePresetPathsFromSvg(`
      <g fill="#1E3A5F" stroke="none">
        <path d="M 0 0 L 200 0 Z"/>
        <path d="M 10 10 L 20 20 Z" fill="#19304E"/>
        <path d="M 30 30 L 40 40 Z" fill="none" stroke="#FFFFFF" stroke-width="2"/>
      </g>
    `)
    expect(paths).toEqual([
      { d: 'M 0 0 L 200 0 Z', fill: '1E3A5F', stroke: null },
      { d: 'M 10 10 L 20 20 Z', fill: '19304E', stroke: null },
      { d: 'M 30 30 L 40 40 Z', fill: null, stroke: 'FFFFFF', strokeWidth: 2 }
    ])
  })
})

// 用真实 example SVG 验证
const EXAMPLE_SVG = join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master', 'examples', 'ppt169_顶级咨询风_甘孜州经济财政分析', 'svg_final', 'slide_05_gdp_analysis.svg')
const hasExample = existsSync(EXAMPLE_SVG)
const skipOrNot = hasExample ? describe : describe.skip

skipOrNot('parseSvgToPage - 真实 PPT Master SVG', () => {
  it('能解析真实导出的 SVG（含 path/text/line）', () => {
    const svgContent = readFileSync(EXAMPLE_SVG, 'utf8')
    const page = parseSvgToPage(svgContent)!
    expect(page).not.toBeNull()
    expect(page.width).toBe(1280)
    expect(page.height).toBe(720)
    // 应该有多个元素
    expect(page.elements.length).toBeGreaterThan(10)
    // 应该有 path 类型（PPT Master 常用 path 表示圆角矩形）
    expect(page.elements.some((e) => e.type === 'path')).toBe(true)
    // 应该有 text 类型
    expect(page.elements.some((e) => e.type === 'text')).toBe(true)
  })

  it('解析的 path 保留原始 d 属性', () => {
    const svgContent = readFileSync(EXAMPLE_SVG, 'utf8')
    const page = parseSvgToPage(svgContent)!
    const paths = page.elements.filter((e) => e.type === 'path')
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p.pathData).toBeDefined()
      expect(p.pathData!.length).toBeGreaterThan(10)
    }
  })

  it('解析的 text 内容正确', () => {
    const svgContent = readFileSync(EXAMPLE_SVG, 'utf8')
    const page = parseSvgToPage(svgContent)!
    const texts = page.elements.filter((e) => e.type === 'text')
    expect(texts.length).toBeGreaterThan(0)
    // 至少有一个含中文文字
    const hasChinese = texts.some((t) => /[\u4e00-\u9fff]/.test(t.text ?? ''))
    expect(hasChinese).toBe(true)
  })
})
