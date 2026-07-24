/**
 * SVG → DesignDocument 解析器。
 *
 * 把 pptx_to_svg.py 产出的 SVG 解析为 DesignDocumentV1。
 * 每页 SVG → 一个 DesignPage，每个 SVG 元素 → 一个 DesignElement。
 *
 * 支持的 SVG 元素（✅ 已核实 pptx_to_svg 产出）：
 * - <rect> → type='rect'
 * - <ellipse>/<circle> → type='ellipse'
 * - <line> → type='line'
 * - <path> → type='path'（保留原始 d 属性）
 * - <text> → type='text'（提取 text 内容、font-size、font-family）
 * - <polygon>/<polyline> → type='path'（转成 path d）
 * - <g> → 扁平化，子元素直接提取；调用方应同时展示保真提示
 * - <defs> → 忽略（定义不产生可见元素）
 * - <image> → type='image'（由调用方把 href 映射为安全的 workspace asset id）
 *
 * 属性解析：fill/stroke/font-size 等全 inline，正则提取。
 * 颜色：去掉 # 存储为内部格式（如 '#1E3A5F' → '1E3A5F'）。
 */

import {
  createDesignDocument,
  createDesignElement,
  generateDesignElementId,
  nextZIndex,
  type DesignElement,
  type DesignDocumentV1,
  type DesignPage,
  type DesignPresetPath
} from './design-document'

/**
 * 解析一个 SVG 文件内容为一个 DesignPage。
 *
 * @param svgContent SVG 文件内容字符串
 * @param pageName 页面名
 * @returns DesignPage（含解析出的元素）
 */
export type SvgParseOptions = {
  imageAssetIdForHref?: (href: string) => string | undefined
}

export function parseSvgToPage(
  svgContent: string,
  pageName = 'Imported Page',
  options: SvgParseOptions = {}
): DesignPage | null {
  // 提取 viewBox
  const viewBoxMatch = svgContent.match(/viewBox=["']0\s+0\s+(\d+)\s+(\d+)["']/)
  const width = viewBoxMatch ? parseInt(viewBoxMatch[1], 10) : 1280
  const height = viewBoxMatch ? parseInt(viewBoxMatch[2], 10) : 720

  // 移除 <defs>...</defs> 和 <?xml ...?> 声明
  const cleaned = svgContent
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '')

  // 按源文档顺序解析所有元素。分别按标签类型扫描会改变 SVG 的叠放顺序，
  // 因此这里使用一个联合扫描器；<g> 仍然扁平化，但子元素保留原有顺序。
  const elements: DesignElement[] = []
  let zIndexCounter = 0
  const elementPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>|<(rect|ellipse|circle|line|path|polygon|polyline|image)\b([^>]*)\/?>/gi
  for (const match of cleaned.matchAll(elementPattern)) {
    let el: DesignElement | null = null
    if (match[1] !== undefined) {
      el = createTextElement(parseAttributes(match[1]), plainTextContent(match[2] ?? ''))
    } else {
      const tagName = (match[3] ?? '').toLowerCase()
      const attrs = parseAttributes(match[4] ?? '')
      switch (tagName) {
        case 'rect':
          el = createRectElement(attrs)
          break
        case 'ellipse':
        case 'circle':
          el = createEllipseElement(attrs)
          break
        case 'line':
          el = createLineElement(attrs)
          break
        case 'path':
          el = createPathElement(attrs)
          break
        case 'polygon':
        case 'polyline':
          el = createPolygonElement(attrs, tagName === 'polygon')
          break
        case 'image':
          el = createImageElement(attrs, options)
          break
      }
    }
    if (el) {
      el.zIndex = zIndexCounter++
      elements.push(el)
    }
  }

  return {
    id: `page_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: pageName,
    width,
    height,
    elements,
    background: 'FFFFFF'
  }
}

/**
 * 解析多个 SVG 文件内容为一个 DesignDocument。
 */
export function parseSvgStringsToDocument(
  svgStrings: string[],
  name = 'Imported Design',
  options: {
    imageAssetIdForHref?: (href: string, pageIndex: number) => string | undefined
  } = {}
): DesignDocumentV1 {
  const pages: DesignPage[] = []
  for (let i = 0; i < svgStrings.length; i++) {
    const page = parseSvgToPage(svgStrings[i], `Page ${i + 1}`, {
      imageAssetIdForHref: options.imageAssetIdForHref
        ? (href) => options.imageAssetIdForHref?.(href, i)
        : undefined
    })
    if (page) pages.push(page)
  }
  // 如果没有页面，创建一个空的
  if (pages.length === 0) {
    pages.push({
      id: `page_${Date.now().toString(36)}`,
      name: 'Page 1',
      width: 1280,
      height: 720,
      elements: [],
      background: 'FFFFFF'
    })
  }

  const now = Date.now()
  return {
    schemaVersion: 'v1',
    id: `doc_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    revision: 0,
    name,
    format: 'ppt169',
    pages,
    assets: [],
    appliedCommands: [],
    createdAt: now,
    updatedAt: now
  }
}

// --- 属性解析辅助函数 ---

type SvgAttributes = Record<string, string>

/** 从属性字符串解析 key="value" 对 */
function parseAttributes(attrString: string): SvgAttributes {
  const attrs: SvgAttributes = {}
  const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (const match of attrString.matchAll(regex)) {
    attrs[match[1]] = match[2] ?? match[3] ?? ''
  }
  return attrs
}

function parsePaint(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === 'none' || value === 'transparent') return null
  return parseColor(value)
}

