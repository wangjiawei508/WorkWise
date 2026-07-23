import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  type FileHandle
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseSvgStringsToDocument } from '../../shared/design-svg-parser'
import type { DesignDocumentV1 } from '../../shared/design-document'
import type { DesignFidelityWarning } from '../../shared/design-workspace'
import { resolvePptMasterScript } from './design-ppt-master-paths'
import {
  isPptMasterSidecarAvailable,
  runPptMasterSidecar
} from './ppt-master-sidecar'

/**
 * Design 工作区导入服务（main 进程）。
 *
 * 把 .pptx 文件通过 PPT Master 的 pptx_to_svg.py 转为 SVG，
 * 再用 design-svg-parser 解析为 DesignDocumentV1。
 *
 * 复用 ppt-master-tool-provider 的 execFile + 超时模式
 * （✅ 已核实 ppt-master-tool-provider.ts:244-276）。
 */

const IMPORT_TIMEOUT_MS = 3 * 60 * 1000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const MAX_IMPORTED_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_IMPORTED_IMAGE_TOTAL_BYTES = 48 * 1024 * 1024
const MAX_IMPORTED_IMAGES = 64
const MAX_IMPORTED_SVG_BYTES = 16 * 1024 * 1024
const MAX_IMPORTED_SVG_TOTAL_BYTES = 256 * 1024 * 1024
const ZIP_EOCD_MIN_BYTES = 22
const ZIP_MAX_COMMENT_BYTES = 65_535
const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_LOCAL_SIGNATURE = 0x04034b50

export const PPTX_IMPORT_LIMITS = Object.freeze({
  sourceBytes: 200 * 1024 * 1024,
  entries: 4_096,
  centralDirectoryBytes: 16 * 1024 * 1024,
  uncompressedBytes: 512 * 1024 * 1024,
  entryBytes: 128 * 1024 * 1024,
  xmlBytes: 16 * 1024 * 1024,
  compressionRatio: 200,
  slides: 500
})

export type PptxImportPreflightResult = {
  sourceBytes: number
  entryCount: number
  slideCount: number
  compressedBytes: number
  uncompressedBytes: number
}

type PptxCentralEntry = {
  name: string
  flags: number
  method: number
  compressedBytes: number
  uncompressedBytes: number
  localHeaderOffset: number
}

export type ImportedDesignImage = {
  provisionalId: string
  filename: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  bytes: Uint8Array
}

export type DesignImportResult =
  | {
      ok: true
      document: DesignDocumentV1
      images: ImportedDesignImage[]
      warnings: DesignFidelityWarning[]
    }
  | { ok: false; message: string }

function resolvePythonCommand(): string {
  return process.env.WORKWISE_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3')
}

function pptxLimitError(message: string): Error {
  return new Error(`unsafe_pptx: ${message}`)
}

async function readFileRange(
  handle: FileHandle,
  length: number,
  position: number
): Promise<Buffer> {
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(position) || position < 0) {
    throw pptxLimitError('the ZIP contains an invalid byte range')
  }
  const buffer = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const result = await handle.read(buffer, offset, length - offset, position + offset)
    if (result.bytesRead === 0) throw pptxLimitError('the ZIP is truncated')
    offset += result.bytesRead
  }
  return buffer
}

function findEndOfCentralDirectory(tail: Buffer, tailOffset: number, sourceBytes: number): number {
  for (let offset = tail.length - ZIP_EOCD_MIN_BYTES; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== ZIP_EOCD_SIGNATURE) continue
    const commentBytes = tail.readUInt16LE(offset + 20)
    const absoluteOffset = tailOffset + offset
    if (absoluteOffset + ZIP_EOCD_MIN_BYTES + commentBytes === sourceBytes) {
      return offset
    }
  }
  throw pptxLimitError('the file is not a complete PPTX ZIP archive')
}

function decodeZipEntryName(bytes: Buffer): string {
  const name = bytes.toString('utf8')
  if (!name || name.includes('\u0000') || name.includes('\ufffd')) {
    throw pptxLimitError('the ZIP contains an invalid entry name')
  }
  const normalized = name.replace(/\\/g, '/')
  if (
    normalized !== name ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw pptxLimitError('the ZIP contains an unsafe entry path')
  }
  return normalized
}

