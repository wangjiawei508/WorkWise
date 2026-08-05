/**
 * SVG → DesignDocument 解析器（保真版）。
 *
 * 把 pptx_to_svg.py 产出的 SVG 解析为 DesignDocumentV1，尽量保留：
 * - 层级顺序（zIndex 与源文档一致）
 * - `<g>` 的变换（translate/scale/rotate/matrix）与样式继承（fill/stroke/opacity/字体）
 * - `<text>`/`<tspan>` 的多行文字与各自位置
 * - 渐变填充（url(#id) → 首段 stop 色，Design 模型仅支持纯色）
 * - 形状名称（data-name / data-pptx-shape-name → 图层面板显示名）
 *
 * 支持的 SVG 元素：
 * - <rect> → rect
 * - <ellipse>/<circle> → ellipse
 * - <line> → line
 * - <path> → path（保留原始 d，并按组变换重写坐标）
 * - <text> → text（含 tspan 分行）
 * - <polygon>/<polyline> → path
 * - <image> → image（由调用方把 href 映射为资产 id）
 * - <g> → 扁平化，但保留组变换/样式/名称
 * - <defs> → 仅收集渐变，不产生可见元素
 */

import {
  createDesignDocument,
  createDesignElement,
  generateDesignElementId,
  type DesignElement,
  type DesignDocumentV1,
  type DesignPage,
  type DesignPresetPath
} from './design-document'

export type SvgParseOptions = {
  imageAssetIdForHref?: (href: string) => string | undefined
}

type Mat = [number, number, number, number, number, number]

const IDENTITY_MATRIX: Mat = [1, 0, 0, 1, 0, 0]

type TransformOp = {
  kind: 'translate' | 'scale' | 'rotate' | 'matrix' | 'skewX' | 'skewY'
  values: number[]
}

type SvgNode = {
  tag: string
  attrs: Record<string, string>
  children: SvgNode[]
  text: string
}

type StyleContext = {
  fill: string | null | undefined
  stroke: string | null | undefined
  strokeWidth: number | undefined
  opacity: number | undefined
  fontSize: number | undefined
  fontFamily: string | undefined
  fontWeight: string | undefined
  textAnchor: string | undefined
  name: string | undefined
  matrix: Mat
  ops: TransformOp[]
}

/**
 * 解析一个 SVG 文件内容为一个 DesignPage。
 */
