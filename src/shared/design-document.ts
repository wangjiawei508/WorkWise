/**
 * Design 工作区核心数据模型。
 *
 * 这是 renderer / main / preload 三层共享的单一数据源：
 * - 设计文档（DesignDocumentV1）、页面（DesignPage）、元素（DesignElement）
 * - 画布格式预设（DesignCanvasFormat）
 * - 元素类型枚举（DesignElementType）
 *
 * 坐标系：96dpi 像素，原点左上角，y 向下。
 * 与 PPT Master 的 canvas_contract.py 一致（✅ 已核实 canvas_contract.py:115-123）。
 *
 * 约束来源（✅ svg_quality_checker.py:330-424）：
 * - 颜色用 hex 无 #（如 '1E3A5F'），与 fill/opacity 分离（不用 rgba）
 * - 全 inline 属性，无 class/style
 * - 无 mask/foreignObject/SMIL 动画
 *
 * 画布尺寸：任意正整数像素（✅ canvas_contract.py 只要求原点 0,0 + 正数 + 落在
 * PowerPoint 1-56 inch 范围内）。1280×720 只是 ppt169 预设的默认值，不是硬约束。
 *
 * 架构详见 docs/DESIGN_WORKSPACE_ARCHITECTURE.md。
 */

// ---------------------------------------------------------------------------
// 画布格式预设
// ---------------------------------------------------------------------------

/**
 * 画布格式预设 key。
 * 每个对应一组默认尺寸（见 DESIGN_CANVAS_PRESETS）。
 * 'custom' 时用页面自定义的 width/height。
 */
export const DESIGN_CANVAS_FORMATS = [
  'ppt169',
  'ppt43',
  'a4',
  'poster-a2',
  'social-square',
  'social-story',
  'wechat-cover',
  'banner',
  'custom'
] as const

export type DesignCanvasFormat = (typeof DESIGN_CANVAS_FORMATS)[number]

/**
 * 画布尺寸预设表。
 *
 * 尺寸来源依据（✅ 已核实）：
 * - ppt169/ppt43：PPT Master config.py 的 CANVAS_FORMATS（1280×720 / 1024×768）
 * - a4：210×297mm @ 96dpi ≈ 794×1123px
 * - poster-a2：420×594mm @ 96dpi ≈ 1191×1684px
 * - social-square/social-story：Instagram/小红书常见尺寸
 * - wechat-cover：微信公众号封面常见尺寸
 * - banner：网页横幅常见尺寸
 */
export const DESIGN_CANVAS_PRESETS: ReadonlyArray<{
  format: Exclude<DesignCanvasFormat, 'custom'>
  width: number
  height: number
  labelKey: string
}> = [
  { format: 'ppt169', width: 1280, height: 720, labelKey: 'designFormatPpt169' },
  { format: 'ppt43', width: 1024, height: 768, labelKey: 'designFormatPpt43' },
  { format: 'a4', width: 794, height: 1123, labelKey: 'designFormatA4' },
  { format: 'poster-a2', width: 1191, height: 1684, labelKey: 'designFormatPosterA2' },
  { format: 'social-square', width: 1080, height: 1080, labelKey: 'designFormatSocialSquare' },
  { format: 'social-story', width: 1080, height: 1920, labelKey: 'designFormatSocialStory' },
  { format: 'wechat-cover', width: 900, height: 383, labelKey: 'designFormatWechatCover' },
  { format: 'banner', width: 1920, height: 600, labelKey: 'designFormatBanner' }
]

/** 默认格式（新建文档时） */
export const DEFAULT_DESIGN_CANVAS_FORMAT: DesignCanvasFormat = 'ppt169'

/**
 * 根据格式 key 获取预设尺寸。custom 格式返回 null（由调用方提供尺寸）。
 */
export function canvasSizeForFormat(
  format: DesignCanvasFormat,
  custom?: { width: number; height: number }
): { width: number; height: number } {
  if (format === 'custom') {
    const customWidth = Number.isFinite(custom?.width) ? custom!.width : 1280
    const customHeight = Number.isFinite(custom?.height) ? custom!.height : 720
    return {
      width: Math.max(1, Math.round(customWidth)),
      height: Math.max(1, Math.round(customHeight))
    }
  }
  const preset = DESIGN_CANVAS_PRESETS.find((p) => p.format === format)
  return preset
    ? { width: preset.width, height: preset.height }
    : { width: 1280, height: 720 }
}

