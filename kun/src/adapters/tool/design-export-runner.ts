/**
 * Design 导出运行器（kun 进程侧）。
 *
 * kun 的 design_export_pptx 工具调用此模块。
 * 与 main 进程的 design-export-service 不同——这个在 kun 的 Node 进程里运行，
 * 直接调 svg_to_pptx.py。
 */
import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const EXPORT_TIMEOUT_MS = 5 * 60 * 1000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024

function resolvePptMasterScript(): string | null {
  const candidates = [
    process.env.WORKWISE_PPT_MASTER_ROOT?.trim(),
    join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master'),
    // 打包后 kun 可能从 app.asar 运行
    resolve(process.cwd(), '..', 'src', 'asset', 'skills', 'ppt-master')
  ].filter(Boolean) as string[]
  for (const root of candidates) {
    const scriptPath = join(root, 'scripts', 'svg_to_pptx.py')
    if (existsSync(scriptPath)) return scriptPath
  }
  return null
}

function resolvePythonCommand(): string {
  return process.env.WORKWISE_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3')
}

/**
 * 把 SVG 文件（或含多 SVG 的目录）转为 PPTX。
 *
 * @param sourcePath 单个 .svg 文件或含 .svg 文件的目录
 * @param outputPath 输出 .pptx 路径
 */
export async function exportDesignSvgToPptx(sourcePath: string, outputPath: string): Promise<void> {
  const scriptPath = resolvePptMasterScript()
  if (!scriptPath) {
    throw new Error('PPT Master scripts not found')
  }

  const tempProject = await mkdtemp(join(tmpdir(), 'kun-design-export-'))
  const svgOutputDir = join(tempProject, 'svg_output')
  await mkdir(svgOutputDir, { recursive: true })

  try {
    // 复制 SVG 文件到 svg_output/
    if (statSync(sourcePath).isDirectory()) {
      const svgFiles = (await readdir(sourcePath))
        .filter((f) => f.toLowerCase().endsWith('.svg'))
        .sort()
      for (let i = 0; i < svgFiles.length; i++) {
        const content = await readFile(join(sourcePath, svgFiles[i]), 'utf8')
        const padded = String(i + 1).padStart(2, '0')
        await writeFile(join(svgOutputDir, `slide_${padded}.svg`), content, 'utf8')
      }
    } else {
      // 单个文件
      const content = await readFile(sourcePath, 'utf8')
      await writeFile(join(svgOutputDir, 'slide_01.svg'), content, 'utf8')
    }

    // 确保输出目录存在
    const outDir = dirname(outputPath)
    await mkdir(outDir, { recursive: true })

    // 调 svg_to_pptx.py
    const pythonCmd = resolvePythonCommand()
    await runSvgToPptx(scriptPath, tempProject, outputPath, pythonCmd)

    // 校验产出
    if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
      throw new Error('Export completed but output file is empty')
    }
  } finally {
    await rm(tempProject, { recursive: true, force: true }).catch(() => undefined)
  }
}

function runSvgToPptx(
  scriptPath: string,
  projectPath: string,
  outputPath: string,
  pythonCmd: string
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(pythonCmd, [
      scriptPath,
      projectPath,
      '--output', outputPath,
      '--source', 'output',
      '--only', 'native',
      '--quiet'
    ], {
      cwd: projectPath,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: EXPORT_TIMEOUT_MS
    }, (error, _stdout, stderr) => {
      if (!error) {
        resolvePromise()
        return
      }
      reject(new Error(stderr.trim() || error.message))
    })
    child.on('error', (err) => {
      reject(new Error(`Python execution failed: ${err.message}`))
    })
  })
}
