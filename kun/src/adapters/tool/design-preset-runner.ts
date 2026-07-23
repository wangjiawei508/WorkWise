/**
 * Design 预设形状运行器（kun 进程侧）。
 *
 * kun 的 design_list_presets 工具调用此模块。
 * 直接调 preset_shape_svg.py list 获取形状名列表。
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  runRuntimePptMasterSidecar,
  runtimePptMasterSidecarAvailable
} from './ppt-master-sidecar-runner.js'

const TIMEOUT_MS = 15 * 1000
const MAX_OUTPUT_BYTES = 256 * 1024

function resolveScriptPath(): string | null {
  const candidates = [
    process.env.WORKWISE_PPT_MASTER_ROOT?.trim(),
    join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master'),
    resolve(process.cwd(), '..', 'src', 'asset', 'skills', 'ppt-master')
  ].filter(Boolean) as string[]
  for (const root of candidates) {
    const scriptPath = join(root, 'scripts', 'preset_shape_svg.py')
    if (existsSync(scriptPath)) return scriptPath
  }
  return null
}

function resolvePythonCommand(): string {
  return process.env.WORKWISE_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3')
}

/** 列出所有可用预设形状名 */
export function listPresetShapes(): Promise<string[]> {
  const scriptPath = resolveScriptPath()
  if (!scriptPath) return Promise.resolve([])

  if (runtimePptMasterSidecarAvailable()) {
    return runRuntimePptMasterSidecar({
      operation: 'ppt-master-list-presets',
      workspaceRoot: tmpdir()
    }, { timeoutMs: TIMEOUT_MS })
      .then((response) => (response.stdout ?? '').split('\n').filter(Boolean))
      .catch(() => [])
  }

  const pythonCmd = resolvePythonCommand()
  return new Promise((resolvePromise) => {
    execFile(pythonCmd, [scriptPath, 'list'], {
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: TIMEOUT_MS
    }, (error, stdout) => {
      if (error) {
        resolvePromise([])
        return
      }
      resolvePromise(stdout.trim().split('\n').filter(Boolean))
    })
  })
}