// ---------------------------------------------------------------------------
// 元素类型
// ---------------------------------------------------------------------------

/**
 * 画布元素类型。每种对应一个 SVG 节点：
 * - rect → <rect>
 * - ellipse → <ellipse>
 * - line → <line>
 * - path → <path d>
 * - text → <text>
 * - image → <image href>
 * - preset → <g>（PPT Master 187 形状之一，由 preset_shape_svg.py 生成）
 * - group → <g>（子元素分组）
 *
 * 支持的 SVG 元素清单来源（✅ svg_to_pptx/drawingml_converter.py:244-256）。
 */
export const DESIGN_ELEMENT_TYPES = [
  'rect',
  'ellipse',
  'line',
  'path',
  'text',
  'image',
  'preset',
  'group'
] as const

export type DesignElementType = (typeof DESIGN_ELEMENT_TYPES)[number]

export type DesignPresetPath = {
  d: string
  /** undefined inherits the element paint; null explicitly means none. */
  fill?: string | null
  /** undefined inherits the element paint; null explicitly means none. */
  stroke?: string | null
  strokeWidth?: number
  opacity?: number
}

// ---------------------------------------------------------------------------
// 单个画布元素
// ---------------------------------------------------------------------------

/**
 * 单个画布元素。每个元素可直接渲染为一个 SVG 节点。
 *
 * 字段设计原则：
 * - 几何（x/y/w/h/rotation）：所有元素都有，数值为 96dpi 像素
 * - 样式（fill/stroke/opacity）：可选，全 inline 无 class
 * - 颜色：hex 无 # 字符串（如 '1E3A5F'），符合 svg_quality_checker 约束
 * - 类型特有属性放各自字段（text/imageSrc/presetName/pathData/childIds）
 */
export type DesignElement = {
  /** 元素 id，格式 'el_<时间戳><随机>'，文档内唯一 */
  id: string
  type: DesignElementType

  // 几何（96dpi 像素，左上原点）
  x: number
  y: number
  w: number
  h: number
  /** 旋转角度（度），0 为正，顺时针 */
  rotation: number

  // 样式（全可选，全 inline）
  /** 填充色，hex 无 #（如 '1E3A5F' */
  fill?: string
  /** 描边色，hex 无 # */
  stroke?: string
  /** 描边宽度（像素） */
  strokeWidth?: number
  /** 不透明度 0-1。注意：svg_quality_checker 禁止 <g opacity=> 和 rgba，
   *  导出器会把透明度施加到具体元素，而不是结构分组。 */
  opacity?: number

  // type=text 特有
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  textAlign?: 'left' | 'center' | 'right'

  // type=image 特有
  /** 图片资源 id（指向 document.assets），不是直接路径 */
  imageAssetId?: string

  // type=preset 特有
  /** PPT Master DrawingML 预设形状名（如 'rightArrow'）。
   *  取值来自 preset_shape_svg.py list（✅ 187 个，全 ASCII camelCase） */
  presetName?: string

  // type=path 特有
  /** SVG path d 属性值（如 'M10,10 L100,100'） */
  pathData?: string
  /** 复杂预设形状的有序多路径。pathData 继续保留首路径以兼容旧文档。 */
  presetPaths?: DesignPresetPath[]

  // type=group 特有
  /** 子元素 id 列表（文档内引用） */
  childIds?: string[]

  // 通用元数据
  /** 图层面板显示名。缺省时用 type + 序号 */
  name?: string
  /** z 序（越大越在上）。同一文档内唯一性由 store 维护 */
  zIndex: number
  /** 锁定（不可选中/编辑） */
  locked?: boolean
  /** 隐藏（不渲染） */
  hidden?: boolean
}

// ---------------------------------------------------------------------------
// 单页画布
// ---------------------------------------------------------------------------

/**
 * 单页画布，对应一张幻灯片/一张图。
 * 一个文档可有多个页面（多页设计/PPT）。
 */
export type DesignPage = {
  id: string
  /** 页面名（如 'slide_01_cover'）。缺省用 'Page N' */
  name: string
  /** 画布宽度（96dpi 像素，任意正整数） */
  width: number
  /** 画布高度（96dpi 像素，任意正整数） */
  height: number
  /** 页面元素列表（按 zIndex 排序渲染） */
  elements: DesignElement[]
  /** 背景色（hex 无 #）。缺省透明或白 */
  background?: string
}

// ---------------------------------------------------------------------------
// 资源（图片等）
// ---------------------------------------------------------------------------