export function parseSvgToPage(
  svgContent: string,
  pageName = 'Imported Page',
  options: SvgParseOptions = {}
): DesignPage | null {
  const viewBoxMatch = svgContent.match(/viewBox=["']0\s+0\s+(\d+)\s+(\d+)["']/)
  const width = viewBoxMatch ? parseInt(viewBoxMatch[1], 10) : 1280
  const height = viewBoxMatch ? parseInt(viewBoxMatch[2], 10) : 720

  const cleaned = svgContent
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
  const roots = parseSvgTree(cleaned)
  const gradients = collectGradientStops(roots)

  const elements: DesignElement[] = []
  const walk = (nodes: SvgNode[], ctx: StyleContext): void => {
    for (const node of nodes) {
      const tag = node.tag.toLowerCase()
      if (tag === 'defs') continue
      if (tag === 'linearGradient' || tag === 'radialGradient' || tag === 'stop' || tag === 'filter' || tag === 'mask') {
        continue
      }
      if (tag === 'g' || tag === 'svg') {
        const nextOps = [...ctx.ops, ...parseTransformOps(node.attrs.transform)]
        const nextCtx: StyleContext = {
          fill: node.attrs.fill !== undefined ? resolvePaint(node.attrs.fill, gradients) : ctx.fill,
          stroke: node.attrs.stroke !== undefined ? resolvePaint(node.attrs.stroke, gradients) : ctx.stroke,
          strokeWidth: node.attrs['stroke-width'] !== undefined
            ? parseNum(node.attrs['stroke-width'], 0)
            : ctx.strokeWidth,
          opacity: node.attrs.opacity !== undefined
            ? (ctx.opacity ?? 1) * (parseOpacity(node.attrs.opacity) ?? 1)
            : ctx.opacity,
          fontSize: node.attrs['font-size'] !== undefined ? parseNum(node.attrs['font-size'], 0) : ctx.fontSize,
          fontFamily: node.attrs['font-family'] ?? ctx.fontFamily,
          fontWeight: node.attrs['font-weight'] ?? ctx.fontWeight,
          textAnchor: node.attrs['text-anchor'] ?? ctx.textAnchor,
          name: node.attrs['data-name'] || node.attrs['data-pptx-shape-name'] || ctx.name,
          matrix: multiplyMatrix(ctx.matrix, parseTransform(node.attrs.transform)),
          ops: nextOps
        }
        walk(node.children, nextCtx)
        continue
      }
      if (tag === 'text') {
        const textElements = createTextElements(node, ctx, gradients)
        for (const el of textElements) {
          if (el) elements.push(withZIndex(el, elements.length))
        }
        continue
      }

      let el: DesignElement | null = null
      switch (tag) {
        case 'rect':
          el = createRectElement(node.attrs, ctx, gradients)
          break
        case 'ellipse':
        case 'circle':
          el = createEllipseElement(node.attrs, ctx, gradients)
          break
        case 'line':
          el = createLineElement(node.attrs, ctx, gradients)
          break
        case 'path':
          el = createPathElement(node.attrs, ctx, gradients)
          break
        case 'polygon':
        case 'polyline':
          el = createPolygonElement(node.attrs, tag === 'polygon', ctx, gradients)
          break
        case 'image':
          el = createImageElement(node.attrs, ctx, options)
          break
        default:
          el = null
      }
      if (el) {
        el.name = node.attrs['data-name'] || node.attrs['data-pptx-shape-name'] || ctx.name || el.name
        elements.push(withZIndex(el, elements.length))
      }
    }
  }

  walk(roots, {
    fill: undefined,
    stroke: undefined,
    strokeWidth: undefined,
    opacity: undefined,
    fontSize: undefined,
    fontFamily: undefined,
    fontWeight: undefined,
    textAnchor: undefined,
    name: undefined,
    matrix: IDENTITY_MATRIX,
    ops: []
  })

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

// ---------------------------------------------------------------------------
// SVG 树解析
// ---------------------------------------------------------------------------

function parseSvgTree(xml: string): SvgNode[] {
  const roots: SvgNode[] = []
  const stack: SvgNode[] = []
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    if (match[0].startsWith('<!--') || match[0].startsWith('<![CDATA[')) continue
    if (match[5] !== undefined) {
      if (stack.length > 0) stack[stack.length - 1].text += match[5]
      continue
    }
    const closing = match[1] === '/'
    const tag = match[2]
    const attrs = parseAttributes(match[3] ?? '')
    const selfClosing = match[4] === '/'
    if (closing) {
      if (stack.length > 0 && stack[stack.length - 1].tag === tag) stack.pop()
      continue
    }
    const node: SvgNode = { tag, attrs, children: [], text: '' }
    if (stack.length > 0) stack[stack.length - 1].children.push(node)
    else roots.push(node)
    if (!selfClosing) stack.push(node)
  }
  return roots
}

function collectGradientStops(nodes: SvgNode[]): Map<string, string> {
  const stops = new Map<string, string>()
  const visit = (list: SvgNode[]): void => {
    for (const node of list) {
      if (!node || !node.tag) {
        continue
      }
      const tag = node.tag.toLowerCase()
      if ((tag === 'lineargradient' || tag === 'radialgradient') && node.attrs.id) {
        const firstStop = node.children.find((child) => child.tag.toLowerCase() === 'stop')
        const color = firstStop?.attrs['stop-color']
        if (color && color.startsWith('#')) stops.set(node.attrs.id, color)
      }
      visit(node.children)
    }
  }
  visit(nodes)
  return stops
}

function withZIndex(element: DesignElement, index: number): DesignElement {
  return { ...element, zIndex: index }
}

// ---------------------------------------------------------------------------
// 变换
// ---------------------------------------------------------------------------

function multiplyMatrix(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ]
}

function parseTransform(value: string | undefined): Mat {
  if (!value) return IDENTITY_MATRIX
  let result: Mat = IDENTITY_MATRIX
  const re = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) !== null) {
    const nums = match[2].split(/[\s,]+/).map(Number).filter(Number.isFinite)
    let part: Mat = IDENTITY_MATRIX
    switch (match[1]) {
      case 'translate':
        part = [1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0]
        break
      case 'scale':
        part = [nums[0] ?? 1, 0, 0, nums[1] ?? nums[0] ?? 1, 0, 0]
        break
      case 'rotate': {
        const angle = (nums[0] ?? 0) * Math.PI / 180
        const cx = nums[1] ?? 0
        const cy = nums[2] ?? 0
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        part = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]
        break
      }
      case 'matrix':
        if (nums.length >= 6) part = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]
        break
      case 'skewX':
        part = [1, 0, Math.tan((nums[0] ?? 0) * Math.PI / 180), 1, 0, 0]
        break
      case 'skewY':
        part = [1, Math.tan((nums[0] ?? 0) * Math.PI / 180), 0, 1, 0, 0]
        break
    }
    result = multiplyMatrix(result, part)
  }
  return result
}

