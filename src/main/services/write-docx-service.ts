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
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { imageSize } from 'image-size'
import { resolveWriteMarkdownResource } from '../../shared/write-markdown-resource'

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

function textRun(text: string, options: Partial<IRunOptions> = {}): TextRun {
  return new TextRun({
    text,
    font: {
      ascii: 'Calibri',
      hAnsi: 'Calibri',
      eastAsia: 'Microsoft YaHei',
      hint: 'eastAsia'
    },
    size: 22,
    color: '111827',
    ...options
  })
}

function paragraph(children: any[], options: Record<string, unknown> = {}): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 160, line: 360, lineRule: 'auto' },
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
    push(textRun(buffer, {
      bold: state.bold,
      italics: state.italics,
      strike: state.strike,
      underline: state.underline
        ? { type: UnderlineType.SINGLE, color: '111827' }
        : state.link
          ? { type: UnderlineType.SINGLE, color: '0F62FE' }
          : undefined,
      color: state.link ? '0F62FE' : '111827'
    }))
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
      push(textRun(token.content, {
        font: {
          ascii: 'Consolas',
          hAnsi: 'Consolas',
          eastAsia: 'Microsoft YaHei',
          hint: 'eastAsia'
        },
        size: 20,
        color: '111827',
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

  const runs: TextRun[] = []
  const pattern = /<span class="([^"]+)">([\s\S]*?)<\/span>|([^<]+)/g
  for (const match of html.matchAll(pattern)) {
    const color = match[1] ? codeColor(match[1]) : CODE_COLORS.default
    const text = decodeHtmlEntities(match[2] ?? match[3] ?? '')
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      if (line) {
        runs.push(textRun(line, {
          font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: 'Microsoft YaHei', hint: 'eastAsia' },
          size: 19,
          color,
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' }
        }))
      }
      if (index < lines.length - 1) {
        runs.push(new TextRun({ break: 1 }))
      }
    })
  }

  return runs.length > 0 ? runs : [textRun(code, { font: { ascii: 'Consolas', hAnsi: 'Consolas' }, size: 19 })]
}

async function parseTable(tokens: MarkdownToken[], startIndex: number, sourcePath: string): Promise<{
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
  rowCells.forEach((cells) => {
    rows.push(
      new TableRow({
        children: cells.map((cell) => (
          new TableCell({
            width: { size: cellWidth, type: WidthType.PERCENTAGE },
            shading: cell.header ? { type: ShadingType.CLEAR, fill: 'F3F6FA', color: 'auto' } : undefined,
            margins: { top: 90, bottom: 90, left: 120, right: 120 },
            children: [
              paragraph(cell.children, {
                alignment: cell.header ? AlignmentType.CENTER : AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: 300, lineRule: 'auto' }
              })
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
}): Promise<Buffer> {
  const tokens = md.parse(preprocessMarkdown(options.content), {}) as MarkdownToken[]
  const children: Array<Paragraph | Table> = []
  const listStack: ListState[] = []
  let blockquoteDepth = 0

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type === 'heading_open') {
      const inlineToken = tokens[i + 1]
      children.push(
        paragraph([textRun(inlinePlainText(inlineToken), {
          size: headingSize(token.tag),
          bold: true,
          color: '0F172A'
        })], {
          heading: headingLevel(token.tag),
          spacing: { before: token.tag === 'h1' ? 200 : 160, after: 120, line: 300, lineRule: 'auto' },
        })
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
        : [textRun(inlineToken?.content ?? '')]
      const currentList = listStack[listStack.length - 1]
      children.push(
        paragraph(runs, {
          numbering: currentList
            ? {
                reference: currentList.type === 'ordered' ? 'workwise-ordered' : 'workwise-bullet',
                level: currentList.level
              }
            : undefined,
          indent: blockquoteDepth > 0 ? { left: 360 * blockquoteDepth } : undefined,
          border:
            blockquoteDepth > 0
              ? { left: { style: BorderStyle.SINGLE, size: 8, color: 'C7D2FE', space: 8 } }
              : undefined,
          shading:
            blockquoteDepth > 0
              ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' }
              : undefined,
          spacing: currentList
            ? { before: 0, after: 80, line: 330, lineRule: 'auto' }
            : { before: 60, after: 140, line: 360, lineRule: 'auto' }
        })
      )
      i += 2
      continue
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      const language = (token.info ?? '').trim().split(/\s+/)[0] ?? ''
      children.push(
        paragraph(highlightedCodeRuns(token.content.replace(/\n$/, ''), language), {
          border: {
            top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            left: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
            right: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' }
          },
          shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' },
          spacing: { before: 140, after: 180, line: 280, lineRule: 'auto' }
        })
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
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: children.length > 0 ? children : [paragraph([textRun('')])]
      }
    ]
  })

  return Packer.toBuffer(doc)
}
