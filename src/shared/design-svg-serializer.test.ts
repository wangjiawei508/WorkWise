import { describe, expect, it } from 'vitest'
import {
  documentToSvgStrings,
  elementToSvgString,
  pageToSvgString
} from './design-svg-serializer'
import {
  createDesignDocument,
  createDesignElement,
  createDesignPage,
  type DesignElement
} from './design-document'

describe('elementToSvgString - rect', () => {
  it('产出合法 <rect> 带颜色和尺寸', () => {
    const el = createDesignElement('rect', { x: 100, y: 200, w: 300, h: 150, fill: '1E3A5F' })
    const svg = elementToSvgString(el)
    expect(svg).toContain('<rect')
    expect(svg).toContain('x="100"')
    expect(svg).toContain('width="300"')
    expect(svg).toContain('fill="#1E3A5F"')
  })

  it('旋转产出 transform', () => {
    const el = createDesignElement('rect', { x: 100, y: 100, w: 200, h: 200, rotation: 45, fill: 'FF0000' })
    const svg = elementToSvgString(el)
    expect(svg).toContain('transform="rotate(45')
  })
})

describe('elementToSvgString - text', () => {
  it('产出 <text> 带 font 属性', () => {
    const el = createDesignElement('text', { x: 50, y: 50, w: 200, h: 40, text: '你好', fill: '000000' })
    const svg = elementToSvgString(el)
    expect(svg).toContain('<text')
    expect(svg).toContain('你好')
    expect(svg).toContain('font-size')
    expect(svg).toContain('font-family')
  })

  it('XML 特殊字符转义', () => {
    const el = createDesignElement('text', { text: 'a<b>&c"\'', fill: '000000' })
    const svg = elementToSvgString(el)
    expect(svg).toContain('&lt;')
    expect(svg).toContain('&gt;')
    expect(svg).toContain('&amp;')
    expect(svg).toContain('&quot;')
    expect(svg).toContain('&apos;')
  })

  it('escapes font attributes instead of allowing SVG attribute injection', () => {
    const el = createDesignElement('text', {
      text: 'safe',
      fontFamily: 'Arial" onload="alert(1)',
      fill: '000000'
    })
    const svg = elementToSvgString(el)
    expect(svg).not.toContain('" onload="')
    expect(svg).toContain('&quot; onload=&quot;')
  })
})

