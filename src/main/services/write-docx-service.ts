import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type IRunOptions
} from 'docx'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { imageSize } from 'image-size'
import { resolveWriteMarkdownResource } from '../../shared/write-markdown-resource'
import {
  type ExportElementStyle,
  type ExportElementType,
  type ExportStyleTemplate
} from '../../shared/write-export-templates'
import {
  elementStyleToParagraphOptions,
  elementStyleToRunOptions,
  pageLayoutToSectionMargin,
  resolveExportTemplate
} from './write-docx-styles'

type InlineToken = {
  type: string
  tag?: string
  content: string
  children?: InlineToken[]
  attrGet?: (name: string) => string | null
}

type MarkdownToken = InlineToken & {
  nesting?: number
  map?: [number, number]
  markup?: string
  info?: string
}

type ImageInfo = {
  data: Buffer
  width: number
  height: number
  extension: 'png' | 'jpg' | 'gif' | 'bmp'
}

type TableCellSpec = {
  header: boolean
  children: any[]
}

type InlineState = {
  bold: boolean
  italics: boolean
  strike: boolean
  underline: boolean
  link: { href: string; children: any[] } | null
}

type ListState = {
  type: 'bullet' | 'ordered'
  level: number
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false
})

const CODE_COLORS: Record<string, string> = {
  'hljs-keyword': 'D73A49',
  'hljs-built_in': '005CC5',
  'hljs-type': 'D73A49',
  'hljs-literal': '005CC5',
  'hljs-string': '032F62',
  'hljs-regexp': '032F62',
  'hljs-symbol': '005CC5',
  'hljs-comment': '6A737D',
  'hljs-title': '6F42C1',
  'hljs-function': '6F42C1',
  'hljs-attr': '22863A',
  'hljs-attribute': '22863A',
  'hljs-number': '005CC5',
  'hljs-meta': 'D73A49',
  'hljs-tag': '22863A',
  'hljs-name': '22863A',
  default: '24292E'
}

function isCjk(char: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)
}

type WriteDocxRenderContext = {
  template: ExportStyleTemplate
  inlineElementType: ExportElementType
}

/**
 * 每次导出都有独立的异步上下文。这样多个窗口或任务并发导出不同模板时，
 * 深层的 Markdown/图片异步解析不会读到另一份模板。
 */
const writeDocxRenderContext = new AsyncLocalStorage<WriteDocxRenderContext>()

function templateStyle(elementType: ExportElementType): ExportElementStyle | undefined {
  return writeDocxRenderContext.getStore()?.template.styles[elementType]
}

function currentInlineElementType(): ExportElementType {
  return writeDocxRenderContext.getStore()?.inlineElementType ?? 'p'
}

/**
 * 构造一个 TextRun。若提供了 elementType 且模板上下文存在，
 * 字体/字号/颜色从模板读取；否则回退到 0.3.0 硬编码默认值。
 * options 中的同名字段会覆盖模板值（用于行内代码、链接等特殊着色）。
 */
function textRun(
  text: string,
  options: Partial<IRunOptions> = {},
  elementType?: ExportElementType
): TextRun {
  const style = elementType ? templateStyle(elementType) : undefined
  const templateRunOpts = style ? elementStyleToRunOptions(style) : undefined
  return new TextRun({
    text,
    font: templateRunOpts?.font ?? {
      ascii: 'Calibri',
      hAnsi: 'Calibri',
      eastAsia: 'Microsoft YaHei',
      hint: 'eastAsia'
    },
    size: templateRunOpts?.size ?? 22,
    color: templateRunOpts?.color ?? '111827',
    bold: templateRunOpts?.bold,
    italics: templateRunOpts?.italics,
    ...options
  })
}

/**
 * 构造一个 Paragraph。若提供了 elementType 且模板上下文存在，
 * spacing/alignment/indent 从模板读取；否则回退到 0.3.0 硬编码默认值。
 */