/**
 * Reads the ordered path list emitted by PPT Master's preset renderer.
 * Group-level paint is inherited while explicit `none` remains distinguishable
 * from an absent attribute.
 */
export function parsePresetPathsFromSvg(svgContent: string): DesignPresetPath[] {
  const groupMatch = svgContent.match(/<g\b([^>]*)>/i)
  const groupAttrs = parseAttributes(groupMatch?.[1] ?? '')
  const groupFill = parsePaint(groupAttrs.fill)
  const groupStroke = parsePaint(groupAttrs.stroke)
  const paths: DesignPresetPath[] = []
  const pathPattern = /<path\b([^>]*)\/?>/gi
  for (const match of svgContent.matchAll(pathPattern)) {
    const attrs = parseAttributes(match[1] ?? '')
    if (!attrs.d) continue
    const fill = parsePaint(attrs.fill)
    const stroke = parsePaint(attrs.stroke)
    const strokeWidth = attrs['stroke-width'] === undefined
      ? undefined
      : Number.parseFloat(attrs['stroke-width'])
    const opacity = attrs.opacity === undefined ? undefined : Number.parseFloat(attrs.opacity)
    paths.push({
      d: attrs.d,
      ...(fill !== undefined ? { fill } : groupFill !== undefined ? { fill: groupFill } : {}),
      ...(stroke !== undefined ? { stroke } : groupStroke !== undefined ? { stroke: groupStroke } : {}),
      ...(Number.isFinite(strokeWidth) && strokeWidth! >= 0 ? { strokeWidth } : {}),
      ...(Number.isFinite(opacity) && opacity! >= 0 && opacity! <= 1 ? { opacity } : {})
    })
  }
  return paths
}

function plainTextContent(content: string): string {
  return content
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .trim()
}

/** 颜色：去 # 存储为内部格式 */
function parseColor(value: string | undefined): string | undefined {
  if (!value || value === 'none' || value === 'transparent') return undefined
  const hex = value.replace('#', '').trim()
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) return hex.toUpperCase()
  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    // 展开 3 位 hex
    return hex.split('').map((c) => c + c).join('').toUpperCase()
  }
  return undefined
}

