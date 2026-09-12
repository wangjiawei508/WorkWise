import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join } from 'node:path'
import {
  SurveyConverterManifestV1,
  SurveyConverterProvenanceV1,
  type SurveyConverterManifestV1 as SurveyConverterManifest,
  type SurveyConverterProvenanceV1 as SurveyConverterProvenance,
  type SurveyFormatIdV1,
  type SurveyImportDiagnosticV1
} from '../contracts/survey.js'

const MAX_PROTOCOL_BYTES = 1024 * 1024

export type SandboxedSurveyConverterRequest = {
  executablePath: string
  arguments: string[]
  workingDirectory: string
  outputPath: string
  timeoutMs: number
  maxOutputBytes: number
}

export type SandboxedSurveyConverterResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

export interface SandboxedSurveyConverterExecutor {
  readonly networkIsolation: 'verified-none'
  execute(request: SandboxedSurveyConverterRequest): Promise<SandboxedSurveyConverterResult>
}

export type SurveyConversionResult = {
  ok: boolean
  outputName?: string
  outputBytes?: Buffer
  outputFormat?: SurveyFormatIdV1
  provenance: SurveyConverterProvenance
  diagnostic: SurveyImportDiagnosticV1
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function diagnostic(message: string, severity: 'info' | 'blocking'): SurveyImportDiagnosticV1 {
  return { code: severity === 'info' ? 'format_detected' : 'converter_required', severity, message }
}

function boundedAppend(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8')
  return Buffer.byteLength(next, 'utf8') > MAX_PROTOCOL_BYTES ? next.slice(0, MAX_PROTOCOL_BYTES) : next
}

/**
 * macOS converter execution uses the system sandbox to deny every network
 * operation. The converter is still locally supplied or distribution-audited
 * and hash-pinned before this executor is called. No shell is involved.
 */
export class MacOsSandboxedSurveyConverterExecutor implements SandboxedSurveyConverterExecutor {
  readonly networkIsolation = 'verified-none' as const

  async execute(request: SandboxedSurveyConverterRequest): Promise<SandboxedSurveyConverterResult> {
    if (process.platform !== 'darwin') throw new Error('verified no-network survey converter execution is unavailable on this platform')
    await access('/usr/bin/sandbox-exec', constants.X_OK)
    const profile = '(version 1) (allow default) (deny network*)'
    return await new Promise<SandboxedSurveyConverterResult>((resolve, reject) => {
      const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, request.executablePath, ...request.arguments], {
        cwd: request.workingDirectory,
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      let timer: NodeJS.Timeout
      let outputMonitor: NodeJS.Timeout
      const finish = (error?: Error, result?: SandboxedSurveyConverterResult): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearInterval(outputMonitor)
        if (!child.killed && error) child.kill('SIGKILL')
        error ? reject(error) : resolve(result!)
      }
      child.stdout.on('data', (chunk: Buffer) => { stdout = boundedAppend(stdout, chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = boundedAppend(stderr, chunk) })
      child.once('error', (error) => finish(error))
      child.once('close', (exitCode) => finish(undefined, { exitCode, stdout, stderr }))
      timer = setTimeout(() => finish(new Error(`survey converter timed out after ${request.timeoutMs}ms`)), request.timeoutMs)
      outputMonitor = setInterval(() => {
        void stat(request.outputPath).then((info) => {
          if (info.size > request.maxOutputBytes) finish(new Error(`survey converter output exceeds ${request.maxOutputBytes} bytes`))
        }).catch(() => undefined)
      }, 50)
    })
  }
}

export class SurveyConverterRegistry {
  private readonly adapters = new Map<SurveyFormatIdV1, SurveyConverterManifest>()

  constructor(
    manifests: readonly SurveyConverterManifest[] = [],
    private readonly executor?: SandboxedSurveyConverterExecutor
  ) {
    for (const value of manifests) {
      const manifest = SurveyConverterManifestV1.parse(value)
      for (const format of manifest.inputFormats) {
        if (this.adapters.has(format)) throw new Error(`duplicate survey converter for ${format}`)
        this.adapters.set(format, manifest)
      }
    }
  }

  has(format: SurveyFormatIdV1): boolean {
    return this.adapters.has(format)
  }

  async convert(format: SurveyFormatIdV1, sourceName: string, bytes: Buffer): Promise<SurveyConversionResult | null> {
    const manifest = this.adapters.get(format)
    if (!manifest) return null
    const inputHash = sha256(bytes)
    let actualExecutableHash = manifest.executableHash
    let outputHash: string | undefined
    const provenance = (status: SurveyConverterProvenance['status'], outputHashValue?: string): SurveyConverterProvenance => SurveyConverterProvenanceV1.parse({
      id: manifest.id,
      version: manifest.version,
      origin: manifest.origin,
      ...(manifest.origin === 'workwise-bundled' ? { license: manifest.license } : {}),
      executableHash: actualExecutableHash,
      inputHash,
      ...(outputHashValue ? { outputHash: outputHashValue } : {}),
      networkAccess: 'none',
      arguments: manifest.arguments,
      status
    })
    const blocked = (message: string): SurveyConversionResult => ({
      ok: false,
      provenance: provenance('blocked', outputHash),
      diagnostic: diagnostic(message, 'blocking')
    })
    if (!this.executor || this.executor.networkIsolation !== 'verified-none') return blocked(`转换器 ${manifest.id} 未连接可验证的无网络执行器`)
    if (!isAbsolute(manifest.executablePath)) return blocked(`转换器 ${manifest.id} 的可执行文件路径不是绝对路径`)
    try {
      await access(manifest.executablePath, constants.X_OK)
      const executableBytes = await readFile(manifest.executablePath)
      actualExecutableHash = sha256(executableBytes)
      if (actualExecutableHash !== manifest.executableHash) return blocked(`转换器 ${manifest.id} 可执行文件哈希不匹配`)
    } catch (error) {
      return blocked(`转换器 ${manifest.id} 不可执行：${error instanceof Error ? error.message : String(error)}`)
    }
    const directory = await mkdtemp(join(tmpdir(), 'workwise-survey-converter-'))
    try {
      const sourceExtension = extname(sourceName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 13)
      const inputPath = join(directory, `source${sourceExtension || '.bin'}`)
      const outputPath = join(directory, `converted${manifest.outputExtension}`)
      await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600 })
      const args = manifest.arguments.map((value) => value.replaceAll('{input}', inputPath).replaceAll('{output}', outputPath))
      const result = await this.executor.execute({ executablePath: manifest.executablePath, arguments: args, workingDirectory: directory, outputPath, timeoutMs: manifest.timeoutMs, maxOutputBytes: manifest.maxOutputBytes })
      if (result.exitCode !== 0) return blocked(`转换器 ${manifest.id} 退出码 ${String(result.exitCode)}：${result.stderr.trim().slice(0, 500) || '无诊断输出'}`)
      const outputBytes = await readFile(outputPath)
      if (!outputBytes.length) return blocked(`转换器 ${manifest.id} 未生成输出`)
      if (outputBytes.length > manifest.maxOutputBytes) return blocked(`转换器 ${manifest.id} 输出超过 ${manifest.maxOutputBytes} 字节`)
      outputHash = sha256(outputBytes)
      return {
        ok: true,
        outputName: `${basename(sourceName, extname(sourceName))}${manifest.outputExtension}`,
        outputBytes,
        outputFormat: manifest.outputFormat,
        provenance: provenance('passed', outputHash),
        diagnostic: diagnostic(`转换器 ${manifest.id}/${manifest.version} 已在无网络沙箱中完成，输出 SHA-256 ${outputHash}`, 'info')
      }
    } catch (error) {
      return blocked(`转换器 ${manifest.id} 执行失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}

/** No converter is bundled until its license and binary hash pass review. */
export const BUNDLED_SURVEY_CONVERTERS: readonly SurveyConverterManifest[] = []
