import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import JSZip from 'jszip'
import MarkdownIt from 'markdown-it'
import type { DocumentParsingMode, WorkspacePreviewResultV1 } from '../../shared/agent-workbench'
import { resolveContainedPath } from './canonical-containment'
import { DocumentEngineService } from './document-engine-service'
import { analyzePdfDocument } from './pdf-document-service'
import { inspectOfficeArchive } from './office-archive-security'

const MAX_PREVIEW_BYTES = 200 * 1024 * 1024
const MAX_INLINE_BYTES = 20 * 1024 * 1024
const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024
const MAX_SPREADSHEET_PREVIEW_ROWS = 100
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export class WorkspacePreviewService {
  constructor(private readonly documents: DocumentEngineService) {}

  async preview(request: {
    workspaceRoot: string
    relativePath: string
    parsingMode?: DocumentParsingMode
    idempotencyKey: string
  }): Promise<WorkspacePreviewResultV1> {
    const path = await resolveContainedPath({
      root: request.workspaceRoot,
      target: request.relativePath,
      mustExist: true,
      expect: 'file',
      rejectFinalLink: true
    })
    const info = await stat(path)
    if (info.size > MAX_PREVIEW_BYTES) throw Object.assign(new Error('File exceeds the 200 MiB preview limit.'), { code: 'resource_limit' })
    const extension = extname(path).toLowerCase()
    if (IMAGE_TYPES[extension]) {
      if (info.size > MAX_INLINE_BYTES) return metadata(path, info.size, IMAGE_TYPES[extension], 'Image is too large for an inline preview.')
      return {
        kind: 'image',
        mediaType: IMAGE_TYPES[extension],
        dataUrl: `data:${IMAGE_TYPES[extension]};base64,${(await readFile(path)).toString('base64')}`,
        sizeBytes: info.size
      }
    }
    if (extension === '.svg') {
      if (info.size > MAX_INLINE_BYTES) return metadata(path, info.size, 'image/svg+xml', 'SVG is too large for an inline preview.')
      return { kind: 'svg', sanitizedSvg: sanitizeSvg(await readFile(path, 'utf8')), sizeBytes: info.size }
    }
    if (extension === '.md' || extension === '.markdown' || extension === '.txt') {
      if (info.size > MAX_MARKDOWN_BYTES) return metadata(path, info.size, 'text/plain', 'Document is too large for rich Markdown preview.')
      const source = await readFile(path, 'utf8')
      const html = new MarkdownIt({ html: false, linkify: false, typographer: false }).render(source)
      return { kind: 'markdown', html, source, sizeBytes: info.size }
    }
    if (extension === '.pdf') {
      try {
        const analysis = await analyzePdfDocument(path)
        return {
          kind: 'pdf',
          relativePath: request.relativePath,
          pageCount: analysis.pageCount,
          searchable: analysis.searchable,
          pageTexts: analysis.pages,
          ...(info.size <= MAX_INLINE_BYTES
            ? { dataUrl: `data:application/pdf;base64,${(await readFile(path)).toString('base64')}` }
            : {}),
          truncated: analysis.truncated,
          warnings: analysis.warnings,
          sizeBytes: info.size
        }
      } catch (error) {
        return metadata(
          path,
          info.size,
          'application/pdf',
          error instanceof Error ? error.message : 'The PDF could not be read.'
        )
      }
    }
    if (extension === '.docx' || extension === '.pptx' || extension === '.xlsx') {
      const structure = await officeStructure(path, extension)
      const parsed = await this.documents.parse({
        parseId: `preview_${randomUUID()}`,
        workspaceRoot: request.workspaceRoot,
        relativePath: request.relativePath,
        mode: request.parsingMode ?? 'fast',
        idempotencyKey: request.idempotencyKey
      })
      const spreadsheetPreview = extension === '.xlsx'
        ? normalizeSpreadsheetPreviewMarkdown(parsed.markdown)
        : null
      return {
        kind: 'office',
        format: extension.slice(1) as 'docx' | 'pptx' | 'xlsx',
        markdown: spreadsheetPreview?.markdown ?? parsed.markdown,
        ...(structure.pageCount !== undefined ? { pageCount: structure.pageCount } : {}),
        ...(structure.sheetNames ? { sheetNames: structure.sheetNames } : {}),
        warnings: [
          ...parsed.warnings,
          ...(spreadsheetPreview?.compacted
            ? ['已隐藏空单元格，并将稀疏工作表压缩为便于阅读的内容行。']
            : []),
          ...(spreadsheetPreview?.truncated
            ? [`预览最多显示 ${MAX_SPREADSHEET_PREVIEW_ROWS} 行；完整内容仍保留在原工作簿中。`]
            : [])
        ],
        sizeBytes: info.size
      }
    }
    return metadata(path, info.size, undefined, 'Preview is unavailable for this file type; open it in the system application.')
  }
}

type SpreadsheetPreviewNormalization = {
  markdown: string
  compacted: boolean
  truncated: boolean
}