function parseTransformOps(value: string | undefined): TransformOp[] {
  if (!value) return []
  const ops: TransformOp[] = []
  const re = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(value)) !== null) {
    const nums = match[2].split(/[\s,]+/).map(Number).filter(Number.isFinite)
    ops.push({
      kind: match[1] as TransformOp['kind'],
      values: nums
    })
  }
  return ops
}

function applyOpsToBox(
  ops: TransformOp[],
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number
): { x: number; y: number; w: number; h: number; rotation: number } {
  let box = { x, y, w, h, rotation }
  for (const op of ops) {
    const v = op.values
    switch (op.kind) {
      case 'translate':
        box.x += v[0] ?? 0
        box.y += v[1] ?? 0
        break
      case 'scale': {
        const sx = v[0] ?? 1
        const sy = v[1] ?? sx
        box.x *= sx
        box.y *= sy
        box.w *= sx
        box.h *= sy
        break
      }
      case 'rotate':
        box.rotation += v[0] ?? 0
        break
      case 'skewX':
      case 'skewY':
      case 'matrix': {
        const matrix = parseTransform(`${op.kind}(${v.join(' ')})`)
        box = applyMatrixToBox(matrix, box.x, box.y, box.w, box.h, box.rotation)
        break
      }
    }
  }
  return box
}

function opsTranslate(ops: TransformOp[]): [number, number] {
  let dx = 0
  let dy = 0
  for (const op of ops) {
    if (op.kind === 'translate') {
      dx += op.values[0] ?? 0
      dy += op.values[1] ?? 0
    }
  }
  return [dx, dy]
}

function opsScale(ops: TransformOp[]): number {
  let scale = 1
  for (const op of ops) {
    if (op.kind === 'scale') scale *= op.values[0] ?? 1
  }
  return scale
}

function opsRotation(ops: TransformOp[]): number {
  let rotation = 0
  for (const op of ops) {
    if (op.kind === 'rotate') rotation += op.values[0] ?? 0
  }
  return rotation
}

function transformPoint(matrix: Mat, x: number, y: number): [number, number] {
  return [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5]
  ]
}

function applyMatrixToBox(
  matrix: Mat,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number
): { x: number; y: number; w: number; h: number; rotation: number } {
  const scaleX = Math.hypot(matrix[0], matrix[1])
  const scaleY = Math.hypot(matrix[2], matrix[3])
  const shear = Math.abs(matrix[0] * matrix[2] + matrix[1] * matrix[3]) > 1e-6
  const angle = Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI
  if (!shear && Math.abs(scaleX - 1) < 1e-6 && Math.abs(scaleY - 1) < 1e-6) {
    // 纯旋转（+平移）：保留原盒，仅旋转与平移
    return { x: x + matrix[4], y: y + matrix[5], w, h, rotation: rotation + angle }
  }
  if (!shear) {
    // 平移 + 缩放
    return {
      x: x * scaleX + matrix[4],
      y: y * scaleY + matrix[5],
      w: w * scaleX,
      h: h * scaleY,
      rotation
    }
  }
  // 一般仿射：用四角包围盒
  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h]
  ].map(([px, py]) => transformPoint(matrix, px, py))
  const xs = corners.map((point) => point[0])
  const ys = corners.map((point) => point[1])
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    rotation: rotation + angle
  }
}

