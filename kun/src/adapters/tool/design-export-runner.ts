/**
 * Design 导出运行器（kun 进程侧）。
 *
 * kun 的 design_export_pptx 工具调用此模块。
 * 与 main 进程的 design-export-service 不同——这个在 kun 的 Node 进程里运行，
 * 直接调 svg_to_pptx.py。
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdtemp, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import JSZip from 'jszip'
import { atomicWriteFile } from '../file/atomic-write.js'
import { validateArtifactFile } from '../../services/artifact-validator.js'
import {
  runRuntimePptMasterSidecar,
  runtimePptMasterSidecarAvailable
} from './ppt-master-sidecar-runner.js'

const EXPORT_TIMEOUT_MS = 5 * 60 * 1000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const MAX_SVG_FILES = 200
const MAX_SVG_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_SVG_BYTES = 50 * 1024 * 1024

type SvgSource = {
  path: string
  content: string
}

type SvgCanvas = {
  viewBox: string
  width: number
  height: number
  format: 'ppt169' | 'ppt43'
}

function resolveSvgCanvas(sources: SvgSource[]): SvgCanvas {
  let first: SvgCanvas | null = null
  for (const source of sources) {
    const rootTag = source.content.match(/<svg\b[^>]*>/i)?.[0]
    const rawViewBox = rootTag ? xmlAttribute(rootTag, 'viewBox') : undefined
    const values = rawViewBox
      ?.trim()
      .split(/[\s,]+/)
      .map((value) => Number(value))
    if (
      !values ||
      values.length !== 4 ||
      values.some((value) => !Number.isFinite(value)) ||
      values[2] <= 0 ||
      values[3] <= 0
    ) {
      throw new Error(`invalid_input: SVG slide has no valid viewBox: ${basename(source.path)}`)
    }
    const current: SvgCanvas = {
      viewBox: values.join(' '),
      width: values[2],
      height: values[3],
      format: values[2] / values[3] < 1.5 ? 'ppt43' : 'ppt169'
    }
    if (
      first &&
      (current.viewBox !== first.viewBox || current.format !== first.format)
    ) {
      throw new Error('invalid_input: every SVG slide must use the same canvas')
    }
    first = current
  }
  if (!first) throw new Error('invalid_input: no SVG slides were found')
  return first
}

function createFlatPptMasterSpecLock(canvas: SvgCanvas): string {
  return [
    '<!-- ppt-master-schema: spec-lock/v1 -->',
    '# Execution Lock',
    '',
    '## canvas',
    `- viewBox: ${canvas.viewBox}`,
    `- format: ${canvas.format}`,
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

function pathIsContained(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function inferWorkspaceBoundary(sourcePath: string, outputPath: string, sourceIsDirectory: boolean): string {
  let candidate = sourceIsDirectory ? resolve(sourcePath) : dirname(resolve(sourcePath))
  const outputDirectory = dirname(resolve(outputPath))
  while (!pathIsContained(candidate, outputDirectory)) {
    const parent = dirname(candidate)
    if (parent === candidate) break
    candidate = parent
  }
  return candidate
}

async function validateSvgReferences(
  svg: string,
  svgDirectory: string,
  workspaceRoot: string
): Promise<void> {
  const canonicalRoot = await realpath(workspaceRoot)
  const referencePattern = /(?:href|xlink:href)\s*=\s*["']([^"']+)["']/gi
  for (const match of svg.matchAll(referencePattern)) {
    const rawReference = match[1]?.trim() ?? ''
    if (!rawReference || rawReference.startsWith('#')) continue
    if (rawReference.startsWith('data:')) {
      if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(rawReference)) {
        throw new Error('unsafe_path: SVG contains an unsupported embedded resource')
      }
      continue
    }
    if (
      rawReference.includes('\0') ||
      /^(?:[a-z][a-z0-9+.-]*:|\/\/|\\\\|[a-zA-Z]:)/i.test(rawReference) ||
      isAbsolute(rawReference)
    ) {
      throw new Error('unsafe_path: SVG contains an external resource reference')
    }

    let decodedReference: string
    try {
      decodedReference = decodeURIComponent(rawReference.split(/[?#]/, 1)[0])
    } catch {
      throw new Error('unsafe_path: SVG contains an invalid resource reference')
    }
    const referencePath = resolve(svgDirectory, decodedReference)
    if (!pathIsContained(resolve(workspaceRoot), referencePath)) {
      throw new Error('unsafe_path: SVG resource reference escapes the workspace root')
    }
    const referenceInfo = await lstat(referencePath)
    if (referenceInfo.isSymbolicLink() || !referenceInfo.isFile()) {
      throw new Error('unsafe_path: SVG resource reference is not a regular file')
    }
    const canonicalReference = await realpath(referencePath)
    if (!pathIsContained(canonicalRoot, canonicalReference)) {
      throw new Error('unsafe_path: SVG resource reference resolves outside the workspace root')
    }
  }
}

async function collectSvgSources(
  sourcePath: string,
  outputPath: string,
  workspaceRoot?: string
): Promise<SvgSource[]> {
  const sourceInfo = await lstat(sourcePath)
  if (sourceInfo.isSymbolicLink() || (!sourceInfo.isDirectory() && !sourceInfo.isFile())) {
    throw new Error('unsafe_path: SVG source must be a regular file or directory')
  }
  const boundary = resolve(
    workspaceRoot?.trim() || inferWorkspaceBoundary(sourcePath, outputPath, sourceInfo.isDirectory())
  )
  const canonicalBoundary = await realpath(boundary)
  const canonicalSource = await realpath(sourcePath)
  if (!pathIsContained(canonicalBoundary, canonicalSource)) {
    throw new Error('unsafe_path: SVG source resolves outside the workspace root')
  }

  const paths: string[] = []
  if (sourceInfo.isDirectory()) {
    const entries = await readdir(sourcePath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith('.svg')) continue
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error(`unsafe_path: SVG slide is not a regular file: ${entry.name}`)
      }
      paths.push(join(sourcePath, entry.name))
    }
    paths.sort((left, right) => basename(left).localeCompare(basename(right), 'en'))
  } else {
    if (extname(sourcePath).toLowerCase() !== '.svg') {
      throw new Error('invalid_input: source file must end in .svg')
    }
    paths.push(sourcePath)
  }

  if (paths.length === 0) throw new Error('invalid_input: no SVG slides were found')
  if (paths.length > MAX_SVG_FILES) {
    throw new Error(`resource_limit: SVG export exceeds ${MAX_SVG_FILES} slides`)
  }

  let totalBytes = 0
  const sources: SvgSource[] = []
  for (const path of paths) {
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`unsafe_path: SVG slide is not a regular file: ${basename(path)}`)
    }
    if (info.size <= 0 || info.size > MAX_SVG_BYTES) {
      throw new Error(`resource_limit: SVG slide exceeds ${MAX_SVG_BYTES} bytes: ${basename(path)}`)
    }
    totalBytes += info.size
    if (totalBytes > MAX_TOTAL_SVG_BYTES) {
      throw new Error(`resource_limit: SVG export exceeds ${MAX_TOTAL_SVG_BYTES} total bytes`)
    }
    const content = await readFile(path, 'utf8')
    await validateSvgReferences(content, dirname(path), boundary)
    sources.push({ path, content })
  }
  return sources
}

function xmlAttribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}=["']([^"']+)["']`, 'i').exec(tag)?.[1]
}

function parseRelationships(xml: string): Array<{
  id: string
  type: string
  target: string
  external: boolean
}> {
  return (xml.match(/<Relationship\b[^>]*>/gi) ?? []).map((tag) => ({
    id: xmlAttribute(tag, 'Id') ?? '',
    type: xmlAttribute(tag, 'Type') ?? '',
    target: xmlAttribute(tag, 'Target') ?? '',
    external: xmlAttribute(tag, 'TargetMode')?.toLowerCase() === 'external'
  }))
}

function slideRelationshipPath(slidePart: string): string {
  return join(dirname(slidePart), '_rels', `${basename(slidePart)}.rels`).replaceAll('\\', '/')
}

function resolveSlideTarget(relationshipPath: string, target: string): string {
  const marker = '/_rels/'
  const base = relationshipPath.includes(marker)
    ? relationshipPath.slice(0, relationshipPath.indexOf(marker))
    : dirname(relationshipPath).replaceAll('\\', '/')
  const normalized = join(base, target).replaceAll('\\', '/')
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new Error(`unsafe_path: invalid OOXML relationship target in ${relationshipPath}`)
  }
  return normalized
}

async function validateExpectedPowerPointSlides(path: string, expectedSlideCount: number): Promise<void> {
  const bytes = await readFile(path)
  const zip = await JSZip.loadAsync(bytes, { createFolders: false, checkCRC32: true })
  const names = Object.keys(zip.files)
  const actualSlides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string')
  const slideIdCount = presentationXml?.match(/<(?:[A-Za-z_][\w.-]*:)?sldId\b[^>]*>/gi)?.length ?? 0
  if (actualSlides.length !== expectedSlideCount || slideIdCount !== expectedSlideCount) {
    throw new Error(
      `design_export_failed: expected ${expectedSlideCount} slides, found ${actualSlides.length} package parts and ${slideIdCount} presentation entries`
    )
  }

  for (const relationshipPath of names.filter((name) => name.endsWith('.rels'))) {
    const xml = await zip.file(relationshipPath)?.async('string')
    if (!xml) continue
    for (const relationship of parseRelationships(xml)) {
      if (
        relationship.external &&
        /\/(?:image|media|audio|video)$/i.test(relationship.type)
      ) {
        throw new Error(`unsafe_path: PowerPoint contains an external media relationship in ${relationshipPath}`)
      }
    }
  }

  for (const slidePart of actualSlides) {
    const slideXml = await zip.file(slidePart)!.async('string')
    const imageIds = (slideXml.match(/<(?:[A-Za-z_][\w.-]*:)?blip\b[^>]*>/gi) ?? [])
      .map((tag) => xmlAttribute(tag, 'r:embed') ?? xmlAttribute(tag, 'r:link'))
      .filter((id): id is string => Boolean(id))
    if (imageIds.length === 0) continue
    const relationshipPath = slideRelationshipPath(slidePart)
    const relationshipXml = await zip.file(relationshipPath)?.async('string')
    if (!relationshipXml) throw new Error(`design_export_failed: missing relationships for ${slidePart}`)
    const relationships = new Map(
      parseRelationships(relationshipXml).map((relationship) => [relationship.id, relationship])
    )
    for (const id of imageIds) {
      const relationship = relationships.get(id)
      if (!relationship || relationship.external || !/\/image$/i.test(relationship.type)) {
        throw new Error(`design_export_failed: invalid image relationship in ${slidePart}`)
      }
      const mediaPart = resolveSlideTarget(relationshipPath, relationship.target)
      if (!/^ppt\/media\/[^/]+$/i.test(mediaPart) || !zip.file(mediaPart)) {
        throw new Error(`design_export_failed: missing media referenced by ${slidePart}`)
      }
    }
  }
}

async function validateAndCommitPowerPoint(
  candidatePath: string,
  outputPath: string,
  expectedSlideCount: number
): Promise<void> {
  const candidateInfo = await lstat(candidatePath)
  if (candidateInfo.isSymbolicLink() || !candidateInfo.isFile()) {
    throw new Error('design_export_failed: exported PowerPoint is not a regular file')
  }
  const validation = await validateArtifactFile(candidatePath, 'pptx')
  if (!validation.valid) {
    throw new Error(`design_export_failed: ${validation.message ?? 'invalid PowerPoint package'}`)
  }
  await validateExpectedPowerPointSlides(candidatePath, expectedSlideCount)
  await atomicWriteFile(outputPath, await readFile(candidatePath))
}

/**
 * 把 SVG 文件（或含多 SVG 的目录）转为 PPTX。
 *
 * @param sourcePath 单个 .svg 文件或含 .svg 文件的目录
 * @param outputPath 输出 .pptx 路径
 */
