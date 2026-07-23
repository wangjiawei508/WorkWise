import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolvePptMasterScript } from './design-ppt-master-paths'
import {
  isPptMasterSidecarAvailable,
  runPptMasterSidecar
} from './ppt-master-sidecar'

/**
 * Design 预设形状服务（main 进程）。
 *
 * 调用 PPT Master 的 preset_shape_svg.py 获取 187 种 DrawingML 预设形状的 SVG 片段。
 * 用于工具栏的"插入形状"功能。
 */

// The first quarantined/cold Python extension load on macOS can spend around
// 30 seconds in dyld/Gatekeeper. A shorter timeout makes the first real user
// action fail even though all later calls are fast.
const RENDER_TIMEOUT_MS = 60 * 1000
const MAX_OUTPUT_BYTES = 256 * 1024
let presetPythonQueue: Promise<void> = Promise.resolve()
let cachedPresetShapes: string[] | null = null

function resolvePythonCommand(): string {
  return process.env.WORKWISE_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3')
}

export type PresetRenderResult =
  | { ok: true; svg: string }
  | { ok: false; message: string }

function enqueuePresetPython<T>(operation: () => Promise<T>): Promise<T> {
  const result = presetPythonQueue.then(operation, operation)
  presetPythonQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function executePython(
  pythonCmd: string,
  args: string[]
): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolvePromise) => {
    execFile(pythonCmd, args, {
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: RENDER_TIMEOUT_MS
    }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ ok: false, message: stderr.trim() || error.message })
        return
      }
      resolvePromise({ ok: true, stdout: stdout.trim() })
    })
  })
}

/**
 * 渲染一个预设形状为 SVG 片段。
 *
 * @param presetName 形状名（如 'rightArrow'）
 * @param frame [x, y, w, h] 画布坐标
 * @param fill 填充色（hex 带 #，如 '#2563EB'）
 */
export function renderPresetShape(
  presetName: string,
  frame: { x: number; y: number; w: number; h: number },
  fill = '#1E3A5F'
): Promise<PresetRenderResult> {
  const scriptPath = resolvePptMasterScript('preset_shape_svg.py')
  if (!scriptPath) {
    return Promise.resolve({ ok: false, message: 'PPT Master scripts not found.' })
  }

  const pythonCmd = resolvePythonCommand()
  const args = [
    scriptPath,
    'render',
    presetName,
    '--id', `preset-${Date.now()}`,
    '--frame', String(frame.x), String(frame.y), String(frame.w), String(frame.h),
    '--fill', fill
  ]

  return enqueuePresetPython(async () => {
    if (isPptMasterSidecarAvailable()) {
      try {
        const response = await runPptMasterSidecar({
          operation: 'ppt-master-render-preset',
          workspaceRoot: tmpdir(),
          presetName,
          frame: [frame.x, frame.y, frame.w, frame.h],
          fill
        }, { timeoutMs: RENDER_TIMEOUT_MS })
        if (!response.stdout) {
          return { ok: false, message: 'PPT Master returned an empty preset shape.' }
        }
        return { ok: true, svg: response.stdout }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
    const result = await executePython(pythonCmd, args)
    return result.ok
      ? { ok: true, svg: result.stdout }
      : result
  })
}

/**
 * 列出所有可用预设形状名。
 */
export function listPresetShapes(): Promise<string[]> {
  if (cachedPresetShapes) return Promise.resolve([...cachedPresetShapes])
  const scriptPath = resolvePptMasterScript('preset_shape_svg.py')
  if (!scriptPath) return Promise.resolve([])

  const pythonCmd = resolvePythonCommand()
  return enqueuePresetPython(async () => {
    if (cachedPresetShapes) return [...cachedPresetShapes]
    if (isPptMasterSidecarAvailable()) {
      try {
        const response = await runPptMasterSidecar({
          operation: 'ppt-master-list-presets',
          workspaceRoot: tmpdir()
        }, { timeoutMs: RENDER_TIMEOUT_MS })
        cachedPresetShapes = (response.stdout ?? '').split('\n').filter(Boolean)
        return [...cachedPresetShapes]
      } catch {
        return []
      }
    }
    const result = await executePython(pythonCmd, [scriptPath, 'list'])
    if (!result.ok) return []
    cachedPresetShapes = result.stdout.split('\n').filter(Boolean)
    return [...cachedPresetShapes]
  })
}