function paragraph(
  children: any[],
  options: Record<string, unknown> = {},
  elementType?: ExportElementType
): Paragraph {
  const style = elementType ? templateStyle(elementType) : undefined
  const templateParaOpts = style ? elementStyleToParagraphOptions(style) : undefined
  return new Paragraph({
    spacing: templateParaOpts?.spacing ?? { before: 80, after: 160, line: 360, lineRule: 'auto' },
    alignment: templateParaOpts?.alignment,
    indent: templateParaOpts?.indent,
    children: children.length > 0 ? children : [textRun('')],
    ...options
  })
}

function resolveLocalImagePath(src: string, sourcePath: string): string | null {
  if (!src.trim()) return null
  if (/^https?:\/\//i.test(src) || /^data:/i.test(src)) return null

  const resolved = resolveWriteMarkdownResource(src, sourcePath)
  if (resolved?.startsWith('file:')) {
    try {
      return fileURLToPath(resolved)
    } catch {
      return null
    }
  }

  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    decoded = src
  }
  const candidate = isAbsolute(decoded) ? decoded : join(dirname(sourcePath), decoded)
  return normalize(candidate)
}

async function loadImage(src: string, sourcePath: string): Promise<ImageInfo | null> {
  const path = resolveLocalImagePath(src, sourcePath)
  if (!path || !existsSync(path)) return null

  const extension = extname(path).toLowerCase().replace(/^\./, '')
  if (!['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(extension)) return null

  try {
    const data = await readFile(path)
    const size = imageSize(data)
    const width = Math.max(1, Number(size.width ?? 0) || 400)
    const height = Math.max(1, Number(size.height ?? 0) || 300)
    return {
      data,
      width,
      height,
      extension: extension === 'jpeg' ? 'jpg' : (extension as ImageInfo['extension'])
    }
  } catch {
    return null
  }
}

function scaledImageSize(image: ImageInfo): { width: number; height: number } {
  const maxWidth = 560
  if (image.width <= maxWidth) return { width: image.width, height: image.height }
  const ratio = maxWidth / image.width
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(image.height * ratio))
  }
}

function previousTextChar(tokens: InlineToken[], index: number): string | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const token = tokens[i]
    if (token.type === 'text' || token.type === 'code_inline') {
      return token.content ? token.content[token.content.length - 1] : null
    }
    if (token.type === 'image' || token.type === 'hardbreak') return null
  }
  return null
}

function nextTextChar(tokens: InlineToken[], index: number): string | null {
  for (let i = index + 1; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type === 'text' || token.type === 'code_inline') {
      return token.content ? token.content[0] : null
    }
    if (token.type === 'image' || token.type === 'hardbreak') return null
  }
  return null
}

