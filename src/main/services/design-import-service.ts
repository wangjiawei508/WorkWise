import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseSvgStringsToDocument } from '../../shared/design-svg-parser'
import type { DesignDocumentV1 } from '../../shared/design-document'
import type { DesignFidelityWarning } from '../../shared/design-workspace'
import { resolvePptMasterScript } from './design-ppt-master-paths'

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

/**
 * 导入 PPTX 为 DesignDocument。
 *
 * 1. 创建临时目录
 * 2. 调 pptx_to_svg.py 转换（--inheritance-mode flat，自包含）
 * 3. 读 svg/ 目录下所有 slide_NN.svg
 * 4. 用 parseSvgStringsToDocument 解析
 */
export async function importPptxToDesign(pptxPath: string): Promise<DesignImportResult> {
  const scriptPath = resolvePptMasterScript('pptx_to_svg.py')
  if (!scriptPath) {
    return { ok: false, message: 'PPT Master scripts not found.' }
  }
  if (!existsSync(pptxPath)) {
    return { ok: false, message: `File not found: ${pptxPath}` }
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'workwise-design-import-'))

  try {
    // 1. 调 pptx_to_svg.py
    const pythonCmd = resolvePythonCommand()
    await runPptxToSvg(scriptPath, pptxPath, tempDir, pythonCmd)

    // 2. 读 SVG 文件（flat 模式输出到 svg/ 目录）
    const svgDir = join(tempDir, 'svg')
    if (!existsSync(svgDir)) {
      return { ok: false, message: 'Import completed but no SVG output found.' }
    }

    const svgFiles = (await readdir(svgDir))
      .filter((name) => name.toLowerCase().endsWith('.svg') && name.startsWith('slide_'))
      .sort() // slide_01, slide_02...

    if (svgFiles.length === 0) {
      return { ok: false, message: 'No slides found in PPTX.' }
    }

    // 3. 读取每个 SVG
    const svgStrings: string[] = []
    for (const file of svgFiles) {
      const content = await readFile(join(svgDir, file), 'utf8')
      svgStrings.push(content)
    }

    // 4. 读取可安全保留的图片，并为解析器建立 href → asset id 映射。
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

    // 5. 解析为 DesignDocument；图片使用临时 asset id，IPC 层存入工作区后再重映射。
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