function isXmlPptxEntry(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.xml') || lower.endsWith('.rels')
}

function parsePptxCentralDirectory(
  centralDirectory: Buffer,
  entryCount: number,
  centralDirectoryOffset: number,
  sourceBytes: number
): {
  entries: PptxCentralEntry[]
  slideCount: number
  compressedBytes: number
  uncompressedBytes: number
} {
  const entries: PptxCentralEntry[] = []
  const names = new Set<string>()
  let cursor = 0
  let slideCount = 0
  let compressedBytes = 0
  let uncompressedBytes = 0

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralDirectory.length) {
      throw pptxLimitError('the ZIP central directory is truncated')
    }
    if (centralDirectory.readUInt32LE(cursor) !== ZIP_CENTRAL_SIGNATURE) {
      throw pptxLimitError('the ZIP central directory is malformed')
    }

    const flags = centralDirectory.readUInt16LE(cursor + 8)
    const method = centralDirectory.readUInt16LE(cursor + 10)
    const entryCompressedBytes = centralDirectory.readUInt32LE(cursor + 20)
    const entryUncompressedBytes = centralDirectory.readUInt32LE(cursor + 24)
    const nameBytes = centralDirectory.readUInt16LE(cursor + 28)
    const extraBytes = centralDirectory.readUInt16LE(cursor + 30)
    const commentBytes = centralDirectory.readUInt16LE(cursor + 32)
    const diskNumber = centralDirectory.readUInt16LE(cursor + 34)
    const localHeaderOffset = centralDirectory.readUInt32LE(cursor + 42)
    const recordBytes = 46 + nameBytes + extraBytes + commentBytes

    if (cursor + recordBytes > centralDirectory.length) {
      throw pptxLimitError('the ZIP central directory entry is truncated')
    }
    if (
      entryCompressedBytes === 0xffffffff ||
      entryUncompressedBytes === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      diskNumber === 0xffff
    ) {
      throw pptxLimitError('ZIP64 PPTX files are not supported')
    }
    if (diskNumber !== 0) throw pptxLimitError('multi-disk PPTX files are not supported')
    if ((flags & 0x1) !== 0) throw pptxLimitError('encrypted PPTX entries are not supported')
    if (method !== 0 && method !== 8) {
      throw pptxLimitError(`unsupported ZIP compression method ${method}`)
    }

    const name = decodeZipEntryName(
      centralDirectory.subarray(cursor + 46, cursor + 46 + nameBytes)
    )
    const normalizedName = name.toLowerCase()
    if (names.has(normalizedName)) {
      throw pptxLimitError('the ZIP contains duplicate entry paths')
    }
    names.add(normalizedName)

    if (localHeaderOffset >= centralDirectoryOffset) {
      throw pptxLimitError('a ZIP entry points outside the file data area')
    }
    if (entryUncompressedBytes > PPTX_IMPORT_LIMITS.entryBytes) {
      throw pptxLimitError('a ZIP entry exceeds the 128 MiB limit')
    }
    if (isXmlPptxEntry(name) && entryUncompressedBytes > PPTX_IMPORT_LIMITS.xmlBytes) {
      throw pptxLimitError('an OOXML part exceeds the 16 MiB XML limit')
    }
    if (
      entryUncompressedBytes > 1024 * 1024 &&
      entryUncompressedBytes / Math.max(entryCompressedBytes, 1) >
        PPTX_IMPORT_LIMITS.compressionRatio
    ) {
      throw pptxLimitError('a ZIP entry exceeds the allowed compression ratio')
    }

    compressedBytes += entryCompressedBytes
    uncompressedBytes += entryUncompressedBytes
    if (!Number.isSafeInteger(compressedBytes) || !Number.isSafeInteger(uncompressedBytes)) {
      throw pptxLimitError('the ZIP size totals are invalid')
    }
    if (uncompressedBytes > PPTX_IMPORT_LIMITS.uncompressedBytes) {
      throw pptxLimitError('the PPTX exceeds the 512 MiB uncompressed limit')
    }
    if (/^ppt\/slides\/slide[1-9][0-9]*\.xml$/i.test(name)) {
      slideCount += 1
      if (slideCount > PPTX_IMPORT_LIMITS.slides) {
        throw pptxLimitError(`the PPTX exceeds ${PPTX_IMPORT_LIMITS.slides} slides`)
      }
    }

    entries.push({
      name,
      flags,
      method,
      compressedBytes: entryCompressedBytes,
      uncompressedBytes: entryUncompressedBytes,
      localHeaderOffset
    })
    cursor += recordBytes
  }

  if (cursor !== centralDirectory.length) {
    throw pptxLimitError('the ZIP central directory contains unexpected trailing data')
  }
  if (compressedBytes > sourceBytes) {
    throw pptxLimitError('the ZIP declares more compressed data than the source file contains')
  }
  if (
    uncompressedBytes > 16 * 1024 * 1024 &&
    uncompressedBytes / Math.max(compressedBytes, 1) > PPTX_IMPORT_LIMITS.compressionRatio
  ) {
    throw pptxLimitError('the PPTX exceeds the allowed total compression ratio')
  }
  if (!names.has('[content_types].xml') || !names.has('ppt/presentation.xml')) {
    throw pptxLimitError('the ZIP is missing required PowerPoint parts')
  }
  if (slideCount === 0) throw pptxLimitError('the PPTX contains no slides')

  return { entries, slideCount, compressedBytes, uncompressedBytes }
}