async function parseInlineTokens(tokens: InlineToken[], sourcePath: string): Promise<any[]> {
  const output: any[] = []
  let buffer = ''
  const state: InlineState = {
    bold: false,
    italics: false,
    strike: false,
    underline: false,
    link: null
  }

  const push = (child: any): void => {
    if (state.link) {
      state.link.children.push(child)
    } else {
      output.push(child)
    }
  }

  const flush = (): void => {
    if (!buffer) return
    // 普通文本：用当前 inline 元素上下文（正文='p'，表格内='table'）读取字体/字号/颜色。
    // 注意：非链接时不传 color 字段（而非传 undefined），否则 ...options 展开时
    // undefined 会覆盖 textRun 里从模板读取的 color 值。
    push(textRun(buffer, {
      bold: state.bold,
      italics: state.italics,
      strike: state.strike,
      underline: state.underline
        ? { type: UnderlineType.SINGLE, color: '111827' }
        : state.link
          ? { type: UnderlineType.SINGLE, color: '0F62FE' }
          : undefined,
      // 链接强制蓝色；非链接不传 color，让模板颜色生效
      ...(state.link ? { color: '0F62FE' } : {})
    }, currentInlineElementType()))
    buffer = ''
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type === 'text') {
      buffer += token.content
    } else if (token.type === 'strong_open') {
      flush()
      state.bold = true
    } else if (token.type === 'strong_close') {
      flush()
      state.bold = false
    } else if (token.type === 'em_open') {
      flush()
      state.italics = true
    } else if (token.type === 'em_close') {
      flush()
      state.italics = false
    } else if (token.type === 's_open') {
      flush()
      state.strike = true
    } else if (token.type === 's_close') {
      flush()
      state.strike = false
    } else if (token.type === 'html_inline') {
      if (/<u\b/i.test(token.content)) {
        flush()
        state.underline = true
      }
      if (/<\/u>/i.test(token.content)) {
        flush()
        state.underline = false
      }
    } else if (token.type === 'code_inline') {
      flush()
      // 行内代码：从模板的 code 元素读取字体，保留灰底着色
      const codeStyle = templateStyle('code')
      const codeRunOpts = codeStyle ? elementStyleToRunOptions(codeStyle) : undefined
      push(textRun(token.content, {
        font: codeRunOpts?.font ?? {
          ascii: 'Consolas',
          hAnsi: 'Consolas',
          eastAsia: 'Microsoft YaHei',
          hint: 'eastAsia'
        },
        size: codeRunOpts?.size ?? 20,
        color: codeRunOpts?.color ?? '111827',
        shading: { type: ShadingType.CLEAR, fill: 'EEF2F7', color: 'auto' }
      }))
    } else if (token.type === 'link_open') {
      flush()
      state.link = { href: token.attrGet?.('href') ?? '', children: [] }
    } else if (token.type === 'link_close') {
      flush()
      if (state.link) {
        const href = state.link.href.trim()
        if (/^(https?:|mailto:)/i.test(href)) {
          output.push(new ExternalHyperlink({ link: href, children: state.link.children }))
        } else {
          output.push(...state.link.children)
        }
        state.link = null
      }
    } else if (token.type === 'image') {
      flush()
      const src = token.attrGet?.('src') ?? ''
      const alt = token.content || basename(src) || 'Image'
      const image = await loadImage(src, sourcePath)
      if (image) {
        const transformation = scaledImageSize(image)
        push(
          new ImageRun({
            type: image.extension,
            data: image.data,
            transformation,
            altText: { title: alt, description: alt, name: alt }
          })
        )
      } else {
        push(textRun(`[Image: ${alt}]`, { italics: true, color: '9B1C1C' }))
      }
    } else if (token.type === 'softbreak') {
      const prev = previousTextChar(tokens, i)
      const next = nextTextChar(tokens, i)
      buffer += prev && next && isCjk(prev) && isCjk(next) ? '' : ' '
    } else if (token.type === 'hardbreak') {
      flush()
      push(new TextRun({ break: 1 }))
    } else if (token.children?.length) {
      flush()
      const nested = await parseInlineTokens(token.children, sourcePath)
      nested.forEach(push)
    }
  }

  flush()
  return output
}

function codeColor(className: string): string {
  for (const cls of className.split(/\s+/)) {
    if (CODE_COLORS[cls]) return CODE_COLORS[cls]
  }
  return CODE_COLORS.default
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function highlightedCodeRuns(code: string, language: string): TextRun[] {
  let html = ''
  try {
    html = language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language }).value
      : hljs.highlightAuto(code).value
  } catch {
    html = code
  }

  // 代码块字体从模板 code 元素读取（颜色保留语法高亮色表，与模板正交）
  const codeStyle = templateStyle('code')
  const codeRunOpts = codeStyle ? elementStyleToRunOptions(codeStyle) : undefined
  const codeFont = codeRunOpts?.font ?? { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Microsoft YaHei', hint: 'eastAsia' as const }
  const codeSize = codeRunOpts?.size ?? 19

  const runs: TextRun[] = []
  const pattern = /<span class="([^"]+)">([\s\S]*?)<\/span>|([^<]+)/g
  for (const match of html.matchAll(pattern)) {
    const color = match[1] ? codeColor(match[1]) : CODE_COLORS.default
    const text = decodeHtmlEntities(match[2] ?? match[3] ?? '')
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      if (line) {
        runs.push(textRun(line, {
          font: codeFont,
          size: codeSize,
          color,
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' }
        }))
      }
      if (index < lines.length - 1) {
        runs.push(new TextRun({ break: 1 }))
      }
    })
  }

  return runs.length > 0 ? runs : [textRun(code, { font: codeFont, size: codeSize })]
}