describe('elementToSvgString - SVG 合规性', () => {
  it('颜色带 #', () => {
    const el = createDesignElement('rect', { fill: 'ABCDEF' })
    expect(elementToSvgString(el)).toContain('#ABCDEF')
    expect(elementToSvgString(el)).not.toMatch(/fill="ABCDEF"/)
  })

  it('无 class/style', () => {
    const el = createDesignElement('rect', { fill: 'FF0000' })
    expect(elementToSvgString(el)).not.toContain('class=')
    expect(elementToSvgString(el)).not.toContain('<style')
  })

  it('无 rgba', () => {
    const el = createDesignElement('rect', { fill: 'FF0000', opacity: 0.5 })
    expect(elementToSvgString(el)).not.toContain('rgba(')
    expect(elementToSvgString(el)).toContain('opacity="0.5"')
  })

  it('hidden 元素输出空字符串', () => {
    const el = createDesignElement('rect', { hidden: true })
    expect(elementToSvgString(el)).toBe('')
  })

  it('rejects unsafe path data and falls back to a valid path', () => {
    const el = createDesignElement('path', {
      x: 10,
      y: 20,
      w: 30,
      h: 40,
      pathData: 'M0,0" onload="alert(1)'
    })
    const svg = elementToSvgString(el)
    expect(svg).not.toContain('onload=')
    expect(svg).toContain('M10,20')
  })

  it('preserves rounded path caps and joins in exported SVG', () => {
    const el = createDesignElement('path', {
      pathData: 'M100 100 L200 100 L200 200',
      fill: undefined,
      stroke: '0D9488',
      strokeWidth: 24,
      strokeLinecap: 'round',
      strokeLinejoin: 'round'
    })
    const svg = elementToSvgString(el)
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke="#0D9488"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('stroke-linejoin="round"')
  })

  it('exports a rendered preset path instead of a placeholder rectangle', () => {
    const el = createDesignElement('preset', {
      x: 100,
      y: 80,
      w: 400,
      h: 300,
      pathData: 'M0,0 L200,75 L0,150 Z'
    })
    const svg = elementToSvgString(el)
    expect(svg).toContain('<path')
    expect(svg).toContain('translate(100 80) scale(2 2)')
    expect(svg).not.toContain('<rect')
  })

  it('preset keeps every path and its individual paint', () => {
    const element = createDesignElement('preset', {
      id: 'preset-action',
      x: 10,
      y: 20,
      w: 200,
      h: 150,
      presetName: 'actionButtonHome',
      presetPaths: [
        { d: 'M 0 0 L 200 0 L 200 150 Z', fill: '1E3A5F' },
        { d: 'M 50 50 L 150 50 Z', fill: null, stroke: 'FFFFFF', strokeWidth: 2 }
      ]
    })
    const svg = elementToSvgString(element)
    expect(svg.match(/<path /g)).toHaveLength(2)
    expect(svg).toContain('data-pptx-prst="actionButtonHome"')
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke="#FFFFFF"')
  })

  it('embeds a validated workspace image data URL', () => {
    const element = createDesignElement('image', {
      imageAssetId: 'asset_one',
      x: 10,
      y: 20,
      w: 30,
      h: 40
    })
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const svg = elementToSvgString(element, {
      assetDataUrls: { asset_one: dataUrl }
    })
    expect(svg).toContain('<image')
    expect(svg).toContain(dataUrl)
    expect(svg).not.toContain('#F3F4F6')
  })

  it('does not embed an unsafe image URL', () => {
    const element = createDesignElement('image', {
      imageAssetId: 'asset_one'
    })
    const svg = elementToSvgString(element, {
      assetDataUrls: { asset_one: 'https://private.example/image.png' }
    })
    expect(svg).not.toContain('private.example')
    expect(svg).toContain('#F3F4F6')
  })
})

describe('pageToSvgString', () => {
  it('产出完整 SVG 文档带 viewBox 和背景', () => {
    const page = createDesignPage({ format: 'ppt169' })
    page.elements.push(createDesignElement('rect', { x: 10, y: 10, w: 100, h: 80, fill: 'FF0000', zIndex: 0 }))
    const svg = pageToSvgString(page)
    expect(svg).toContain('<?xml')
    expect(svg).toContain('viewBox="0 0 1280 720"')
    expect(svg).toContain('fill="#FFFFFF"') // 背景
    expect(svg).toContain('<rect')
  })

  it('支持任意尺寸（非 1280×720）', () => {
    const page = createDesignPage({ format: 'custom', customSize: { width: 800, height: 600 } })
    const svg = pageToSvgString(page)
    expect(svg).toContain('viewBox="0 0 800 600"')
  })

  it('元素按 zIndex 升序渲染', () => {
    const page = createDesignPage()
    page.elements.push(createDesignElement('rect', { fill: 'FF0000', zIndex: 2 }))
    page.elements.push(createDesignElement('rect', { fill: '00FF00', zIndex: 0 }))
    const svg = pageToSvgString(page)
    // zIndex 0 (绿色) 应该先出现
    const greenIdx = svg.indexOf('00FF00')
    const redIdx = svg.indexOf('FF0000')
    expect(greenIdx).toBeLessThan(redIdx)
  })
})

describe('documentToSvgStrings', () => {
  it('多页文档每页一个 SVG', () => {
    const doc = createDesignDocument()
    doc.pages.push(createDesignPage({ name: 'Page 2' }))
    const svgs = documentToSvgStrings(doc)
    expect(svgs).toHaveLength(2)
    expect(svgs[0]).toContain('viewBox')
    expect(svgs[1]).toContain('viewBox')
  })
})