/**
 * 文档资源（主要是图片）。
 * 资源文件存在文档目录的 assets/ 下，元素通过 imageAssetId 引用。
 */
export type DesignAsset = {
  id: string
  /** 文件名（在文档专属 assets/ 目录下，如 'cover.png'；不得包含路径分隔符） */
  filename: string
  mimeType: string
  /** 原始像素尺寸（用于等比缩放计算） */
  width: number
  height: number
  /** 文件字节大小（用于限制/校验） */
  byteSize: number
}

// ---------------------------------------------------------------------------
// 设计文档
// ---------------------------------------------------------------------------

/**
 * 完整设计文档。序列化为 JSON 存盘。
 *
 * 序列化路径：
 * - 存盘：DesignDocumentV1 JSON + assets/ 图片 → <workspace>/.workwise/design/
 * - SVG 渲染：每页 elements → SVG 节点（CanvasView 组件）
 * - 导出 PPTX：每页 → <svg viewBox="0 0 W H"> → svg_to_pptx.py
 */
export type DesignDocumentV1 = {
  schemaVersion: 'v1'
  id: string
  /**
   * 单调递增的内容 revision。任何可持久化画板变更必须递增，
   * main 进程用它和 expectedRevision 一起阻止旧 renderer 覆盖新数据。
   */
  revision: number
  /** 文档名（也是项目目录名） */
  name: string
  /** 画布格式（新建文档时选，影响默认尺寸）。custom 时各页可不同尺寸 */
  format: DesignCanvasFormat
  /** 页面列表 */
  pages: DesignPage[]
  /** 资源列表 */
  assets: DesignAsset[]
  /** 可选设计 Token（颜色、字体和间距规范） */
  designTokens?: {
    colors?: string[]
    fonts?: string[]
    spacing?: number[]
  }
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// 工厂函数与工具
// ---------------------------------------------------------------------------

/** 生成元素 id */
export function generateDesignElementId(): string {
  return `el_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 生成页面 id */
export function generateDesignPageId(): string {
  return `page_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** 生成文档 id */
export function generateDesignDocumentId(): string {
  return `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 计算下一个可用的 zIndex（当前最大值 + 1）。
 * 用于创建新元素时分配 z 序，保证新元素在最上层。
 * 空列表时返回 0。
 */
export function nextZIndex(elements: ReadonlyArray<DesignElement>): number {
  let max = -1
  for (const el of elements) {
    if (typeof el.zIndex === 'number' && el.zIndex > max) max = el.zIndex
  }
  return max + 1
}

/**
 * 把内部颜色（hex 无 #，如 '1E3A5F'）格式化为 SVG 属性值（带 #，如 '#1E3A5F'）。
 *
 * 渲染 SVG 时必须用此函数：SVG 规范要求 fill/stroke 属性带 #（如 fill="#1E3A5F"），
 * 但数据模型内部存无 # 格式（便于比较/存储，也与 svg_to_pptx 的 parse_svg_color
 * 兼容——它对 # 可有可无，见 utils.py:1650）。
 *
 * 非法颜色回退为 '#000000'（黑），避免渲染出 malformed SVG。
 */
export function formatSvgColor(internalColor: string | undefined): string | undefined {
  if (internalColor === undefined) return undefined
  if (isValidDesignColor(internalColor)) return `#${internalColor}`
  return '#000000'
}

/**
 * 创建一个默认元素（指定类型，其余用合理初始值）。
 * 用于工具栏点击"添加矩形/圆/文字"等场景。
 */
export function createDesignElement(
  type: DesignElementType,
  overrides: Partial<DesignElement> = {}
): DesignElement {
  const base: DesignElement = {
    id: generateDesignElementId(),
    type,
    x: 100,
    y: 100,
    w: 200,
    h: 120,
    rotation: 0,
    fill: '1E3A5F',
    zIndex: 0,
    ...overrides
  }
  // 类型特有默认值
  if (type === 'text') {
    base.text = overrides.text ?? '文本'
    base.fontSize = overrides.fontSize ?? 24
    base.fontFamily = overrides.fontFamily ?? "system-ui, 'Microsoft YaHei', sans-serif"
    base.fontWeight = overrides.fontWeight ?? 'normal'
    base.fill = overrides.fill ?? '1A1A2E'
  }
  if (type === 'ellipse') {
    base.fill = overrides.fill ?? '4A90D9'
  }
  if (type === 'line') {
    base.stroke = overrides.stroke ?? '1A1A2E'
    base.strokeWidth = overrides.strokeWidth ?? 2
    base.fill = undefined
  }
  if (type === 'image') {
    base.fill = undefined
  }
  if (type === 'path') {
    base.pathData = overrides.pathData ?? 'M0,0 L100,0 L100,100 L0,100 Z'
    base.fill = overrides.fill ?? 'C41E3A'
  }
  if (type === 'preset') {
    base.presetName = overrides.presetName ?? 'rect'
    base.fill = overrides.fill ?? '1E3A5F'
  }
  if (type === 'group') {
    base.childIds = overrides.childIds ?? []
    base.fill = undefined
  }
  return base
}

/**
 * 创建一个默认页面（指定格式或自定义尺寸）。
 */
export function createDesignPage(options?: {
  format?: DesignCanvasFormat
  customSize?: { width: number; height: number }
  name?: string
}): DesignPage {
  const format = options?.format ?? DEFAULT_DESIGN_CANVAS_FORMAT
  const size = canvasSizeForFormat(format, options?.customSize)
  return {
    id: generateDesignPageId(),
    name: options?.name ?? 'Page 1',
    width: size.width,
    height: size.height,
    elements: [],
    background: 'FFFFFF'
  }
}

/**
 * 创建一个默认文档。
 */
export function createDesignDocument(options?: {
  name?: string
  format?: DesignCanvasFormat
  customSize?: { width: number; height: number }
}): DesignDocumentV1 {
  const now = Date.now()
  const format = options?.format ?? DEFAULT_DESIGN_CANVAS_FORMAT
  return {
    schemaVersion: 'v1',
    id: generateDesignDocumentId(),
    revision: 0,
    name: options?.name ?? '未命名设计',
    format,
    pages: [createDesignPage({ format, customSize: options?.customSize })],
    assets: [],
    createdAt: now,
    updatedAt: now
  }
}

// ---------------------------------------------------------------------------
// 归一化（从 JSON 反序列化时的防御性处理）
// ---------------------------------------------------------------------------

/**
 * 校验颜色字符串是否合法（6 位 hex 无 #）。
 */
export function isValidDesignColor(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-Fa-f]{6}$/.test(value)
}

/**
 * 归一化一个元素（从存盘 JSON 读取时，补全/修正字段）。
 * 用于防御损坏或部分缺失的数据。
 */
export function normalizeDesignElement(input: Partial<DesignElement> | null | undefined): DesignElement | null {
  if (!input || typeof input !== 'object') return null
  if (!input.id || typeof input.id !== 'string') return null
  if (!input.type || !DESIGN_ELEMENT_TYPES.includes(input.type as DesignElementType)) return null

  const element: DesignElement = {
    id: input.id,
    type: input.type as DesignElementType,
    x: typeof input.x === 'number' && Number.isFinite(input.x) ? input.x : 0,
    y: typeof input.y === 'number' && Number.isFinite(input.y) ? input.y : 0,
    w: typeof input.w === 'number' && Number.isFinite(input.w) && input.w > 0 ? input.w : 100,
    h: typeof input.h === 'number' && Number.isFinite(input.h) && input.h > 0 ? input.h : 100,
    rotation: typeof input.rotation === 'number' && Number.isFinite(input.rotation) ? input.rotation : 0,
    zIndex: typeof input.zIndex === 'number' && Number.isFinite(input.zIndex) ? input.zIndex : 0,
    ...(input.fill !== undefined ? { fill: isValidDesignColor(input.fill) ? input.fill : '000000' } : {}),
    ...(input.stroke !== undefined ? { stroke: isValidDesignColor(input.stroke) ? input.stroke : '000000' } : {}),
    ...(typeof input.strokeWidth === 'number' ? { strokeWidth: input.strokeWidth } : {}),
    ...(typeof input.opacity === 'number' && input.opacity >= 0 && input.opacity <= 1 ? { opacity: input.opacity } : {}),
    ...(typeof input.text === 'string' ? { text: input.text } : {}),
    ...(typeof input.fontSize === 'number' && input.fontSize > 0 ? { fontSize: input.fontSize } : {}),
    ...(typeof input.fontFamily === 'string' ? { fontFamily: input.fontFamily } : {}),
    ...(typeof input.fontWeight === 'string' ? { fontWeight: input.fontWeight } : {}),
    ...(input.textAlign !== undefined ? { textAlign: input.textAlign } : {}),
    ...(typeof input.imageAssetId === 'string' ? { imageAssetId: input.imageAssetId } : {}),
    ...(typeof input.presetName === 'string' ? { presetName: input.presetName } : {}),
    ...(typeof input.pathData === 'string' ? { pathData: input.pathData } : {}),
    ...(Array.isArray(input.presetPaths)
      ? {
          presetPaths: input.presetPaths.flatMap((rawPath) => {
            if (!rawPath || typeof rawPath !== 'object' || typeof rawPath.d !== 'string') return []
            const path: DesignPresetPath = { d: rawPath.d }
            if (rawPath.fill === null || isValidDesignColor(rawPath.fill)) path.fill = rawPath.fill
            if (rawPath.stroke === null || isValidDesignColor(rawPath.stroke)) path.stroke = rawPath.stroke
            if (
              typeof rawPath.strokeWidth === 'number' &&
              Number.isFinite(rawPath.strokeWidth) &&
              rawPath.strokeWidth >= 0
            ) {
              path.strokeWidth = rawPath.strokeWidth
            }
            if (
              typeof rawPath.opacity === 'number' &&
              Number.isFinite(rawPath.opacity) &&
              rawPath.opacity >= 0 &&
              rawPath.opacity <= 1
            ) {
              path.opacity = rawPath.opacity
            }
            return [path]
          })
        }
      : {}),
    ...(Array.isArray(input.childIds) ? { childIds: input.childIds.filter((id): id is string => typeof id === 'string') } : {}),
    ...(typeof input.name === 'string' ? { name: input.name } : {}),
    ...(input.locked === true ? { locked: true } : {}),
    ...(input.hidden === true ? { hidden: true } : {})
  }
  return element
}

/**
 * 归一化文档（从存盘 JSON 读取时的防御性处理）。
 * 跳过损坏的页面/元素，保证返回值始终合法可用。
 */
export function normalizeDesignDocument(input: Partial<DesignDocumentV1> | null | undefined): DesignDocumentV1 | null {
  if (!input || typeof input !== 'object') return null

  const pages: DesignPage[] = []
  if (Array.isArray(input.pages)) {
    for (const rawPage of input.pages) {
      if (!rawPage || typeof rawPage !== 'object') continue
      const page = rawPage as Partial<DesignPage>
      if (!page.id || typeof page.id !== 'string') continue
      const elements: DesignElement[] = []
      if (Array.isArray(page.elements)) {
        for (const rawElement of page.elements) {
          const element = normalizeDesignElement(rawElement)
          if (element) elements.push(element)
        }
      }
      pages.push({
        id: page.id,
        name: typeof page.name === 'string' && page.name.trim() ? page.name.trim() : 'Page',
        width: typeof page.width === 'number' && Number.isFinite(page.width) && page.width > 0 ? Math.round(page.width) : 1280,
        height: typeof page.height === 'number' && Number.isFinite(page.height) && page.height > 0 ? Math.round(page.height) : 720,
        elements,
        ...(page.background !== undefined && isValidDesignColor(page.background) ? { background: page.background } : {})
      })
    }
  }

  // 没有 page 或损坏的文档，返回 null（调用方新建空文档）
  if (pages.length === 0) return null

  const now = Date.now()
  const normalized: DesignDocumentV1 = {
    schemaVersion: 'v1',
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : generateDesignDocumentId(),
    revision:
      typeof input.revision === 'number' &&
      Number.isSafeInteger(input.revision) &&
      input.revision >= 0
        ? input.revision
        : 0,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : '未命名设计',
    format: input.format && DESIGN_CANVAS_FORMATS.includes(input.format as DesignCanvasFormat)
      ? (input.format as DesignCanvasFormat)
      : DEFAULT_DESIGN_CANVAS_FORMAT,
    pages,
    assets: normalizeDesignAssets(input.assets),
    ...(input.designTokens && typeof input.designTokens === 'object' ? { designTokens: input.designTokens } : {}),
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : now
  }
  return validateDesignDocumentStructure(normalized) ? normalized : null
}

const SAFE_ASSET_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/
const DESIGN_ASSET_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function normalizeDesignAssets(input: unknown): DesignAsset[] {
  if (!Array.isArray(input)) return []
  const seenIds = new Set<string>()
  const seenFiles = new Set<string>()
  const assets: DesignAsset[] = []
  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object') continue
    const raw = candidate as Partial<DesignAsset>
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    const filename = typeof raw.filename === 'string' ? raw.filename.trim() : ''
    const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim().toLowerCase() : ''
    if (
      !id ||
      id.length > 128 ||
      !SAFE_ASSET_FILENAME.test(filename) ||
      !DESIGN_ASSET_MIME_TYPES.has(mimeType) ||
      seenIds.has(id) ||
      seenFiles.has(filename.toLowerCase())
    ) {
      continue
    }
    const width =
      typeof raw.width === 'number' && Number.isSafeInteger(raw.width) && raw.width > 0
        ? raw.width
        : 1
    const height =
      typeof raw.height === 'number' && Number.isSafeInteger(raw.height) && raw.height > 0
        ? raw.height
        : 1
    const byteSize =
      typeof raw.byteSize === 'number' && Number.isSafeInteger(raw.byteSize) && raw.byteSize >= 0
        ? raw.byteSize
        : 0
    seenIds.add(id)
    seenFiles.add(filename.toLowerCase())
    assets.push({ id, filename, mimeType, width, height, byteSize })
  }
  return assets
}