async function parseTable(tokens: MarkdownToken[], startIndex: number, sourcePath: string): Promise<{
  table: Table
  nextIndex: number
}> {
  const context = writeDocxRenderContext.getStore()
  if (!context) return parseTableInner(tokens, startIndex, sourcePath)
  return writeDocxRenderContext.run(
    { ...context, inlineElementType: 'table' },
    () => parseTableInner(tokens, startIndex, sourcePath)
  )
}

async function parseTableInner(tokens: MarkdownToken[], startIndex: number, sourcePath: string): Promise<{
  table: Table
  nextIndex: number
}> {
  const rows: TableRow[] = []
  const rowCells: TableCellSpec[][] = []
  let maxCellCount = 0
  let i = startIndex + 1
  let currentCells: TableCellSpec[] = []

  while (i < tokens.length && tokens[i].type !== 'table_close') {
    const token = tokens[i]
    if (token.type === 'tr_open') {
      currentCells = []
      i += 1
      continue
    }
    if (token.type === 'tr_close') {
      if (currentCells.length > 0) {
        rowCells.push(currentCells)
        maxCellCount = Math.max(maxCellCount, currentCells.length)
      }
      i += 1
      continue
    }
    if (token.type === 'th_open' || token.type === 'td_open') {
      const header = token.type === 'th_open'
      const closeType = header ? 'th_close' : 'td_close'
      let inlineToken: MarkdownToken | null = null
      let cursor = i + 1
      while (cursor < tokens.length && tokens[cursor].type !== closeType) {
        if (tokens[cursor].type === 'inline') inlineToken = tokens[cursor]
        cursor += 1
      }
      const cellChildren = inlineToken?.children
        ? await parseInlineTokens(inlineToken.children, sourcePath)
        : []
      currentCells.push({ header, children: cellChildren })
      i = cursor + 1
      continue
    }
    i += 1
  }

  const cellWidth = 100 / Math.max(1, maxCellCount)
  const tableStyle = templateStyle('table')
  const tableParagraphOptions = tableStyle
    ? elementStyleToParagraphOptions(tableStyle)
    : undefined
  rowCells.forEach((cells) => {
    rows.push(
      new TableRow({
        children: cells.map((cell) => (
          new TableCell({
            width: { size: cellWidth, type: WidthType.PERCENTAGE },
            shading: cell.header ? { type: ShadingType.CLEAR, fill: 'F3F6FA', color: 'auto' } : undefined,
            margins: { top: 90, bottom: 90, left: 120, right: 120 },
            children: [
              // 表格单元格：从模板 table 元素读取字体/字号/行距
              paragraph(cell.children, {
                alignment: cell.header
                  ? AlignmentType.CENTER
                  : (tableParagraphOptions?.alignment ?? AlignmentType.LEFT),
                spacing: tableParagraphOptions?.spacing ??
                  { before: 0, after: 0, line: 300, lineRule: 'auto' },
                indent: tableParagraphOptions?.indent
              }, 'table')
            ]
          })
        ))
      })
    )
  })

  return {
    table: new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
      }
    }),
    nextIndex: i + 1
  }
}

