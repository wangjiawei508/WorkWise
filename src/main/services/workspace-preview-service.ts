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
      return {
        kind: 'office',
        format: extension.slice(1) as 'docx' | 'pptx' | 'xlsx',
        markdown: parsed.markdown,
        ...(structure.pageCount !== undefined ? { pageCount: structure.pageCount } : {}),
        ...(structure.sheetNames ? { sheetNames: structure.sheetNames } : {}),
        warnings: parsed.warnings,
        sizeBytes: info.size
      }
    }
    return metadata(path, info.size, undefined, 'Preview is unavailable for this file type; open it in the system application.')
  }
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