/**
 * 校验文档的引用结构。归一化只修复缺省字段；重复 id、孤立资源引用和
 * group 循环属于数据损坏，必须拒绝而不能静默丢内容。
 */
export function validateDesignDocumentStructure(document: DesignDocumentV1): boolean {
  if (!Number.isSafeInteger(document.revision) || document.revision < 0) return false
  const pageIds = new Set<string>()
  const assetIds = new Set(document.assets.map((asset) => asset.id))

  for (const page of document.pages) {
    if (!page.id || pageIds.has(page.id)) return false
    pageIds.add(page.id)
    const elementById = new Map<string, DesignElement>()
    for (const element of page.elements) {
      if (!element.id || elementById.has(element.id)) return false
      elementById.set(element.id, element)
      if (element.type === 'image' && (!element.imageAssetId || !assetIds.has(element.imageAssetId))) {
        return false
      }
    }

    const parentByChild = new Map<string, string>()
    for (const element of page.elements) {
      if (element.type !== 'group') continue
      const uniqueChildren = new Set(element.childIds ?? [])
      if (uniqueChildren.size !== (element.childIds?.length ?? 0)) return false
      for (const childId of uniqueChildren) {
        if (childId === element.id || !elementById.has(childId) || parentByChild.has(childId)) return false
        parentByChild.set(childId, element.id)
      }
    }

    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (visited.has(id)) return true
      if (visiting.has(id)) return false
      visiting.add(id)
      const element = elementById.get(id)
      for (const childId of element?.type === 'group' ? element.childIds ?? [] : []) {
        if (!visit(childId)) return false
      }
      visiting.delete(id)
      visited.add(id)
      return true
    }
    for (const element of page.elements) {
      if (!visit(element.id)) return false
    }
  }
  return true
}