async function verifyPptxLocalHeaders(
  handle: FileHandle,
  entries: readonly PptxCentralEntry[],
  centralDirectoryOffset: number
): Promise<void> {
  for (const entry of entries) {
    const header = await readFileRange(handle, 30, entry.localHeaderOffset)
    if (header.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) {
      throw pptxLimitError('a ZIP local header is malformed')
    }
    const flags = header.readUInt16LE(6)
    const method = header.readUInt16LE(8)
    const nameBytes = header.readUInt16LE(26)
    const extraBytes = header.readUInt16LE(28)
    const dataOffset = entry.localHeaderOffset + 30 + nameBytes + extraBytes
    const dataEnd = dataOffset + entry.compressedBytes
    if (
      flags !== entry.flags ||
      method !== entry.method ||
      !Number.isSafeInteger(dataEnd) ||
      dataEnd > centralDirectoryOffset
    ) {
      throw pptxLimitError('a ZIP local header does not match its central directory entry')
    }
    const localName = decodeZipEntryName(
      await readFileRange(handle, nameBytes, entry.localHeaderOffset + 30)
    )
    if (localName !== entry.name) {
      throw pptxLimitError('a ZIP local entry name does not match its central directory entry')
    }
  }
}

/**
 * 在启动 Python/sidecar 前对 PPTX 的 ZIP 目录做有界预检。
 * 这里只读取文件尾、中央目录与短本地头，不解压任何 entry。
 */
export async function preflightPptxForDesignImport(
  pptxPath: string
): Promise<PptxImportPreflightResult> {
  const info = await lstat(pptxPath)
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.size < ZIP_EOCD_MIN_BYTES ||
    info.size > PPTX_IMPORT_LIMITS.sourceBytes
  ) {
    throw pptxLimitError('the source must be a regular PPTX file between 22 bytes and 200 MiB')
  }

  const handle = await open(pptxPath, 'r')
  try {
    const tailBytes = Math.min(
      info.size,
      ZIP_EOCD_MIN_BYTES + ZIP_MAX_COMMENT_BYTES
    )
    const tailOffset = info.size - tailBytes
    const tail = await readFileRange(handle, tailBytes, tailOffset)
    const eocdOffsetInTail = findEndOfCentralDirectory(tail, tailOffset, info.size)
    const eocd = tail.subarray(eocdOffsetInTail)
    const diskNumber = eocd.readUInt16LE(4)
    const centralDiskNumber = eocd.readUInt16LE(6)
    const diskEntries = eocd.readUInt16LE(8)
    const entryCount = eocd.readUInt16LE(10)
    const centralDirectoryBytes = eocd.readUInt32LE(12)
    const centralDirectoryOffset = eocd.readUInt32LE(16)
    const absoluteEocdOffset = tailOffset + eocdOffsetInTail

    if (
      diskNumber === 0xffff ||
      centralDiskNumber === 0xffff ||
      diskEntries === 0xffff ||
      entryCount === 0xffff ||
      centralDirectoryBytes === 0xffffffff ||
      centralDirectoryOffset === 0xffffffff
    ) {
      throw pptxLimitError('ZIP64 PPTX files are not supported')
    }
    if (diskNumber !== 0 || centralDiskNumber !== 0 || diskEntries !== entryCount) {
      throw pptxLimitError('multi-disk PPTX files are not supported')
    }
    if (entryCount === 0 || entryCount > PPTX_IMPORT_LIMITS.entries) {
      throw pptxLimitError(`the PPTX must contain between 1 and ${PPTX_IMPORT_LIMITS.entries} entries`)
    }
    if (centralDirectoryBytes > PPTX_IMPORT_LIMITS.centralDirectoryBytes) {
      throw pptxLimitError('the ZIP central directory exceeds 16 MiB')
    }
    if (
      !Number.isSafeInteger(centralDirectoryOffset + centralDirectoryBytes) ||
      centralDirectoryOffset + centralDirectoryBytes !== absoluteEocdOffset
    ) {
      throw pptxLimitError('the ZIP central directory range is invalid')
    }

    const centralDirectory = await readFileRange(
      handle,
      centralDirectoryBytes,
      centralDirectoryOffset
    )
    const parsed = parsePptxCentralDirectory(
      centralDirectory,
      entryCount,
      centralDirectoryOffset,
      info.size
    )
    await verifyPptxLocalHeaders(handle, parsed.entries, centralDirectoryOffset)
    return {
      sourceBytes: info.size,
      entryCount,
      slideCount: parsed.slideCount,
      compressedBytes: parsed.compressedBytes,
      uncompressedBytes: parsed.uncompressedBytes
    }
  } finally {
    await handle.close()
  }
}