function transformPathData(d: string, matrix: Mat): string {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) ?? []
  const out: string[] = []
  let i = 0
  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0

  const emit = (cmd: string, params: number[]): void => {
    out.push(cmd + ' ' + params.map((value) => round2(value)).join(' '))
  }

  while (i < tokens.length) {
    const token = tokens[i]
    if (!/[A-Za-z]/.test(token)) {
      i += 1
      continue
    }
    const cmd = token
    const upper = cmd.toUpperCase()
    const rel = cmd === cmd.toLowerCase()
    i += 1
    const need: Record<string, number> = {
      M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0
    }
    const count = need[upper] ?? 0
    if (count === 0) {
      out.push(cmd)
      if (upper === 'Z') {
        currentX = startX
        currentY = startY
      }
      continue
    }
    let first = true
    while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
      const params: number[] = []
      let consumed = 0
      while (consumed < count && i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
        params.push(parseFloat(tokens[i]))
        i += 1
        consumed += 1
      }
      if (params.length < count) break

      if (upper === 'H') {
        const x = rel ? currentX + params[0] : params[0]
        const [tx] = transformPoint(matrix, x, currentY)
        emit(first ? cmd : upper, [tx])
        currentX = x
      } else if (upper === 'V') {
        const y = rel ? currentY + params[0] : params[0]
        const [, ty] = transformPoint(matrix, currentX, y)
        emit(first ? cmd : upper, [ty])
        currentY = y
      } else if (upper === 'A') {
        const rx = params[0]
        const ry = params[1]
        const rot = params[2]
        const large = params[3]
        const sweep = params[4]
        const x = rel ? currentX + params[5] : params[5]
        const y = rel ? currentY + params[6] : params[6]
        const scale = (Math.hypot(matrix[0], matrix[1]) + Math.hypot(matrix[2], matrix[3])) / 2
        const [tx, ty] = transformPoint(matrix, x, y)
        emit(first ? cmd : upper, [
          rx * scale,
          ry * scale,
          rot + Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI,
          large,
          sweep,
          tx,
          ty
        ])
        currentX = x
        currentY = y
      } else {
        const values: number[] = []
        for (let p = 0; p < params.length; p += 2) {
          const x = rel ? currentX + params[p] : params[p]
          const y = rel ? currentY + params[p + 1] : params[p + 1]
          const [tx, ty] = transformPoint(matrix, x, y)
          values.push(tx, ty)
          if (upper === 'M' || upper === 'L' || upper === 'T') {
            currentX = x
            currentY = y
          } else if (upper === 'C') {
            if (p === 4) {
              currentX = x
              currentY = y
            }
          } else if (upper === 'S' || upper === 'Q') {
            if (p === 2) {
              currentX = x
              currentY = y
            }
          }
        }
        emit(first ? cmd : upper, values)
        if (upper === 'M' && first) {
          startX = currentX
          startY = currentY
        }
      }
      first = false
    }
  }
  return out.join(' ')
}

function round2(value: number): string {
  return String(Math.round(value * 100) / 100)
}

// ---------------------------------------------------------------------------
// 属性解析辅助函数
// ---------------------------------------------------------------------------

type SvgAttributes = Record<string, string>

function parseAttributes(attrString: string): SvgAttributes {
  const attrs: SvgAttributes = {}
  const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (const match of attrString.matchAll(regex)) {
    attrs[match[1]] = match[2] ?? match[3] ?? ''
  }
  return attrs
}

function resolvePaint(value: string | undefined, gradients: Map<string, string>): string | null | undefined {
  if (value === undefined) return undefined
  if (value === 'none' || value === 'transparent') return null
  const urlMatch = value.match(/^url\(\s*#([^)\s]+)\s*\)$/i)
  if (urlMatch) {
    const stopColor = gradients.get(urlMatch[1])
    return stopColor ? parseColor(stopColor) : undefined
  }
  return parseColor(value)
}

function parsePaint(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === 'none' || value === 'transparent') return null
  return parseColor(value)
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

function parseColor(value: string | undefined): string | undefined {
  if (!value || value === 'none' || value === 'transparent') return undefined
  const hex = value.replace('#', '').trim()
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) return hex.toUpperCase()
  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    return hex.split('').map((c) => c + c).join('').toUpperCase()
  }
  return undefined
}