export function designGroupBounds(
  elements: ReadonlyArray<DesignElement>,
  childIds: ReadonlyArray<string>
): { x: number; y: number; w: number; h: number } | null {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const descendants = collectDesignDescendantIds(elements, childIds)
    .map((id) => byId.get(id))
    .filter((element): element is DesignElement => Boolean(element && element.type !== 'group'))
  if (descendants.length === 0) return null
  const left = Math.min(...descendants.map((element) => element.x))
  const top = Math.min(...descendants.map((element) => element.y))
  const right = Math.max(...descendants.map((element) => element.x + element.w))
  const bottom = Math.max(...descendants.map((element) => element.y + element.h))
  return { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
}

export function collectDesignDescendantIds(
  elements: ReadonlyArray<DesignElement>,
  roots: ReadonlyArray<string>
): string[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const collected: string[] = []
  const seen = new Set<string>()
  const visit = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const element = byId.get(id)
    if (!element) return
    collected.push(id)
    if (element.type === 'group') {
      for (const childId of element.childIds ?? []) visit(childId)
    }
  }
  for (const root of roots) visit(root)
  return collected
}

/** 深复制页面并重写 group childIds，避免副本继续引用源页元素。 */
export function duplicateDesignPage(sourcePage: DesignPage): DesignPage {
  const idMap = new Map(sourcePage.elements.map((element) => [element.id, generateDesignElementId()]))
  const elements = sourcePage.elements.map((element) => ({
    ...structuredClone(element),
    id: idMap.get(element.id)!,
    ...(element.type === 'group'
      ? { childIds: (element.childIds ?? []).map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)) }
      : {})
  }))
  return {
    ...structuredClone(sourcePage),
    id: generateDesignPageId(),
    name: `${sourcePage.name} copy`,
    elements
  }
}
