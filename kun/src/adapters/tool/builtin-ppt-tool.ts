import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { ToolHostContext } from '../../ports/tool-host.js'
import { defineLocalTool } from './local-tool-definition.js'
import type { LocalTool } from './local-tool-host.js'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const MAX_PROTOCOL_BYTES = 2 * 1024 * 1024
const MAX_ERROR_BYTES = 64 * 1024

export type PptMasterSpawnResult = {
  ok: boolean
  outputPath?: string
  message?: string
}

export type PptMasterLocalToolOptions = {
  sidecarPath?: string
  timeoutMs?: number
  operations?: {
    spawnSidecar?: (input: {
      request: Record<string, unknown>
      workspaceRoot: string
      timeoutMs: number
      signal: AbortSignal
    }) => Promise<PptMasterSpawnResult>
  }
}

function resolveSidecarPath(options: PptMasterLocalToolOptions): string {
  const explicit = options.sidecarPath?.trim()
  if (explicit) return explicit
  const fromEnv = process.env.WORKWISE_PPT_MASTER_SIDECAR?.trim()
  if (fromEnv) return fromEnv
  return join(
    process.cwd(),
    'build',
    'sidecars',
    `markitdown-${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
  )
}

function createSpecLock(width: number, height: number, format: 'ppt169' | 'ppt43'): string {
  return [
    '<!-- ppt-master-schema: spec-lock/v1 -->',
    '# Execution Lock',
    '',
    '## canvas',
    `- viewBox: 0 0 ${width} ${height}`,
    `- format: ${format}`,
    '',
    '## colors',
    '- bg: #FFFFFF',
    '- primary: #1E3A5F',
    '- accent: #2563EB',
    '- text: #111827',
    '',
    '## typography',
    '- font_family: Arial',
    '- title_family: Arial',
    '- body_family: Arial',
    '- body: 18',
    '- title: 32',
    '',
    '## pptx_structure',
    '- mode: flat',
    ''
  ].join('\n')
}

function assertInsideWorkspace(target: string, workspace: string): void {
  const rel = relative(resolve(workspace), resolve(target))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes the workspace: ${target}`)
  }
}

function spawnSidecar(
  executable: string,
  request: Record<string, unknown>,
  workspaceRoot: string,
  timeoutMs: number,
  signal: AbortSignal
): Promise<PptMasterSpawnResult> {
  return new Promise<PptMasterSpawnResult>((resolvePromise, reject) => {
    const child = spawn(executable, [], {
      cwd: workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdoutBytes = 0
    let stderrBytes = 0
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        reject(new Error('PPT Master export timed out.'))
      }
    }, timeoutMs)
    const onAbort = (): void => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        reject(new Error('PPT Master export was cancelled.'))
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes <= MAX_PROTOCOL_BYTES) stdout.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength
      if (stderrBytes <= MAX_ERROR_BYTES) stderr.push(chunk)
    })
    child.stdin?.end(JSON.stringify(request))
    child.once('error', (error) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    })
    child.once('exit', (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      const text = Buffer.concat(stdout).toString('utf8').trim()
      let response: PptMasterSpawnResult
      try {
        response = JSON.parse(text) as PptMasterSpawnResult
      } catch {
        const detail = Buffer.concat(stderr).toString('utf8').trim().slice(0, 500)
        reject(new Error(`PPT Master runtime exited with ${exitCode ?? 'unknown'}${detail ? `: ${detail}` : ''}`))
        return
      }
      if (exitCode !== 0 || !response.ok) {
        reject(new Error(response.message || 'PPT Master export failed.'))
        return
      }
      resolvePromise(response)
    })
  })
}