/** 数值解析（容忍小数，取整） */
function parseNum(value: string | undefined, fallback = 0): number {
  if (!value) return fallback
  const n = parseFloat(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

function parseRotation(value: string | undefined): number {
  if (!value) return 0
  const match = value.match(/(?:^|\s)rotate\(\s*(-?\d+(?:\.\d+)?)/i)
  if (!match) return 0
  const rotation = Number.parseFloat(match[1])
  return Number.isFinite(rotation) ? rotation : 0
}

function parseOpacity(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const opacity = Number.parseFloat(value)
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : undefined
}

function parseStrokeLinecap(
  value: string | undefined
): DesignElement['strokeLinecap'] {
  return value === 'butt' || value === 'round' || value === 'square'
    ? value
    : undefined
}

function parseStrokeLinejoin(
  value: string | undefined
): DesignElement['strokeLinejoin'] {
  return value === 'miter' || value === 'round' || value === 'bevel'
    ? value
    : undefined
}

/** 创建 rect 元素 */
function createRectElement(attrs: SvgAttributes): DesignElement | null {
  const x = parseNum(attrs.x, 0)
  const y = parseNum(attrs.y, 0)
  const w = parseNum(attrs.width, 0)
  const h = parseNum(attrs.height, 0)
  if (w <= 0 || h <= 0) return null // 跳过零尺寸（如背景全屏矩形可能很大，保留）
  return createDesignElement('rect', {
    x, y, w, h,
    fill: parseColor(attrs.fill) ?? 'FFFFFF',
    stroke: parseColor(attrs.stroke),
    strokeWidth: attrs['stroke-width'] ? parseNum(attrs['stroke-width'], 0) : undefined,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

/** 创建 ellipse 元素 */
function createEllipseElement(attrs: SvgAttributes): DesignElement | null {
  const cx = parseNum(attrs.cx, 0)
  const cy = parseNum(attrs.cy, 0)
  const rx = attrs.rx ? parseNum(attrs.rx, 0) : parseNum(attrs.r, 0)
  const ry = attrs.ry ? parseNum(attrs.ry, 0) : parseNum(attrs.r, 0)
  if (rx <= 0 || ry <= 0) return null
  return createDesignElement('ellipse', {
    x: cx - rx,
    y: cy - ry,
    w: rx * 2,
    h: ry * 2,
    fill: parseColor(attrs.fill) ?? 'FFFFFF',
    stroke: parseColor(attrs.stroke),
    strokeWidth: attrs['stroke-width'] ? parseNum(attrs['stroke-width'], 0) : undefined,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

/** 创建 line 元素 */
function createLineElement(attrs: SvgAttributes): DesignElement | null {
  const x1 = parseNum(attrs.x1, 0)
  const y1 = parseNum(attrs.y1, 0)
  const x2 = parseNum(attrs.x2, 0)
  const y2 = parseNum(attrs.y2, 0)
  return createDesignElement('line', {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    stroke: parseColor(attrs.stroke) ?? '000000',
    strokeWidth: attrs['stroke-width'] ? parseNum(attrs['stroke-width'], 1) : 1,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

/** 创建 path 元素 */
function createPathElement(attrs: SvgAttributes): DesignElement | null {
  const d = attrs.d
  if (!d) return null
  // path 没有显式 x/y/w/h，用 bounding box 估算（从 d 提取坐标）
  const bounds = estimatePathBounds(d)
  return createDesignElement('path', {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.w, 1),
    h: Math.max(bounds.h, 1),
    pathData: d,
    fill: parseColor(attrs.fill) ?? 'FFFFFF',
    stroke: parseColor(attrs.stroke),
    strokeWidth: attrs['stroke-width'] ? parseNum(attrs['stroke-width'], 0) : undefined,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

/** 创建 text 元素 */
function createTextElement(attrs: SvgAttributes, content: string): DesignElement | null {
  if (!content) return null
  const fontSize = parseNum(attrs['font-size'], 24)
  // text 的 y 是基线位置，回退到顶部
  const x = parseNum(attrs.x, 0)
  const y = parseNum(attrs.y, 0) - fontSize
  return createDesignElement('text', {
    x,
    y,
    w: 200, // text 默认宽度（无法从 SVG 精确获取）
    h: fontSize * 1.4,
    text: content,
    fontSize,
    fontFamily: attrs['font-family'] ?? "system-ui, 'Microsoft YaHei', sans-serif",
    fontWeight: attrs['font-weight'] ?? 'normal',
    fill: parseColor(attrs.fill) ?? '000000',
    textAlign: attrs['text-anchor'] === 'middle' ? 'center' : attrs['text-anchor'] === 'end' ? 'right' : 'left',
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

/** 创建 polygon/polyline 元素（转成 path） */
function createPolygonElement(attrs: SvgAttributes, closed: boolean): DesignElement | null {
  const points = attrs.points
  if (!points) return null
  // 转成 path d
  const nums = points.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  if (nums.length < 4) return null
  let d = `M${nums[0]},${nums[1]}`
  for (let i = 2; i < nums.length; i += 2) {
    d += ` L${nums[i]},${nums[i + 1]}`
  }
  if (closed) d += ' Z'
  const bounds = estimatePathBounds(d)
  return createDesignElement('path', {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.w, 1),
    h: Math.max(bounds.h, 1),
    pathData: d,
    fill: parseColor(attrs.fill) ?? 'FFFFFF',
    stroke: parseColor(attrs.stroke),
    strokeWidth: attrs['stroke-width'] ? parseNum(attrs['stroke-width'], 0) : undefined,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

function createImageElement(
  attrs: SvgAttributes,
  options: SvgParseOptions
): DesignElement | null {
  const href = attrs.href ?? attrs['xlink:href']
  if (!href) return null
  const imageAssetId = options.imageAssetIdForHref?.(href)
  if (!imageAssetId) return null
  const x = parseNum(attrs.x, 0)
  const y = parseNum(attrs.y, 0)
  const w = parseNum(attrs.width, 0)
  const h = parseNum(attrs.height, 0)
  if (w <= 0 || h <= 0) return null
  return createDesignElement('image', {
    x,
    y,
    w,
    h,
    imageAssetId,
    opacity: parseOpacity(attrs.opacity),
    rotation: parseRotation(attrs.transform),
    zIndex: 0
  })
}

/** 从 path d 字符串估算 bounding box。
 *
 * 注意：path 命令的参数数量不固定（M/L 是 x,y 对；A 是 rx,ry,rot,large,sweep,x,y 共 7 个），
 * 不能简单地按"每两个数字一对"解析。这里提取所有数字，取全局 min/max 作为 bounds。
 * 这不是精确的 path bounds（精确需要完整解析每条命令），但对于 Design 画布的
 * "选中/拖拽/属性面板"用途足够——用户可以手动调整。
 */
function estimatePathBounds(d: string): { x: number; y: number; w: number; h: number } {
  const allNums = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? []
  if (allNums.length < 2) return { x: 0, y: 0, w: 100, h: 100 }

  // 提取 M 命令的起点作为 x/y（最可靠的位置信息）
  const mMatch = d.match(/M\s*(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
  const startX = mMatch ? parseFloat(mMatch[1]) : Math.min(...allNums)
  const startY = mMatch ? parseFloat(mMatch[2]) : Math.min(...allNums)

  // 全局 min/max 估算 bounds（不精确但够用）
  const minVal = Math.min(...allNums)
  const maxVal = Math.max(...allNums)
  const span = Math.max(1, maxVal - minVal)

  return {
    x: Math.round(startX),
    y: Math.round(startY),
    w: Math.max(1, Math.round(span)),
    h: Math.max(1, Math.round(span * 0.6)) // path 通常宽 > 高，给一个粗略比例
  }
}