function parseNum(value: string | undefined, fallback = 0): number {
  if (!value) return fallback
  const n = parseFloat(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

function parseOpacity(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const opacity = Number.parseFloat(value)
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : undefined
}

function parseStrokeLinecap(value: string | undefined): DesignElement['strokeLinecap'] {
  return value === 'butt' || value === 'round' || value === 'square'
    ? value
    : undefined
}

function parseStrokeLinejoin(value: string | undefined): DesignElement['strokeLinejoin'] {
  return value === 'miter' || value === 'round' || value === 'bevel'
    ? value
    : undefined
}

// ---------------------------------------------------------------------------
// 元素创建
// ---------------------------------------------------------------------------

function effectiveFill(
  attrs: SvgAttributes,
  ctx: StyleContext,
  gradients: Map<string, string>,
  fallback = 'FFFFFF'
): string | undefined {
  const value = attrs.fill !== undefined ? resolvePaint(attrs.fill, gradients) : ctx.fill
  return value === undefined ? fallback : (value ?? undefined)
}

function effectiveStroke(
  attrs: SvgAttributes,
  ctx: StyleContext,
  gradients: Map<string, string>
): string | undefined {
  const value = attrs.stroke !== undefined ? resolvePaint(attrs.stroke, gradients) : ctx.stroke
  return value === undefined ? undefined : (value ?? undefined)
}

function effectiveOpacity(attrs: SvgAttributes, ctx: StyleContext): number | undefined {
  if (attrs.opacity !== undefined) return parseOpacity(attrs.opacity)
  if (attrs['fill-opacity'] !== undefined) return parseOpacity(attrs['fill-opacity'])
  return ctx.opacity
}

function createRectElement(
  attrs: SvgAttributes,
  ctx: StyleContext,
  gradients: Map<string, string>
): DesignElement | null {
  const x = parseNum(attrs.x, 0)
  const y = parseNum(attrs.y, 0)
  const w = parseNum(attrs.width, 0)
  const h = parseNum(attrs.height, 0)
  if (w <= 0 || h <= 0) return null
  const box = applyOpsToBox([...ctx.ops, ...parseTransformOps(attrs.transform)], x, y, w, h, 0)
  return createDesignElement('rect', {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.max(1, Math.round(box.w)),
    h: Math.max(1, Math.round(box.h)),
    fill: effectiveFill(attrs, ctx, gradients),
    stroke: effectiveStroke(attrs, ctx, gradients),
    strokeWidth: attrs['stroke-width'] !== undefined
      ? parseNum(attrs['stroke-width'], 0)
      : ctx.strokeWidth,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    opacity: effectiveOpacity(attrs, ctx),
    rotation: Math.round(box.rotation),
    zIndex: 0
  })
}

function createEllipseElement(
  attrs: SvgAttributes,
  ctx: StyleContext,
  gradients: Map<string, string>
): DesignElement | null {
  const cx = parseNum(attrs.cx, 0)
  const cy = parseNum(attrs.cy, 0)
  const rx = attrs.rx ? parseNum(attrs.rx, 0) : parseNum(attrs.r, 0)
  const ry = attrs.ry ? parseNum(attrs.ry, 0) : parseNum(attrs.r, 0)
  if (rx <= 0 || ry <= 0) return null
  const box = applyOpsToBox(
    [...ctx.ops, ...parseTransformOps(attrs.transform)],
    cx - rx,
    cy - ry,
    rx * 2,
    ry * 2,
    0
  )
  return createDesignElement('ellipse', {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.max(1, Math.round(box.w)),
    h: Math.max(1, Math.round(box.h)),
    fill: effectiveFill(attrs, ctx, gradients),
    stroke: effectiveStroke(attrs, ctx, gradients),
    strokeWidth: attrs['stroke-width'] !== undefined
      ? parseNum(attrs['stroke-width'], 0)
      : ctx.strokeWidth,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    opacity: effectiveOpacity(attrs, ctx),
    rotation: Math.round(box.rotation),
    zIndex: 0
  })
}

function createLineElement(
  attrs: SvgAttributes,
  ctx: StyleContext,
  gradients: Map<string, string>
): DesignElement | null {
  const x1 = parseNum(attrs.x1, 0)
  const y1 = parseNum(attrs.y1, 0)
  const x2 = parseNum(attrs.x2, 0)
  const y2 = parseNum(attrs.y2, 0)
  const ops = [...ctx.ops, ...parseTransformOps(attrs.transform)]
  const [dx, dy] = opsTranslate(ops)
  const scale = opsScale(ops)
  return createDesignElement('line', {
    x: Math.round(x1 * scale + dx),
    y: Math.round(y1 * scale + dy),
    w: Math.round((x2 - x1) * scale),
    h: Math.round((y2 - y1) * scale),
    stroke: effectiveStroke(attrs, ctx, gradients) ?? '000000',
    strokeWidth: attrs['stroke-width'] !== undefined
      ? parseNum(attrs['stroke-width'], 1)
      : (ctx.strokeWidth ?? 1),
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    opacity: effectiveOpacity(attrs, ctx),
    rotation: Math.round(opsRotation(ops)),
    zIndex: 0
  })
}

function createPathElement(
  attrs: SvgAttributes,
  ctx: StyleContext,
  gradients: Map<string, string>
): DesignElement | null {
  const d = attrs.d
  if (!d) return null
  const matrix = multiplyMatrix(ctx.matrix, parseTransform(attrs.transform))
  const transformed = transformPathData(d, matrix)
  const bounds = estimatePathBounds(transformed)
  return createDesignElement('path', {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.w, 1),
    h: Math.max(bounds.h, 1),
    pathData: transformed,
    fill: effectiveFill(attrs, ctx, gradients),
    stroke: effectiveStroke(attrs, ctx, gradients),
    strokeWidth: attrs['stroke-width'] !== undefined
      ? parseNum(attrs['stroke-width'], 0)
      : ctx.strokeWidth,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    opacity: effectiveOpacity(attrs, ctx),
    rotation: Math.round(Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI),
    zIndex: 0
  })
}

function createPolygonElement(
  attrs: SvgAttributes,
  closed: boolean,
  ctx: StyleContext,
  gradients: Map<string, string>
): DesignElement | null {
  const points = attrs.points
  if (!points) return null
  const nums = points.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  if (nums.length < 4) return null
  let d = `M${nums[0]},${nums[1]}`
  for (let i = 2; i < nums.length; i += 2) {
    d += ` L${nums[i]},${nums[i + 1]}`
  }
  if (closed) d += ' Z'
  const matrix = multiplyMatrix(ctx.matrix, parseTransform(attrs.transform))
  const transformed = transformPathData(d, matrix)
  const bounds = estimatePathBounds(transformed)
  return createDesignElement('path', {
    x: bounds.x,
    y: bounds.y,
    w: Math.max(bounds.w, 1),
    h: Math.max(bounds.h, 1),
    pathData: transformed,
    fill: effectiveFill(attrs, ctx, gradients),
    stroke: effectiveStroke(attrs, ctx, gradients),
    strokeWidth: attrs['stroke-width'] !== undefined
      ? parseNum(attrs['stroke-width'], 0)
      : ctx.strokeWidth,
    strokeLinecap: parseStrokeLinecap(attrs['stroke-linecap']),
    strokeLinejoin: parseStrokeLinejoin(attrs['stroke-linejoin']),
    opacity: effectiveOpacity(attrs, ctx),
    rotation: Math.round(Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI),
    zIndex: 0
  })
}

function createTextElements(
  node: SvgNode,
  ctx: StyleContext,
  gradients: Map<string, string>
): Array<DesignElement | null> {
  const attrs = node.attrs
  const ops = [...ctx.ops, ...parseTransformOps(attrs.transform)]
  const [dx, dy] = opsTranslate(ops)
  const baseFontSize = attrs['font-size'] !== undefined
    ? parseNum(attrs['font-size'], 24)
    : (ctx.fontSize ?? 24)
  const fontSizeScale = Math.max(0.25, opsScale(ops))
  const fontSize = Math.max(1, Math.round(baseFontSize * fontSizeScale))
  const fill = attrs.fill !== undefined ? resolvePaint(attrs.fill, gradients) : ctx.fill
  const stroke = attrs.stroke !== undefined ? resolvePaint(attrs.stroke, gradients) : ctx.stroke
  const opacity = effectiveOpacity(attrs, ctx)
  const letterSpacing = attrs['letter-spacing'] !== undefined
    ? parseNum(attrs['letter-spacing'], 0)
    : undefined
  const textAnchor = attrs['text-anchor'] ?? ctx.textAnchor
  const textAlign = textAnchor === 'middle' ? 'center' : textAnchor === 'end' ? 'right' : 'left'
  const fontFamily = attrs['font-family'] ?? ctx.fontFamily ?? "system-ui, 'Microsoft YaHei', sans-serif"
  const fontWeight = attrs['font-weight'] ?? ctx.fontWeight ?? 'normal'
  const rotation = Math.round(opsRotation(ops))

  const tspans = node.children.filter((child) => child.tag.toLowerCase() === 'tspan')
  const rawText = plainTextContent(node.text + tspans.map((tspan) => tspan.text).join(''))

  if (tspans.length === 0 || tspans.every((tspan) => tspan.attrs.x === undefined && tspan.attrs.y === undefined)) {
    if (!rawText.trim()) return [null]
    const x = parseNum(attrs.x, 0)
    const baselineY = parseNum(attrs.y, 0) + parseNum(attrs.dy, 0)
    let textW = estimateTextWidth(rawText, fontSize)
    // 居中文本在画布上以 x + w/2 求锚点；w 为奇数会带来 0.5px 偏差，
    // 就近取偶让锚点精确回到 SVG 的 text-anchor 位置。
    if (textAlign === 'center' && textW % 2 !== 0) textW += 1
    // The design model stores x as the element box's left edge, while SVG
    // text-anchor keeps attrs.x as the anchor point (middle/end). Convert the
    // anchor back to a box-left coordinate so the canvas renderer and the SVG
    // serializer place the text at the original anchor position.
    const boxLeft = x + dx - (textAlign === 'center' ? textW / 2 : textAlign === 'right' ? textW : 0)
    return [createDesignElement('text', {
      x: Math.round(boxLeft),
      y: Math.round(baselineY + dy - fontSize),
      w: textW,
      h: Math.round(fontSize * 1.4),
      text: rawText,
      fontSize,
      fontFamily,
      fontWeight,
      fill: fill === undefined ? '000000' : (fill ?? undefined),
      stroke,
      opacity,
      letterSpacing,
      textAlign,
      rotation,
      zIndex: 0
    })]
  }

  const results: Array<DesignElement | null> = []
  for (const tspan of tspans) {
    const content = plainTextContent(tspan.text)
    if (!content.trim()) continue
    const tAttrs = tspan.attrs
    const tFontSize = tAttrs['font-size'] !== undefined
      ? parseNum(tAttrs['font-size'], 24)
      : fontSize
    const x = parseNum(tAttrs.x ?? attrs.x, 0)
    const baselineY = parseNum(tAttrs.y ?? attrs.y, 0) + parseNum(tAttrs.dy ?? attrs.dy, 0)
    const align = tAttrs['text-anchor'] === 'middle' ? 'center'
      : tAttrs['text-anchor'] === 'end' ? 'right' : textAlign
    let contentW = estimateTextWidth(content, tFontSize)
    if (align === 'center' && contentW % 2 !== 0) contentW += 1
    const boxLeft = x + dx - (align === 'center' ? contentW / 2 : align === 'right' ? contentW : 0)
    results.push(createDesignElement('text', {
      x: Math.round(boxLeft),
      y: Math.round(baselineY + dy - tFontSize),
      w: contentW,
      h: Math.round(tFontSize * 1.4),
      text: content,
      fontSize: Math.max(1, Math.round(tFontSize * fontSizeScale)),
      fontFamily: tAttrs['font-family'] ?? fontFamily,
      fontWeight: tAttrs['font-weight'] ?? fontWeight,
      fill: tAttrs.fill !== undefined
        ? (resolvePaint(tAttrs.fill, gradients) ?? undefined)
        : (fill === undefined ? '000000' : (fill ?? undefined)),
      stroke: tAttrs.stroke !== undefined ? (resolvePaint(tAttrs.stroke, gradients) ?? undefined) : stroke,
      opacity: tAttrs.opacity !== undefined
        ? parseOpacity(tAttrs.opacity)
        : tAttrs['fill-opacity'] !== undefined
          ? parseOpacity(tAttrs['fill-opacity'])
          : opacity,
      letterSpacing: tAttrs['letter-spacing'] !== undefined
        ? parseNum(tAttrs['letter-spacing'], 0)
        : letterSpacing,
      textAlign: align,
      rotation,
      zIndex: 0
    }))
  }
  return results.length > 0 ? results : [null]
}

function estimateTextWidth(content: string, fontSize: number): number {
  const chars = Array.from(content)
  const cjk = chars.filter((ch) => /[\u3000-\u9fff\uff00-\uffef]/.test(ch)).length
  const latin = chars.length - cjk
  return Math.max(40, Math.round(fontSize * (cjk * 0.9 + latin * 0.55)))
}

function createImageElement(
  attrs: SvgAttributes,
  ctx: StyleContext,
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
  const box = applyOpsToBox(
    [...ctx.ops, ...parseTransformOps(attrs.transform)],
    x,
    y,
    w,
    h,
    0
  )
  return createDesignElement('image', {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.max(1, Math.round(box.w)),
    h: Math.max(1, Math.round(box.h)),
    imageAssetId,
    opacity: parseOpacity(attrs.opacity),
    rotation: Math.round(box.rotation),
    zIndex: 0
  })
}

/**
 * 从 path d 字符串估算 bounding box（M 起点为 x/y，全局 min/max 为宽高）。
 */
function estimatePathBounds(d: string): { x: number; y: number; w: number; h: number } {
  const nums = d.match(/-?\d+\.?\d*/g)?.map(Number) ?? []
  if (nums.length < 2) return { x: 0, y: 0, w: 100, h: 100 }
  const mMatch = d.match(/M\s*(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/)
  const xValues: number[] = []
  const yValues: number[] = []
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) ?? []
  let currentX = 0
  let currentY = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (/[A-Za-z]/.test(token)) {
      const upper = token.toUpperCase()
      const rel = token === token.toLowerCase()
      const need: Record<string, number> = {
        M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0
      }
      const count = need[upper] ?? 0
      const params: number[] = []
      let consumed = 0
      while (consumed < count && i + 1 < tokens.length && !/[A-Za-z]/.test(tokens[i + 1])) {
        params.push(parseFloat(tokens[i + 1]))
        i += 1
        consumed += 1
      }
      if (upper === 'H' && params.length >= 1) {
        currentX = rel ? currentX + params[0] : params[0]
        xValues.push(currentX)
        yValues.push(currentY)
      } else if (upper === 'V' && params.length >= 1) {
        currentY = rel ? currentY + params[0] : params[0]
        xValues.push(currentX)
        yValues.push(currentY)
      } else if (upper === 'Z') {
        // no-op
      } else {
        for (let p = 0; p + 1 < params.length; p += 2) {
          const x = rel ? currentX + params[p] : params[p]
          const y = rel ? currentY + params[p + 1] : params[p + 1]
          currentX = x
          currentY = y
          xValues.push(x)
          yValues.push(y)
        }
      }
      continue
    }
  }
  const startX = mMatch ? parseFloat(mMatch[1]) : (xValues.length ? Math.min(...xValues) : 0)
  const startY = mMatch ? parseFloat(mMatch[2]) : (yValues.length ? Math.min(...yValues) : 0)
  const minX = xValues.length ? Math.min(...xValues) : startX
  const maxX = xValues.length ? Math.max(...xValues) : startX
  const minY = yValues.length ? Math.min(...yValues) : startY
  const maxY = yValues.length ? Math.max(...yValues) : startY
  return {
    x: Math.round(startX),
    y: Math.round(startY),
    w: Math.max(1, Math.round(maxX - minX)),
    h: Math.max(1, Math.round(maxY - minY))
  }
}