function headingLevel(tag = 'h1'): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (tag === 'h2') return HeadingLevel.HEADING_2
  if (tag === 'h3') return HeadingLevel.HEADING_3
  if (tag === 'h4') return HeadingLevel.HEADING_4
  if (tag === 'h5') return HeadingLevel.HEADING_5
  if (tag === 'h6') return HeadingLevel.HEADING_6
  return HeadingLevel.HEADING_1
}

/**
 * 把 heading tag 映射到模板元素类型。h4-h6 回退到 h3 的样式
 * （模板只配置 H1/H2/H3 三级标题样式）。
 */
function headingElementType(tag = 'h1'): ExportElementType {
  if (tag === 'h1') return 'h1'
  if (tag === 'h2') return 'h2'
  return 'h3'
}

function headingSize(tag = 'h1'): number {
  if (tag === 'h1') return 34
  if (tag === 'h2') return 29
  if (tag === 'h3') return 25
  return 22
}

function inlinePlainText(token: MarkdownToken | undefined): string {
  if (!token) return ''
  if (token.children?.length) {
    return token.children
      .map((child) => {
        if (child.type === 'image') return child.content || child.attrGet?.('alt') || ''
        if (child.children?.length) return child.children.map((nested) => nested.content).join('')
        return child.content
      })
      .join('')
  }
  return token.content
}

