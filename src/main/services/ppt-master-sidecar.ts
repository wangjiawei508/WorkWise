import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { arch as hostArch } from 'node:os'
import { join } from 'node:path'
import { safeSpawn } from './safe-spawn'

const MAX_PROTOCOL_BYTES = 2 * 1024 * 1024
const MAX_ERROR_BYTES = 64 * 1024

export type PptMasterSidecarOperation =
  | 'ppt-master-list-presets'
  | 'ppt-master-render-preset'
  | 'ppt-master-import-pptx'
  | 'ppt-master-export-pptx'

export type PptMasterSidecarRequest = {
  operation: PptMasterSidecarOperation
  workspaceRoot: string
  inputPath?: string
  outputDirectory?: string
  projectPath?: string
  outputPath?: string
  source?: 'output' | 'final'
  format?: 'ppt169' | 'ppt43'
  presetName?: string
  frame?: [number, number, number, number]
  fill?: string
}

export type PptMasterSidecarResponse = {
  ok: boolean
  operation?: PptMasterSidecarOperation
  stdout?: string
  outputDirectory?: string
  outputPath?: string
  warnings?: string[]
  durationMs?: number
  code?: string
  message?: string
}

export function resolvePptMasterSidecarExecutable(input?: {
  resourcesPath?: string
  developmentRoot?: string
  platform?: NodeJS.Platform
  arch?: string
}): string {
  const override = process.env.WORKWISE_PPT_MASTER_SIDECAR?.trim()
  if (override) return override
  const platform = input?.platform ?? process.platform
  const architecture = input?.arch ?? hostArch()
  const executable = platform === 'win32' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
  const resourcesPath = input?.resourcesPath ?? process.resourcesPath ?? ''
  const packaged = join(
    resourcesPath,
    'app.asar.unpacked',
    'sidecars',
    'markitdown',
    executable
  )
  if (resourcesPath && existsSync(packaged)) return packaged
  return join(
    input?.developmentRoot ?? process.cwd(),
    'build',
    'sidecars',
    `markitdown-${platform}-${architecture}`,
    'workwise-markitdown',
    executable
  )
}

export function isPptMasterSidecarAvailable(): boolean {
  return existsSync(resolvePptMasterSidecarExecutable())
}

export async function runPptMasterSidecar(
  request: PptMasterSidecarRequest,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<PptMasterSidecarResponse> {
  const executable = resolvePptMasterSidecarExecutable()
  if (!existsSync(executable)) {
    throw new Error('The bundled PPT Master runtime is unavailable.')
  }
  let child: ChildProcess | undefined
  let timeout: NodeJS.Timeout | undefined
  let protocolBytes = 0
  let errorBytes = 0
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  const abort = (): void => {
    if (!child?.pid) return
    if (process.platform === 'win32') {
      void safeSpawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f']).catch(() => child?.kill())
      return
    }
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    child = await safeSpawn(executable, [], {
      cwd: request.workspaceRoot,
      workspaceRoot: request.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TMPDIR: process.env.TMPDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        HOME: process.env.HOME
      }
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      protocolBytes += chunk.byteLength
      if (protocolBytes <= MAX_PROTOCOL_BYTES) stdout.push(chunk)
      else abort()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      errorBytes += chunk.byteLength
      if (errorBytes <= MAX_ERROR_BYTES) stderr.push(chunk)
    })
    child.stdin?.end(JSON.stringify(request))
    timeout = setTimeout(abort, options.timeoutMs ?? 5 * 60 * 1000)
    if (options.signal?.aborted) abort()
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child?.once('error', reject)
      child?.once('exit', resolve)
    })
    if (options.signal?.aborted) throw new Error('PPT Master operation was cancelled.')
    if (protocolBytes > MAX_PROTOCOL_BYTES) {
      throw new Error('PPT Master response exceeded the 2 MiB limit.')
    }
    const text = Buffer.concat(stdout).toString('utf8').trim()
    let response: PptMasterSidecarResponse
    try {
      response = JSON.parse(text) as PptMasterSidecarResponse
    } catch {
      const detail = Buffer.concat(stderr).toString('utf8').trim().slice(0, 500)
      throw new Error(`PPT Master runtime exited with ${exitCode ?? 'unknown'}${detail ? `: ${detail}` : ''}`)
    }
    if (exitCode !== 0 || !response.ok) {
      throw new Error(response.message || 'PPT Master operation failed.')
    }
    return response
  } finally {
    if (timeout) clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}