async function executePptMasterExport(
  args: Record<string, unknown>,
  context: ToolHostContext,
  options: PptMasterLocalToolOptions
): Promise<{ output: unknown; isError?: boolean }> {
  const projectDir = typeof args.projectDir === 'string' ? args.projectDir.trim() : ''
  const outputPath = typeof args.outputPath === 'string' ? args.outputPath.trim() : ''
  const format = args.format === 'ppt43' ? 'ppt43' : 'ppt169'
  if (!projectDir || !outputPath) {
    throw new Error('projectDir and outputPath are required')
  }
  assertInsideWorkspace(projectDir, context.workspace)
  assertInsideWorkspace(outputPath, context.workspace)
  if (!outputPath.toLowerCase().endsWith('.pptx')) {
    throw new Error('outputPath must end with .pptx')
  }

  const svgDir = join(projectDir, 'svg_output')
  await mkdir(svgDir, { recursive: true })
  const slides = (await readdir(svgDir))
    .filter((name) => /^slide_\d+\.svg$/i.test(name))
    .sort()
  if (slides.length === 0) {
    throw new Error('svg_output must contain slide_01.svg, slide_02.svg, ...')
  }

  const specLockPath = join(projectDir, 'spec_lock.md')
  if (!existsSync(specLockPath)) {
    const firstSvg = await readFile(join(svgDir, slides[0]), 'utf8')
    const viewBox = firstSvg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
    const width = viewBox ? Math.round(Number(viewBox[1])) : format === 'ppt43' ? 1024 : 1280
    const height = viewBox ? Math.round(Number(viewBox[2])) : format === 'ppt43' ? 768 : 720
    await writeFile(specLockPath, createSpecLock(width, height, format), 'utf8')
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const spawnOperation = options.operations?.spawnSidecar
  const result = spawnOperation
    ? await spawnOperation({
        request: {
          operation: 'ppt-master-export-pptx',
          workspaceRoot: projectDir,
          projectPath: projectDir,
          outputPath,
          source: 'output',
          format
        },
        workspaceRoot: projectDir,
        timeoutMs,
        signal: context.abortSignal
      })
    : await spawnSidecar(
        resolveSidecarPath(options),
        {
          operation: 'ppt-master-export-pptx',
          workspaceRoot: projectDir,
          projectPath: projectDir,
          outputPath,
          source: 'output',
          format
        },
        projectDir,
        timeoutMs,
        context.abortSignal
      )

  if (!result.ok) {
    throw new Error(result.message || 'PPT Master export failed.')
  }
  const outputStat = await stat(outputPath)
  if (!outputStat.isFile() || outputStat.size === 0) {
    throw new Error('PPT Master export produced no output file.')
  }
  return {
    output: {
      outputPath,
      slideCount: slides.length,
      bytes: outputStat.size
    }
  }
}

export function createPptMasterLocalTool(
  options: PptMasterLocalToolOptions = {}
): LocalTool {
  return defineLocalTool({
    name: 'ppt_master',
    description:
      'Convert per-slide SVG files into an editable .pptx using the bundled WorkWise PPT Master runtime. The project directory must contain svg_output/slide_01.svg, slide_02.svg, ... following the WorkWise canvas contract (viewBox 0 0 W H, inline styles). The tool writes spec_lock.md when missing, runs the converter, and returns the absolute output path. Use this tool instead of shell or Python when generating PPTX files.',
    inputSchema: {
      type: 'object',
      properties: {
        projectDir: {
          type: 'string',
          description: 'Absolute workspace directory containing svg_output/*.svg'
        },
        outputPath: {
          type: 'string',
          description: 'Absolute .pptx output path inside the workspace'
        },
        format: {
          type: 'string',
          enum: ['ppt169', 'ppt43'],
          description: 'Slide aspect ratio; defaults to ppt169'
        }
      },
      required: ['projectDir', 'outputPath']
    },
    policy: 'on-request',
    execute: (args, toolContext) => executePptMasterExport(args, toolContext, options)
  })
}

export const builtinPptToolInternals = {
  resolveSidecarPath,
  createSpecLock,
  assertInsideWorkspace,
  spawnSidecar,
  executePptMasterExport
}
