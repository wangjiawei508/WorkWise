import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesignElementRenderer } from './DesignElementRenderer'
import {
  createDesignElement,
  type DesignElement
} from '@shared/design-document'

/**
 * DesignElementRenderer 渲染测试。
 *
 * 用 renderToStaticMarkup 实际渲染元素到 SVG 字符串，
 * 验证产出的是合法 SVG 标签、属性名/值正确、颜色带 #。
 * 这直接验证后续 PPTX 导出的数据源（SVG）是否合法。
 */
function renderElement(overrides: Partial<DesignElement> = {}): string {
  const element = createDesignElement('rect', overrides)
  return renderToStaticMarkup(
    createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 1280 720' },
      createElement(DesignElementRenderer, { element })
    )
  )
}

describe('DesignElementRenderer - rect', () => {
  it('渲染为 <rect> 标签，含 x/y/width/height', () => {
    const svg = renderElement({ x: 100, y: 200, w: 300, h: 150 })
    expect(svg).toContain('<rect')
    expect(svg).toContain('x="100"')
    expect(svg).toContain('y="200"')
    expect(svg).toContain('width="300"')
    expect(svg).toContain('height="150"')
  })

  it('颜色带 # 输出', () => {
    const svg = renderElement({ fill: '1E3A5F' })
    expect(svg).toContain('fill="#1E3A5F"')
    // 不应出现无 # 的裸 hex 作为 fill 值
    expect(svg).not.toContain('fill="1E3A5F"')
  })

  it('stroke 和 strokeWidth 正确渲染', () => {
    const svg = renderElement({ fill: 'FFFFFF', stroke: '000000', strokeWidth: 2 })
    expect(svg).toContain('stroke="#000000"')
    expect(svg).toContain('stroke-width="2"')
  })

  it('旋转生成 transform="rotate(deg, cx, cy)"', () => {
    const svg = renderElement({ x: 100, y: 100, w: 200, h: 200, rotation: 45 })
    // 中心点 = (100+100, 100+100) = (200, 200)
    expect(svg).toContain('transform="rotate(45 200 200)"')
  })

  it('rotation 为 0 时不输出 transform', () => {
    const svg = renderElement({ rotation: 0 })
    expect(svg).not.toContain('transform')
  })

  it('opacity 渲染', () => {
    const svg = renderElement({ opacity: 0.5 })
    expect(svg).toContain('opacity="0.5"')
  })

  it('无 fill 时输出 fill="none"', () => {
    // line 类型默认无 fill
    const element = createDesignElement('line')
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('fill="none"')
  })
})

describe('DesignElementRenderer - ellipse', () => {
  it('渲染为 <ellipse>，cx/cy/rx/ry 从 x/y/w/h 计算', () => {
    const element = createDesignElement('ellipse', { x: 100, y: 100, w: 200, h: 160 })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('<ellipse')
    // cx = 100 + 100 = 200, cy = 100 + 80 = 180, rx = 100, ry = 80
    expect(svg).toContain('cx="200"')
    expect(svg).toContain('cy="180"')
    expect(svg).toContain('rx="100"')
    expect(svg).toContain('ry="80"')
  })
})

describe('DesignElementRenderer - line', () => {
  it('渲染为 <line>，x1/y1/x2/y2 从 x/y/w/h 计算', () => {
    const element = createDesignElement('line', { x: 10, y: 20, w: 100, h: 50 })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('<line')
    expect(svg).toContain('x1="10"')
    expect(svg).toContain('y1="20"')
    expect(svg).toContain('x2="110"')
    expect(svg).toContain('y2="70"')
    // line 强制 fill="none"
    expect(svg).toContain('fill="none"')
  })
})

describe('DesignElementRenderer - text', () => {
  it('渲染为 <text>，含 text 内容和字体属性', () => {
    const element = createDesignElement('text', { x: 50, y: 50, w: 200, h: 40, text: '你好世界' })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('<text')
    expect(svg).toContain('你好世界')
    expect(svg).toContain('font-size')
    expect(svg).toContain('font-family')
  })

  it('text 的 y 坐标包含基线偏移（y + fontSize）', () => {
    const element = createDesignElement('text', { x: 0, y: 100, w: 200, h: 40, fontSize: 30 })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    // y = 100 + 30 = 130（基线偏移，让文字在框内可见）
    expect(svg).toContain('y="130"')
  })

  it('textAlign=center → textAnchor="middle"', () => {
    const element = createDesignElement('text', { textAlign: 'center' })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('text-anchor="middle"')
  })

  it('textAlign=right → textAnchor="end"', () => {
    const element = createDesignElement('text', { textAlign: 'right' })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('text-anchor="end"')
  })
})

describe('DesignElementRenderer - path', () => {
  it('渲染为 <path>，含 d 属性', () => {
    const element = createDesignElement('path', { pathData: 'M10,10 L100,100 L200,10 Z' })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('<path')
    expect(svg).toContain('d="M10,10 L100,100 L200,10 Z"')
  })

  it('无 pathData 时用默认矩形路径', () => {
    const element = createDesignElement('path', { x: 0, y: 0, w: 100, h: 100, pathData: undefined })
    // createDesignElement 的 path 默认有 pathData，手动清空
    element.pathData = undefined
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('<path')
    expect(svg).toContain('d="M0,0')
  })
})

describe('DesignElementRenderer - preset', () => {
  it('renders the PPT Master path and scales it with the element frame', () => {
    const element = createDesignElement('preset', {
      x: 100,
      y: 80,
      w: 400,
      h: 300,
      pathData: 'M0,0 L200,75 L0,150 Z'
    })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).toContain('<path')
    expect(svg).toContain('transform="translate(100 80) scale(2 2)"')
    expect(svg).not.toContain('>rect<')
  })
})

describe('DesignElementRenderer - hidden', () => {
  it('hidden 元素不渲染（返回 null）', () => {
    const element = createDesignElement('rect', { hidden: true })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    // 只剩 svg 外壳，无 <rect>
    expect(svg).not.toContain('<rect')
  })
})

describe('DesignElementRenderer - SVG 合规性（导出质量保护）', () => {
  it('所有颜色值带 #（符合 SVG 规范和 example 格式）', () => {
    const element = createDesignElement('rect', {
      x: 0, y: 0, w: 100, h: 100,
      fill: 'ABCDEF', stroke: '123456', strokeWidth: 1
    })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    // 所有 hex 颜色必须带 #
    expect(svg).toContain('#ABCDEF')
    expect(svg).toContain('#123456')
    // 不应出现无 # 的裸 hex（3-6位连续hex字符且紧跟引号）
    expect(svg).not.toMatch(/=["']?[0-9A-Fa-f]{6}["']?(?!\w)/)
  })

  it('无 class= 或 <style>（符合 svg_quality_checker 约束）', () => {
    const element = createDesignElement('rect')
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).not.toContain('class=')
    expect(svg).not.toContain('<style')
    expect(svg).not.toContain('<style>')
  })

  it('无 rgba()（svg_quality_checker 禁止）', () => {
    const element = createDesignElement('rect', { fill: 'FF0000', opacity: 0.5 })
    const svg = renderToStaticMarkup(
      createElement('svg', { xmlns: 'http://www.w3.org/2000/svg' },
        createElement(DesignElementRenderer, { element })
      )
    )
    expect(svg).not.toContain('rgba(')
    // 透明度通过独立 opacity 属性实现
    expect(svg).toContain('opacity="0.5"')
  })
})