export async function exportDesignSvgToPptx(
  sourcePath: string,
  outputPath: string,
  workspaceRoot?: string
): Promise<void> {
  const sidecarConfigured = Boolean(process.env.WORKWISE_PPT_MASTER_SIDECAR?.trim())
  const sidecarAvailable = runtimePptMasterSidecarAvailable()
  if (sidecarConfigured && !sidecarAvailable) {
    throw new Error('The bundled PPT Master runtime is unavailable')
  }
  const scriptPath = sidecarConfigured ? null : resolvePptMasterScript()
  if (!sidecarConfigured && !scriptPath) {
    throw new Error('PPT Master scripts not found')
  }

  const tempProject = await mkdtemp(join(tmpdir(), 'workwise-design-export-'))
  const svgOutputDir = join(tempProject, 'svg_output')
  await mkdir(svgOutputDir, { recursive: true })

  try {
    const sources = await collectSvgSources(sourcePath, outputPath, workspaceRoot)
    const canvas = resolveSvgCanvas(sources)
    await writeFile(
      join(tempProject, 'spec_lock.md'),
      createFlatPptMasterSpecLock(canvas),
      'utf8'
    )
    for (let i = 0; i < sources.length; i++) {
      const padded = String(i + 1).padStart(2, '0')
      await writeFile(join(svgOutputDir, `slide_${padded}.svg`), sources[i].content, 'utf8')
    }

    await mkdir(dirname(outputPath), { recursive: true })
    const candidatePath = join(tempProject, `workwise-${randomUUID()}.pptx`)

    try {
      if (sidecarAvailable) {
        await runRuntimePptMasterSidecar({
          operation: 'ppt-master-export-pptx',
          workspaceRoot: tempProject,
          projectPath: tempProject,
          outputPath: candidatePath,
          source: 'output',
          format: canvas.format
        }, { timeoutMs: EXPORT_TIMEOUT_MS })
      } else {
        await runSvgToPptx(scriptPath!, tempProject, candidatePath, resolvePythonCommand())
      }
      await validateAndCommitPowerPoint(candidatePath, outputPath, sources.length)
    } finally {
      await rm(candidatePath, { force: true }).catch(() => undefined)
    }
  } finally {
    await rm(tempProject, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const _internals = {
  collectSvgSources,
  resolveSvgCanvas,
  createFlatPptMasterSpecLock,
  validateSvgReferences,
  validateExpectedPowerPointSlides,
  validateAndCommitPowerPoint
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
