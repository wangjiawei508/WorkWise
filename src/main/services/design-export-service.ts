import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { documentToSvgStrings } from '../../shared/design-svg-serializer'
import type { DesignDocumentV1 } from '../../shared/design-document'
import { resolvePptMasterScript } from './design-ppt-master-paths'

/**
 * Design 工作区导出服务（main 进程）。
 *
 * 把 DesignDocument 的每页序列化为 SVG → 写入临时项目目录 →
 * 调用 PPT Master 的 svg_to_pptx.py 转为原生可编辑 PPTX。
 *
 * 复用 ppt-master-tool-provider 的 execFile + 超时 + abort 模式
 * （✅ 已核实 ppt-master-tool-provider.ts:244-276）。
 */

const EXPORT_TIMEOUT_MS = 5 * 60 * 1000 // 5 分钟
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024 // 4MB stdout/stderr

export type DesignExportResult =
  | { ok: true; path: string }
  | { ok: false; message: string }

const POWERPOINT_MIN_SIDE_PX = 96
const POWERPOINT_MAX_SIDE_PX = 5_376

export function validatePowerPointCanvasSize(doc: DesignDocumentV1): string | null {
  if (doc.pages.length === 0) return 'The design has no pages to export.'
  const first = doc.pages[0]
  for (let index = 0; index < doc.pages.length; index += 1) {
    const page = doc.pages[index]
    if (
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      page.width < POWERPOINT_MIN_SIDE_PX ||
      page.height < POWERPOINT_MIN_SIDE_PX ||
      page.width > POWERPOINT_MAX_SIDE_PX ||
      page.height > POWERPOINT_MAX_SIDE_PX
    ) {
      return `Page ${index + 1} must be between ${POWERPOINT_MIN_SIDE_PX} and ${POWERPOINT_MAX_SIDE_PX} pixels per side for PowerPoint export.`
    }
    if (page.width !== first.width || page.height !== first.height) {
      return 'PowerPoint export requires every page in a design to use the same canvas size.'
    }
  }
  return null
}

export function validateDesignExportAssets(
  doc: DesignDocumentV1,
  assetDataUrls?: Readonly<Record<string, string>>
): string | null {
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex += 1) {
    for (const element of doc.pages[pageIndex].elements) {
      if (element.type !== 'image' || element.hidden) continue
      const dataUrl = element.imageAssetId ? assetDataUrls?.[element.imageAssetId] : undefined
      if (
        !dataUrl ||
        dataUrl.length > 18 * 1024 * 1024 ||
        !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(dataUrl)
      ) {
        return `Page ${pageIndex + 1} contains a missing or invalid image asset.`
      }
    }
  }
  return null
}

/** 解析 Python 命令（复用 ppt-master-tool-provider 的逻辑） */
function resolvePythonCommand(): string {
  return process.env.WORKWISE_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3')
}

/**
 * 导出 DesignDocument 为 PPTX。
 *
 * 流程：
 * 1. 每页序列化为 SVG 字符串（documentToSvgStrings）
 * 2. 写入临时目录的 svg_output/slide_NN.svg
 * 3. 调用 svg_to_pptx.py 转换
 * 4. 校验产出 .pptx
 *
 * @param doc 设计文档
 * @param outputPath 用户选择的输出路径（.pptx）
 */
export async function exportDesignToPptx(
  doc: DesignDocumentV1,
  outputPath: string,
  assetDataUrls?: Readonly<Record<string, string>>
): Promise<DesignExportResult> {
  const canvasError = validatePowerPointCanvasSize(doc)
  if (canvasError) return { ok: false, message: canvasError }
  const assetError = validateDesignExportAssets(doc, assetDataUrls)
  if (assetError) return { ok: false, message: assetError }

  const scriptPath = resolvePptMasterScript('svg_to_pptx.py')
  if (!scriptPath) {
    return { ok: false, message: 'PPT Master scripts not found. Please ensure PPT Master skill is installed.' }
  }

  // 创建临时项目目录
  const tempProject = await mkdtemp(join(tmpdir(), 'workwise-design-export-'))
  const svgOutputDir = join(tempProject, 'svg_output')
  await mkdir(svgOutputDir, { recursive: true })

  try {
    // 1. 写入每页 SVG
    const svgStrings = documentToSvgStrings(doc, { assetDataUrls })
    for (let i = 0; i < svgStrings.length; i++) {
      const padded = String(i + 1).padStart(2, '0')
      const svgPath = join(svgOutputDir, `slide_${padded}.svg`)
      await writeFile(svgPath, svgStrings[i], 'utf8')
    }

    // 2. 调用 svg_to_pptx.py
    const pythonCmd = resolvePythonCommand()
    await runSvgToPptx(scriptPath, tempProject, svgOutputDir, outputPath, pythonCmd)

    // 3. 校验产出
    if (!existsSync(outputPath)) {
      return { ok: false, message: 'Export completed but output file not found.' }
    }
    const outputInfo = await stat(outputPath)
    if (!outputInfo.isFile() || outputInfo.size < 100) {
      return { ok: false, message: 'Export completed but the PowerPoint file is empty.' }
    }
    const handle = await open(outputPath, 'r')
    try {
      const signature = Buffer.alloc(4)
      const { bytesRead } = await handle.read(signature, 0, signature.length, 0)
      if (bytesRead !== signature.length || signature[0] !== 0x50 || signature[1] !== 0x4b) {
        return { ok: false, message: 'Exported file is not a valid PowerPoint package.' }
      }
    } finally {
      await handle.close()
    }

    return { ok: true, path: outputPath }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `design_export_failed: ${message}` }
  } finally {
    // 清理临时目录
    await rm(tempProject, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** 执行 svg_to_pptx.py */
function runSvgToPptx(
  scriptPath: string,
  projectPath: string,
  _svgOutputDir: string,
  outputPath: string,
  pythonCmd: string
): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const args = [
      scriptPath,
      projectPath,
      '--output', outputPath,
      '--source', 'output',
      '--only', 'native',
      '--quiet'
    ]
    const child = execFile(pythonCmd, args, {
      cwd: projectPath,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: EXPORT_TIMEOUT_MS
    }, (error, _stdout, stderr) => {
      if (!error) {
        resolvePromise()
        return
      }
      const detail = stderr.trim() || error.message
      reject(new Error(detail))
    })
    // 超时自动 kill（execFile 的 timeout 已处理）
    child.on('error', (err) => {
      reject(new Error(`Python execution failed: ${err.message}`))
    })
  })
}