function splitMarkdownRow(line: string): string[] {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let cell = ''
  let escaped = false
  for (const character of source) {
    if (escaped) {
      cell += character
      escaped = false
    } else if (character === '\\') {
      cell += character
      escaped = true
    } else if (character === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell.trim())
  return cells
}

function isMarkdownSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isEmptySpreadsheetCell(cell: string, header: boolean): boolean {
  const normalized = cell.trim()
  return !normalized || /^nan$/i.test(normalized) || (header && /^unnamed:\s*\d+$/i.test(normalized))
}

function escapeMarkdownCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

function normalizeTableBlock(lines: string[]): SpreadsheetPreviewNormalization {
  const rows = lines.map(splitMarkdownRow)
  const contentRows = rows.filter((cells) => !isMarkdownSeparator(cells))
  const width = Math.max(0, ...contentRows.map((cells) => cells.length))
  const totalCells = Math.max(1, contentRows.length * Math.max(1, width))
  const emptyCells = contentRows.reduce(
    (sum, cells, rowIndex) => sum + Array.from({ length: width }, (_, index) =>
      isEmptySpreadsheetCell(cells[index] ?? '', rowIndex === 0) ? 1 : 0
    ).reduce<number>((rowSum, value) => rowSum + value, 0),
    0
  )
  const compacted = width > 12 || emptyCells / totalCells > 0.45

  if (!compacted) {
    const cleaned = rows.map((cells, rowIndex) => {
      if (isMarkdownSeparator(cells)) return `| ${cells.join(' | ')} |`
      return `| ${cells.map((cell) => isEmptySpreadsheetCell(cell, rowIndex === 0) ? '' : cell).join(' | ')} |`
    })
    return { markdown: cleaned.join('\n'), compacted: false, truncated: false }
  }

  const meaningful = contentRows
    .map((cells, rowIndex) => cells.filter((cell) => !isEmptySpreadsheetCell(cell, rowIndex === 0)))
    .filter((cells) => cells.length > 0)
  const truncated = meaningful.length > MAX_SPREADSHEET_PREVIEW_ROWS
  const visible = meaningful.slice(0, MAX_SPREADSHEET_PREVIEW_ROWS)
  return {
    markdown: [
      '| 行 | 内容 |',
      '| --- | --- |',
      ...visible.map((cells, index) =>
        `| ${index + 1} | ${escapeMarkdownCell(cells.join(' · '))} |`
      )
    ].join('\n'),
    compacted: true,
    truncated
  }
}

export function normalizeSpreadsheetPreviewMarkdown(markdown: string): SpreadsheetPreviewNormalization {
  const lines = markdown.split(/\r?\n/)
  const output: string[] = []
  let compacted = false
  let truncated = false

  for (let index = 0; index < lines.length;) {
    if (!/^\s*\|.*\|\s*$/.test(lines[index])) {
      output.push(lines[index])
      index += 1
      continue
    }
    const block: string[] = []
    while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
      block.push(lines[index])
      index += 1
    }
    const normalized = normalizeTableBlock(block)
    output.push(normalized.markdown)
    compacted ||= normalized.compacted
    truncated ||= normalized.truncated
  }

  return { markdown: output.join('\n'), compacted, truncated }
}

function metadata(path: string, sizeBytes: number, mediaType: string | undefined, message: string): WorkspacePreviewResultV1 {
  return { kind: 'metadata', name: path.split(/[\\/]/).pop() || path, ...(mediaType ? { mediaType } : {}), sizeBytes, message }
}

export function sanitizeSvg(source: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Object.assign(new Error('SVG entities and doctypes are not allowed.'), { code: 'unsafe_file' })
  return source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])\s*(?:https?:|file:|javascript:|data:text\/html)[\s\S]*?\1/gi, '')
}

async function officeStructure(path: string, extension: string): Promise<{ pageCount?: number; sheetNames?: string[] }> {
  const contents = await readFile(path)
  inspectOfficeArchive(contents)
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(contents, { createFolders: false })
  } catch {
    throw Object.assign(new Error('Office file is not a valid OOXML archive.'), { code: 'invalid_document' })
  }
  const names = Object.keys(zip.files)
  if (extension === '.pptx') {
    if (!zip.file('[Content_Types].xml') || !zip.file('ppt/presentation.xml')) throw new Error('PPTX is missing required presentation parts.')
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    if (slides.length === 0) throw new Error('PPTX contains no slides.')
    return { pageCount: slides.length }
  }
  if (extension === '.docx') {
    const document = zip.file('word/document.xml')
    if (!zip.file('[Content_Types].xml') || !document) throw new Error('DOCX is missing required document parts.')
    const xml = await document.async('string')
    if (!/<w:body[\s>]/.test(xml)) throw new Error('DOCX has no valid document body.')
    return {}
  }
  const workbook = zip.file('xl/workbook.xml')
  if (!zip.file('[Content_Types].xml') || !workbook) throw new Error('XLSX is missing required workbook parts.')
  const xml = await workbook.async('string')
  const sheetNames = [...xml.matchAll(/<sheet\b[^>]*\bname=(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => decodeXml(match[1] ?? match[2] ?? ''))
    .slice(0, 256)
  if (sheetNames.length === 0) throw new Error('XLSX contains no worksheets.')
  return { sheetNames }
}

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
