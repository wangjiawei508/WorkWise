import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { safeSpawn } from './safe-spawn'
import type {
  PptMasterPythonEnvEnsureResult,
  PptMasterPythonEnvProgress,
  PptMasterPythonEnvStatus
} from '../../shared/ppt-master-services'
import { resolveBundledSkillDirectory } from './skill-service'

export function resolveManagedPythonPath(platform: NodeJS.Platform = process.platform): string {
  const override = process.env.WORKWISE_PPT_MASTER_PYTHON?.trim()
  if (override) return override
  return join(
    homedir(),
    '.workwise',
    'ppt-master-python',
    platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  )
}

export function resolvePptMasterRequirementsPath(): string {
  const skillRoot =
    process.env.WORKWISE_PPT_MASTER_ROOT?.trim() ||
    resolveBundledSkillDirectory('ppt-master') ||
    join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master')
  return join(skillRoot, 'requirements.txt')
}

export function getPptMasterPythonEnvStatus(): PptMasterPythonEnvStatus {
  const pythonPath = resolveManagedPythonPath()
  return {
    exists: existsSync(pythonPath),
    pythonPath,
    venvRoot: join(homedir(), '.workwise', 'ppt-master-python'),
    requirementsPath: resolvePptMasterRequirementsPath()
  }
}

export type PptMasterPythonEnvRunner = (
  command: string,
  args: string[],
  onLine: (line: string) => void
) => Promise<number | null>

const defaultRunner: PptMasterPythonEnvRunner = async (command, args, onLine) => {
  const child: ChildProcess = await safeSpawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' }
  })
  let buffer = ''
  const emit = (chunk: Buffer): void => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) onLine(trimmed)
    }
  }
  child.stdout?.on('data', emit)
  child.stderr?.on('data', emit)
  return await new Promise<number | null>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      const tail = buffer.trim()
      if (tail) onLine(tail)
      resolvePromise(code)
    })
  })
}

let ensureInFlight: Promise<PptMasterPythonEnvEnsureResult> | null = null

export async function ensurePptMasterPythonEnv(options: {
  onProgress?: (progress: PptMasterPythonEnvProgress) => void
  run?: PptMasterPythonEnvRunner
} = {}): Promise<PptMasterPythonEnvEnsureResult> {
  const onProgress = options.onProgress ?? ((): void => undefined)
  const run = options.run ?? defaultRunner
  const pythonPath = resolveManagedPythonPath()
  const venvRoot = join(homedir(), '.workwise', 'ppt-master-python')
  const requirementsPath = resolvePptMasterRequirementsPath()

  if (existsSync(pythonPath)) {
    onProgress({ phase: 'done', message: `已就绪：${pythonPath}` })
    return { ok: true, pythonPath, message: 'PPT Master Python 环境已存在。' }
  }

  if (ensureInFlight) return ensureInFlight

  ensureInFlight = (async () => {
    try {
      onProgress({ phase: 'venv', message: `创建虚拟环境：${venvRoot}` })
      const venvCommand = process.platform === 'win32' ? 'py' : 'python3'
      const venvCode = await run(venvCommand, ['-m', 'venv', venvRoot], (line) =>
        onProgress({ phase: 'venv', message: line })
      )
      if (venvCode !== 0) {
        throw new Error(`创建虚拟环境失败（exit ${venvCode}）`)
      }
      if (!existsSync(pythonPath)) {
        throw new Error('虚拟环境已创建但未找到 python 解释器')
      }

      onProgress({ phase: 'install', message: `安装依赖：${requirementsPath}` })
      const installCode = await run(
        pythonPath,
        ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirementsPath],
        (line) => onProgress({ phase: 'install', message: line })
      )
      if (installCode !== 0) {
        throw new Error(`安装依赖失败（exit ${installCode}）`)
      }
      onProgress({ phase: 'done', message: `环境就绪：${pythonPath}` })
      return { ok: true, pythonPath, message: 'PPT Master Python 环境已准备好。' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onProgress({ phase: 'error', message })
      return { ok: false, pythonPath, message }
    } finally {
      ensureInFlight = null
    }
  })()
  return ensureInFlight
}

export const pptMasterPythonEnvInternals = {
  resolveManagedPythonPath,
  resolvePptMasterRequirementsPath,
  getPptMasterPythonEnvStatus,
  ensurePptMasterPythonEnv,
  defaultRunner
}
