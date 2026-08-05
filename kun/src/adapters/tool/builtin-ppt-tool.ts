import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import JSZip from 'jszip'
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

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const hex = value.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  }
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const linear = (channel: number): number => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b)
}

function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function svgBackgroundColor(svg: string): string | null {
  const gradient = svg.match(
    /<linearGradient\s+id="bg"[^>]*>[\s\S]*?<stop[^>]*stop-color="(#[0-9a-fA-F]{6})"/i
  )
  if (gradient) return gradient[1]
  const rect = svg.match(/<rect\b[^>]*fill="(#[0-9a-fA-F]{6})"/i)
  return rect ? rect[1] : null
}

function svgContrastWarnings(svg: string, background: string | null): string[] {
  if (!background) return []
  const bg = parseHexColor(background)
  if (!bg) return []
  const bgLuminance = relativeLuminance(bg)
  const warnings: string[] = []
  let index = 0
  for (const match of svg.matchAll(/<text\b[^>]*\bfill="(#[0-9a-fA-F]{6})"[^>]*>/gi)) {
    index += 1
    const fill = parseHexColor(match[1])
    if (!fill) continue
    const ratio = contrastRatio(relativeLuminance(fill), bgLuminance)
    if (ratio < 2.5) {
      warnings.push(`low_contrast: text #${index} fill ${match[1]} on background ${background} has contrast ${ratio.toFixed(2)}:1 (below 2.5:1)`)
    } else if (ratio < 4.5) {
      warnings.push(`low_contrast_warning: text #${index} fill ${match[1]} on background ${background} has contrast ${ratio.toFixed(2)}:1 (below 4.5:1)`)
    }
  }
  return warnings
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

  // Production-flow gates: the deck must be designed and locked before export.
  const designSpecPath = join(projectDir, 'design_spec.md')
  const specLockPath = join(projectDir, 'spec_lock.md')
  if (!existsSync(designSpecPath)) {
    throw new Error('missing design_spec.md: author the design spec from the confirmed result before exporting.')
  }
  if (!existsSync(specLockPath)) {
    throw new Error('missing spec_lock.md: author the execution lock from the design spec before exporting.')
  }

  // Speaker notes gate: notes are required for every slide unless the confirmed
  // result explicitly disables proactive speaker notes.
  const confirmedResultPath = join(projectDir, 'confirm_ui', 'result.json')
  let speakerNotesEnabled = true
  if (existsSync(confirmedResultPath)) {
    try {
      const confirmed = JSON.parse(await readFile(confirmedResultPath, 'utf8')) as Record<string, unknown>
      if (confirmed.proactive_speaker_notes === false) speakerNotesEnabled = false
    } catch {
      // unreadable result.json -> treat as pending confirmation and require notes
    }
  }
  if (speakerNotesEnabled) {
    const missingNotes: string[] = []
    for (const slide of slides) {
      const noteName = slide.replace(/\.svg$/i, '.md')
      if (!existsSync(join(projectDir, 'notes', noteName))) {
        missingNotes.push(`notes/${noteName}`)
      }
    }
    if (missingNotes.length > 0) {
      throw new Error(
        `missing speaker notes for ${missingNotes.length}/${slides.length} slides: ${missingNotes.join(', ')}. Write notes/<slide>.md for every slide before exporting.`
      )
    }
  }

  // Contrast gate: severe low-contrast text blocks export; weaker violations warn.
  const severeContrast: string[] = []
  const contrastWarnings: string[] = []
  for (const slide of slides) {
    const svg = await readFile(join(svgDir, slide), 'utf8')
    const background = svgBackgroundColor(svg)
    for (const warning of svgContrastWarnings(svg, background)) {
      if (warning.startsWith('low_contrast:')) severeContrast.push(`${slide}: ${warning}`)
      else contrastWarnings.push(`${slide}: ${warning}`)
    }
  }
  if (severeContrast.length > 0) {
    throw new Error(
      `low_contrast_text: ${severeContrast.join('; ')}. Increase text contrast before exporting.`
    )
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
  let pptxSlideCount = 0
  let notesCount = 0
  try {
    const zip = await JSZip.loadAsync(await readFile(outputPath))
    pptxSlideCount = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .length
    notesCount = Object.keys(zip.files)
      .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
      .length
  } catch {
    // A malformed output is still surfaced by the caller as a file; keep the
    // SVG-derived slide count and report notes as unverified.
    notesCount = 0
  }
  if (pptxSlideCount > 0 && pptxSlideCount !== slides.length) {
    throw new Error(`ppt_master output slide count mismatch: expected ${slides.length}, got ${pptxSlideCount}.`)
  }
  if (speakerNotesEnabled && pptxSlideCount > 0 && notesCount !== pptxSlideCount) {
    throw new Error(
      `speaker_notes_missing_in_output: expected ${pptxSlideCount} notes slides, got ${notesCount}. Add notes/<slide>.md files and re-export.`
    )
  }
  return {
    output: {
      outputPath,
      slideCount: pptxSlideCount > 0 ? pptxSlideCount : slides.length,
      notesCount,
      bytes: outputStat.size,
      warnings: contrastWarnings
    }
  }
}

export function createPptMasterLocalTool(
  options: PptMasterLocalToolOptions = {}
): LocalTool {
  return defineLocalTool({
    name: 'ppt_master',
    description:
      'Convert a completed PPT Master project into an editable .pptx using the bundled runtime. Production gates are enforced before export: the project MUST contain design_spec.md (authored from the confirmed result), spec_lock.md, every page in svg_output/slide_XX.svg, and notes/slide_XX.md for every slide unless the confirmed result disables proactive speaker notes. Text contrast below 2.5:1 on the page background blocks export and 2.5-4.5:1 is returned as warnings. The tool returns outputPath, slideCount, notesCount and warnings so you can verify the deliverable. Use this tool instead of shell or Python when generating PPTX files.',
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