function preprocessMarkdown(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

export async function buildDocxFromMarkdown(options: {
  sourcePath: string
  content: string
  title?: string
  /**
   * 导出模板。若提供，标题/正文/表格/代码块的字体、字号、颜色、行距、缩进、
   * 对齐和页边距均由模板驱动；缺省时回退到 0.3.0 硬编码默认值（向后兼容）。
   */
  template?: ExportStyleTemplate
}): Promise<Buffer> {
  return writeDocxRenderContext.run(
    {
      template: options.template ?? resolveExportTemplate(undefined),
      inlineElementType: 'p'
    },
    () => buildDocxFromMarkdownInner(options)
  )
}

async function buildDocxFromMarkdownInner(options: {
  sourcePath: string
  content: string
  title?: string
}): Promise<Buffer> {
  const tokens = md.parse(preprocessMarkdown(options.content), {}) as MarkdownToken[]
  const children: Array<Paragraph | Table> = []
  const listStack: ListState[] = []
  let blockquoteDepth = 0

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type === 'heading_open') {
      const inlineToken = tokens[i + 1]
      const headingType = headingElementType(token.tag)
      const headingStyle = templateStyle(headingType)
      const headingRunOpts = headingStyle ? elementStyleToRunOptions(headingStyle) : undefined
      const headingParaOpts = headingStyle ? elementStyleToParagraphOptions(headingStyle) : undefined
      children.push(
        paragraph([textRun(inlinePlainText(inlineToken), {
          size: headingRunOpts?.size ?? headingSize(token.tag),
          bold: headingRunOpts?.bold ?? true,
          color: headingRunOpts?.color ?? '0F172A',
          font: headingRunOpts?.font
        }, headingType)], {
          heading: headingLevel(token.tag),
          spacing: headingParaOpts?.spacing ?? { before: token.tag === 'h1' ? 200 : 160, after: 120, line: 300, lineRule: 'auto' },
          alignment: headingParaOpts?.alignment,
          indent: headingParaOpts?.indent
        }, headingType)
      )
      i += 2
      continue
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      listStack.push({
        type: token.type === 'ordered_list_open' ? 'ordered' : 'bullet',
        level: Math.min(listStack.length, 8)
      })
      continue
    }
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listStack.pop()
      continue
    }
    if (token.type === 'blockquote_open') {
      blockquoteDepth += 1
      continue
    }
    if (token.type === 'blockquote_close') {
      blockquoteDepth = Math.max(0, blockquoteDepth - 1)
      continue
    }

    if (token.type === 'paragraph_open') {
      const inlineToken = tokens[i + 1]
      const runs = inlineToken?.children
        ? await parseInlineTokens(inlineToken.children, options.sourcePath)
        : [textRun(inlineToken?.content ?? '', {}, 'p')]
      const currentList = listStack[listStack.length - 1]
      // 正文段落：字体/字号/颜色由模板 p 元素驱动（通过 paragraph 工厂的 elementType 参数）。
      // 列表项和引用块保留各自的紧凑 spacing / 缩进 / 边框，覆盖模板的段落属性。
      const paraStyle = templateStyle('p')
      const paraOpts = paraStyle ? elementStyleToParagraphOptions(paraStyle) : undefined
      const inListOrQuote = Boolean(currentList) || blockquoteDepth > 0
      children.push(
        paragraph(runs, {
          numbering: currentList
            ? {
                reference: currentList.type === 'ordered' ? 'workwise-ordered' : 'workwise-bullet',
                level: currentList.level
              }
            : undefined,
          indent: blockquoteDepth > 0
            ? { left: 360 * blockquoteDepth }
            : (inListOrQuote ? undefined : paraOpts?.indent),
          border:
            blockquoteDepth > 0
              ? { left: { style: BorderStyle.SINGLE, size: 8, color: 'C7D2FE', space: 8 } }
              : undefined,
          shading:
            blockquoteDepth > 0
              ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' }
              : undefined,
          alignment: inListOrQuote ? undefined : paraOpts?.alignment,
          spacing: currentList
            ? { before: 0, after: 80, line: 330, lineRule: 'auto' }
            : (blockquoteDepth > 0
                ? { before: 60, after: 140, line: 360, lineRule: 'auto' }
                : (paraOpts?.spacing ?? { before: 60, after: 140, line: 360, lineRule: 'auto' }))
        }, 'p')
      )
      i += 2
      continue
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      const language = (token.info ?? '').trim().split(/\s+/)[0] ?? ''
      // 代码块：字体由模板 code 元素驱动（在 highlightedCodeRuns 内部已处理），
      // 段落 spacing/indent 也从 code 元素读取，保留灰底和边框装饰。
      const codeParaStyle = templateStyle('code')
      const codeParaOpts = codeParaStyle ? elementStyleToParagraphOptions(codeParaStyle) : undefined
      children.push(
        paragraph(highlightedCodeRuns(token.content.replace(/\n$/, ''), language), {
          border: {
            top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            left: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            right: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' }
          },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
          spacing: codeParaOpts?.spacing ?? { before: 140, after: 180, line: 280, lineRule: 'auto' },
          indent: codeParaOpts?.indent,
          alignment: codeParaOpts?.alignment
        }, 'code')
      )
      continue
    }

    if (token.type === 'table_open') {
      const result = await parseTable(tokens, i, options.sourcePath)
      children.push(result.table)
      i = result.nextIndex - 1
      continue
    }

    if (token.type === 'hr') {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' } },
          spacing: { before: 180, after: 180 }
        })
      )
    }
  }

  const doc = new Document({
    creator: 'WorkWise',
    title: options.title || basename(options.sourcePath),
    numbering: {
      config: [
        {
          reference: 'workwise-bullet',
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT },
            { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT },
            { level: 2, format: LevelFormat.BULLET, text: '\u25AA', alignment: AlignmentType.LEFT }
          ]
        },
        {
          reference: 'workwise-ordered',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT },
            { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.LEFT }
          ]
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            // 页边距从模板 pageLayout 读取（缺省 1440 twip = 1 inch，向后兼容）
            margin: pageLayoutToSectionMargin(
              (writeDocxRenderContext.getStore()?.template ?? resolveExportTemplate(undefined)).pageLayout
            )
          }
        },
        children: children.length > 0 ? children : [paragraph([textRun('', {}, 'p')], {}, 'p')]
      }
    ]
  })

  return Packer.toBuffer(doc)
}