/**
 * 导入 PPTX 为 DesignDocument。
 *
 * 1. 创建临时目录
 * 2. 调 pptx_to_svg.py 转换（--inheritance-mode flat，自包含）
 * 3. 读 svg/ 目录下所有 slide_NN.svg
 * 4. 用 parseSvgStringsToDocument 解析
 */
export async function importPptxToDesign(pptxPath: string): Promise<DesignImportResult> {
  if (!existsSync(pptxPath)) {
    return { ok: false, message: `File not found: ${pptxPath}` }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'workwise-design-import-'))
  const stagedPptxPath = join(tempDir, 'source.pptx')
  const conversionDirectory = join(tempDir, 'converted')

  try {
    // 1. 只把普通且大小有界的源文件复制到隔离目录；随后解析固定副本的 ZIP
    //    元数据。这样 preflight 与 Python/sidecar 使用的是同一份不可变输入。
    const sourceInfo = await lstat(pptxPath)
    if (
      sourceInfo.isSymbolicLink() ||
      !sourceInfo.isFile() ||
      sourceInfo.size <= 0 ||
      sourceInfo.size > PPTX_IMPORT_LIMITS.sourceBytes
    ) {
      throw pptxLimitError('the source is not a safe regular file under 200 MiB')
    }
    await copyFile(pptxPath, stagedPptxPath)
    const preflight = await preflightPptxForDesignImport(stagedPptxPath)
    await mkdir(conversionDirectory, { recursive: true })

    // 2. 正式包只使用随客户端分发的受限 sidecar。系统 Python 仅保留给
    //    开发模式，避免已安装客户端受主机 Python/依赖环境影响。
    if (isPptMasterSidecarAvailable()) {
      await runPptMasterSidecar({
        operation: 'ppt-master-import-pptx',
        workspaceRoot: tempDir,
        inputPath: stagedPptxPath,
        outputDirectory: conversionDirectory
      }, { timeoutMs: IMPORT_TIMEOUT_MS })
    } else {
      const developmentFallbackAllowed =
        process.env.NODE_ENV !== 'production' || process.defaultApp === true
      if (!developmentFallbackAllowed) {
        throw new Error('The bundled PPT Master runtime is unavailable.')
      }
      const scriptPath = resolvePptMasterScript('pptx_to_svg.py')
      if (!scriptPath) {
        throw new Error('PPT Master scripts not found.')
      }
      await runPptxToSvg(
        scriptPath,
        stagedPptxPath,
        conversionDirectory,
        resolvePythonCommand()
      )
    }

    // 3. 读 SVG 文件（flat 模式输出到 svg/ 目录）
    const svgDir = join(conversionDirectory, 'svg')
    if (!existsSync(svgDir)) {
      return { ok: false, message: 'Import completed but no SVG output found.' }
    }

    const svgFiles = (await readdir(svgDir))
      .filter((name) => name.toLowerCase().endsWith('.svg') && name.startsWith('slide_'))
      .sort() // slide_01, slide_02...

    if (svgFiles.length === 0) {
      return { ok: false, message: 'No slides found in PPTX.' }
    }
    if (svgFiles.length > preflight.slideCount || svgFiles.length > PPTX_IMPORT_LIMITS.slides) {
      throw new Error('PPT Master produced more SVG pages than the validated PPTX contains.')
    }

    // 4. 读取每个 SVG；sidecar 输出仍按不可信转换结果处理。
    const svgStrings: string[] = []
    let svgBytes = 0
    for (const file of svgFiles) {
      const svgPath = join(svgDir, file)
      const svgInfo = await lstat(svgPath)
      if (
        svgInfo.isSymbolicLink() ||
        !svgInfo.isFile() ||
        svgInfo.size <= 0 ||
        svgInfo.size > MAX_IMPORTED_SVG_BYTES ||
        svgBytes + svgInfo.size > MAX_IMPORTED_SVG_TOTAL_BYTES
      ) {
        throw new Error('PPT Master produced an unsafe or oversized SVG page.')
      }
      svgBytes += svgInfo.size
      const content = await readFile(svgPath, 'utf8')
      svgStrings.push(content)
    }

    // 5. 读取可安全保留的图片，并为解析器建立 href → asset id 映射。
    const importedImages: ImportedDesignImage[] = []
    const imageAssetIds = new Map<string, string>()
    const warnings: DesignFidelityWarning[] = []
    let imageBytes = 0
    for (let pageIndex = 0; pageIndex < svgStrings.length; pageIndex += 1) {
      const svg = svgStrings[pageIndex]
      warnings.push(...inspectDesignSvgFidelity(svg, pageIndex))
      for (const href of imageHrefs(svg)) {
        const key = `${pageIndex}:${href}`
        if (imageAssetIds.has(key)) continue
        if (importedImages.length >= MAX_IMPORTED_IMAGES) {
          warnings.push({
            code: 'missing_image',
            pageId: `page-${pageIndex + 1}`,
            message: `Page ${pageIndex + 1} contains more than ${MAX_IMPORTED_IMAGES} images; additional images were omitted.`
          })
          continue
        }
        try {
          const image = await readImportedDesignImage(
            href,
            dirname(join(svgDir, svgFiles[pageIndex])),
            tempDir
          )
          if (imageBytes + image.bytes.byteLength > MAX_IMPORTED_IMAGE_TOTAL_BYTES) {
            throw new Error('the imported image total exceeds 48 MiB')
          }
          imageBytes += image.bytes.byteLength
          const provisionalId = `asset_import_${pageIndex}_${importedImages.length}`
          imageAssetIds.set(key, provisionalId)
          importedImages.push({ provisionalId, ...image })
        } catch (error) {
          warnings.push({
            code: 'missing_image',
            pageId: `page-${pageIndex + 1}`,
            message: `An image on page ${pageIndex + 1} was omitted: ${
              error instanceof Error ? error.message : String(error)
            }.`
          })
        }
      }
    }

    // 6. 解析为 DesignDocument；图片使用临时 asset id，IPC 层存入工作区后再重映射。
    const name = basename(pptxPath, '.pptx')
    const document = parseSvgStringsToDocument(svgStrings, name, {
      imageAssetIdForHref: (href, pageIndex) => imageAssetIds.get(`${pageIndex}:${href}`)
    })

    return { ok: true, document, images: importedImages, warnings: dedupeWarnings(warnings) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `design_import_failed: ${message}` }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function imageHrefs(svg: string): string[] {
  const hrefs: string[] = []
  for (const match of svg.matchAll(/<image\b([^>]*)\/?>/gi)) {
    const attributes = match[1] ?? ''
    const href = attributes.match(/\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
    const value = href?.[1] ?? href?.[2]
    if (value) hrefs.push(value)
  }
  return [...new Set(hrefs)]
}

export function inspectDesignSvgFidelity(
  svg: string,
  pageIndex: number
): DesignFidelityWarning[] {
  const warnings: DesignFidelityWarning[] = []
  const pageId = `page-${pageIndex + 1}`
  if (/<(?:filter|fe[A-Za-z]+)\b/i.test(svg)) {
    warnings.push({
      code: 'unsupported_filter',
      pageId,
      message: `Page ${pageIndex + 1} contains SVG filters that cannot be edited in Design.`
    })
  }
  if (/<mask\b|mask\s*=/i.test(svg)) {
    warnings.push({
      code: 'unsupported_mask',
      pageId,
      message: `Page ${pageIndex + 1} contains masks that cannot be edited in Design.`
    })
  }
  if (/<g\b/i.test(svg)) {
    warnings.push({
      code: 'flattened_group',
      pageId,
      message: `Page ${pageIndex + 1} contains source groups; supported child elements were flattened in source order.`
    })
  }
  if (/transform\s*=\s*["'][^"']*(?:matrix|translate|scale|skew)[^(]*\(/i.test(svg)) {
    warnings.push({
      code: 'layout_approximation',
      pageId,
      message: `Page ${pageIndex + 1} contains complex transforms; layout may be approximate.`
    })
  }
  return warnings
}

function dedupeWarnings(warnings: DesignFidelityWarning[]): DesignFidelityWarning[] {
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.pageId ?? ''}:${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function readImportedDesignImage(
  href: string,
  svgDirectory: string,
  importRoot: string
): Promise<{
  filename: string
  mimeType: ImportedDesignImage['mimeType']
  bytes: Uint8Array
}> {
  if (href.startsWith('data:')) {
    const match = href.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/)
    if (!match) throw new Error('unsupported embedded image encoding')
    const bytes = Buffer.from(match[2], 'base64')
    assertImageBytes(bytes, match[1])
    return {
      filename: `embedded.${extensionForMime(match[1])}`,
      mimeType: match[1] as ImportedDesignImage['mimeType'],
      bytes
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || isAbsolute(href) || href.includes('\u0000')) {
    throw new Error('external or absolute image references are not allowed')
  }
  const sourcePath = resolve(svgDirectory, href)
  const root = resolve(importRoot)
  const rel = relative(root, sourcePath)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('image reference escapes the import directory')
  }
  const info = await lstat(sourcePath)
  if (info.isSymbolicLink() || !info.isFile() || info.size <= 0 || info.size > MAX_IMPORTED_IMAGE_BYTES) {
    throw new Error('image is not a safe regular file under 12 MiB')
  }
  const bytes = await readFile(sourcePath)
  const mimeType = mimeFromExtension(sourcePath)
  if (!mimeType) throw new Error('unsupported image format')
  assertImageBytes(bytes, mimeType)
  return { filename: basename(sourcePath), mimeType, bytes }
}

function mimeFromExtension(path: string): ImportedDesignImage['mimeType'] | null {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    default: return null
  }
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  return mimeType.slice('image/'.length)
}

function assertImageBytes(bytes: Uint8Array, mimeType: string): void {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMPORTED_IMAGE_BYTES) {
    throw new Error('image is empty or exceeds 12 MiB')
  }
  const header = Buffer.from(bytes.subarray(0, 12))
  const matches =
    mimeType === 'image/png'
      ? header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === 'image/jpeg'
        ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
        : mimeType === 'image/gif'
          ? ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString('ascii'))
          : mimeType === 'image/webp'
            ? header.subarray(0, 4).toString('ascii') === 'RIFF' &&
              header.subarray(8, 12).toString('ascii') === 'WEBP'
            : false
  if (!matches) throw new Error('image signature does not match its format')
}

/** 执行 pptx_to_svg.py */
function runPptxToSvg(
  scriptPath: string,
  pptxPath: string,
  outputDir: string,
  pythonCmd: string
): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const args = [
      scriptPath,
      pptxPath,
      '-o', outputDir,
      '--inheritance-mode', 'flat'
    ]
    const child = execFile(pythonCmd, args, {
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: IMPORT_TIMEOUT_MS
    }, (error, _stdout, stderr) => {
      if (!error) {
        resolvePromise()
        return
      }
      const detail = stderr.trim() || error.message
      reject(new Error(detail))
    })
    child.on('error', (err) => {
      reject(new Error(`Python execution failed: ${err.message}`))
    })
  })
}
