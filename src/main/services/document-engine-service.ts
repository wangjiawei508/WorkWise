import { randomUUID, createHash } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, mkdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, relative } from 'node:path'
import type {
  DocumentEngineId,
  DocumentEngineStatusV1,
  DocumentParseRequestV1,
  DocumentParseResultV1
} from '../../shared/agent-workbench'
import { canonicalizeContainmentRoot, resolveContainedPath } from './canonical-containment'
import { safeSpawn } from './safe-spawn'
import { MINERU_VERSION, MineruInstallerService, type MineruInstallPreflight } from './mineru-installer-service'
import { analyzePdfDocument, type PdfDocumentAnalysisV1 } from './pdf-document-service'
import { atomicWriteFile } from './durable-file'
import { inspectOfficeArchive } from './office-archive-security'

const MARKITDOWN_ENGINE_VERSION = 'markitdown-v0.1.4-workwise-1'
const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024
const MAX_PROTOCOL_BYTES = 16 * 1024 * 1024
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx', '.xlsx'])

export type DocumentSidecarResponse = {
  ok: boolean
  code?: string
  message?: string
  engine?: DocumentEngineId
  engineVersion?: string
  sourceSha256?: string
  markdownPath?: string
  headings?: DocumentParseResultV1['headings']
  tables?: DocumentParseResultV1['tables']
  media?: DocumentParseResultV1['media']
  references?: DocumentParseResultV1['references']
  warnings?: string[]
  durationMs?: number
}

export type DocumentQualityAssessment = {
  needsAccurateEngine: boolean
  reasons: string[]
}

export function assessDocumentQuality(input: {
  extension: string
  markdown: string
  sourceBytes: number
  warnings?: string[]
  pageCount?: number
  pageTextCharacters?: number
}): DocumentQualityAssessment {
  if (input.extension !== '.pdf') return { needsAccurateEngine: false, reasons: [] }
  const normalized = input.markdown.replace(/\s+/g, '')
  const reasons: string[] = []
  const minimumText = Math.max(160, Math.min(2_000, Math.floor(input.sourceBytes / 8_192)))
  if (normalized.length < minimumText) reasons.push('low_text_density')
  if (
    input.pageCount &&
    (input.pageTextCharacters ?? normalized.length) < Math.max(80, input.pageCount * 40)
  ) reasons.push('scanned_or_sparse_pages')
  const replacementCount = [...input.markdown].filter((character) => character === '\uFFFD').length
  if (replacementCount > 8 && replacementCount / Math.max(1, input.markdown.length) > 0.005) reasons.push('garbled_text')
  if ((input.warnings ?? []).some((warning) => /scan|ocr|formula|multi.?column|cross.?page|layout/i.test(warning))) {
    reasons.push('complex_layout')
  }
  return { needsAccurateEngine: reasons.length > 0, reasons: [...new Set(reasons)] }
}

export type DocumentEngineRunner = (input: {
  parseId: string
  engine: 'markitdown' | 'mineru-local'
  workspaceRoot: string
  inputPath: string
  outputDirectory: string
  signal: AbortSignal
}) => Promise<DocumentSidecarResponse>

export type DocumentEngineServiceOptions = {
  resourcesPath?: string
  developmentRoot?: string
  toolsRoot?: string
  platform?: NodeJS.Platform
  arch?: string
  runner?: DocumentEngineRunner
}

export class DocumentEngineError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'document_engine_unavailable'
      | 'document_parse_failed'
      | 'document_parse_cancelled'
      | 'document_upload_not_allowed'
      | 'resource_limit'
      | 'unsupported_format'
  ) {
    super(message)
    this.name = 'DocumentEngineError'
  }
}

export class DocumentEngineService {
  private readonly active = new Map<string, AbortController>()
  private readonly options: Required<Omit<DocumentEngineServiceOptions, 'runner'>> & { runner?: DocumentEngineRunner }
  private readonly mineruInstaller: MineruInstallerService

  constructor(options: DocumentEngineServiceOptions = {}) {
    this.options = {
      resourcesPath: options.resourcesPath ?? process.resourcesPath ?? '',
      developmentRoot: options.developmentRoot ?? process.cwd(),
      toolsRoot: options.toolsRoot ?? join(homedir(), '.workwise', 'tools'),
      platform: options.platform ?? process.platform,
      arch: options.arch ?? process.arch,
      runner: options.runner
    }
    this.mineruInstaller = new MineruInstallerService({
      toolsRoot: this.options.toolsRoot,
      platform: this.options.platform
    })
  }

  async listEngines(privateServerUrl?: string): Promise<DocumentEngineStatusV1[]> {
    const markitdown = await this.executableStatus(this.markitdownExecutable())
    const mineru = this.options.runner ? true : await this.mineruInstaller.isInstalled()
    return [
      {
        id: 'markitdown',
        state: markitdown ? 'available' : 'not_installed',
        version: markitdown ? MARKITDOWN_ENGINE_VERSION : undefined,
        local: true,
        capabilities: ['pdf', 'docx', 'pptx', 'xlsx'],
        message: markitdown ? undefined : 'The bundled MarkItDown sidecar is unavailable.',
        attribution: 'Microsoft MarkItDown (MIT)'
      },
      {
        id: 'mineru-local',
        state: mineru ? 'available' : 'not_installed',
        local: true,
        capabilities: ['pdf', 'ocr', 'layout', 'formula'],
        message: mineru ? undefined : 'Install the optional high-accuracy parser to use local OCR and layout analysis.',
        version: mineru ? `mineru-${MINERU_VERSION}` : undefined,
        attribution: `MinerU ${MINERU_VERSION} (MinerU Open Source License)`
      },
      {
        id: 'mineru-private',
        state: privateServerUrl?.trim() ? 'available' : 'needs_configuration',
        local: false,
        capabilities: ['pdf', 'ocr', 'layout', 'formula'],
        message: privateServerUrl?.trim() ? undefined : 'An enterprise private MinerU endpoint must be configured explicitly.',
        attribution: 'User-configured private MinerU service'
      }
    ]
  }

  async parse(request: DocumentParseRequestV1): Promise<DocumentParseResultV1> {
    const parseId = request.parseId?.trim() || request.idempotencyKey.trim() || randomUUID()
    if (this.active.has(parseId)) throw new DocumentEngineError('A parse with this id is already running.', 'document_parse_failed')
    const controller = new AbortController()
    this.active.set(parseId, controller)
    try {
      const workspaceRoot = await canonicalizeContainmentRoot(request.workspaceRoot)
      const inputPath = await resolveContainedPath({
        root: workspaceRoot,
        target: request.relativePath,
        mustExist: true,
        expect: 'file',
        rejectFinalLink: true
      })
      const file = await stat(inputPath)
      if (file.size > MAX_DOCUMENT_BYTES) {
        throw new DocumentEngineError('Document exceeds the 200 MiB limit.', 'resource_limit')
      }
      const extension = extname(inputPath).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw new DocumentEngineError(`Unsupported document format: ${extension || '(none)'}`, 'unsupported_format')
      }
      if (extension !== '.pdf') inspectOfficeArchive(await readFile(inputPath))
      const sourceSha256 = await sha256File(inputPath)
      const mineruAvailable = this.options.runner ? true : await this.mineruInstaller.isInstalled()
      const engine = await this.selectEngine(request, extension, mineruAvailable)
      const cacheKey = createHash('sha256')
        .update(`${sourceSha256}\0${engine}\0${engineCacheVersion(engine)}\0${request.mode}\0${mineruAvailable}`)
        .digest('hex')
      const outputDirectory = await resolveContainedPath({
        root: workspaceRoot,
        target: request.outputDirectory || join('.workwise', 'cache', 'documents', cacheKey),
        mustExist: false,
        expect: 'directory',
        rejectFinalLink: true
      })
      const cached = await this.readCache(workspaceRoot, outputDirectory, parseId)
      if (cached) return cached
      await mkdir(outputDirectory, { recursive: true })

      if (engine === 'mineru-private') {
        if (!request.allowPrivateServerUpload) {
          throw new DocumentEngineError(
            'Private MinerU upload requires explicit permission for this workspace.',
            'document_upload_not_allowed'
          )
        }
        throw new DocumentEngineError('Private MinerU transport is not configured.', 'document_engine_unavailable')
      }

      let response: DocumentSidecarResponse
      let degradedFrom: DocumentEngineId | undefined
      let quality: DocumentQualityAssessment = { needsAccurateEngine: false, reasons: [] }
      let pdfAnalysis: PdfDocumentAnalysisV1 | undefined
      try {
        response = await this.runEngine({
          parseId,
          engine,
          workspaceRoot,
          inputPath,
          outputDirectory,
          signal: controller.signal
        })
      } catch (error) {
        if (controller.signal.aborted) {
          throw new DocumentEngineError('Document parsing was cancelled.', 'document_parse_cancelled')
        }
        if (engine === 'mineru-local' && request.mode === 'auto') {
          response = await this.runEngine({
            parseId,
            engine: 'markitdown',
            workspaceRoot,
            inputPath,
            outputDirectory,
            signal: controller.signal
          })
          response.warnings = [
            ...(response.warnings ?? []),
            `High-accuracy parsing failed; the local MarkItDown result is shown: ${safeErrorMessage(error)}`
          ]
          response.engine = 'markitdown'
          degradedFrom = 'mineru-local'
        } else {
          throw error
        }
      }
      if (request.mode === 'auto' && engine === 'markitdown' && response.ok && response.markdownPath) {
        const lightweightPath = await resolveContainedPath({
          root: workspaceRoot,
          target: response.markdownPath,
          mustExist: true,
          expect: 'file',
          rejectFinalLink: true
        })
        const lightweightMarkdown = await readFile(lightweightPath, 'utf8')
        pdfAnalysis = await analyzePdfDocument(inputPath, controller.signal).catch((error) => {
          response.warnings = [...(response.warnings ?? []), `PDF.js text-layer analysis failed: ${safeErrorMessage(error)}`]
          return undefined
        })
        quality = assessDocumentQuality({
          extension,
          markdown: lightweightMarkdown,
          sourceBytes: file.size,
          warnings: response.warnings,
          pageCount: pdfAnalysis?.pageCount,
          pageTextCharacters: pdfAnalysis?.pages.reduce((sum, page) => sum + page.text.length, 0)
        })
        if (quality.needsAccurateEngine) {
          if (mineruAvailable) {
            const lightweightResponse = response
            try {
              response = await this.runEngine({
                parseId,
                engine: 'mineru-local',
                workspaceRoot,
                inputPath,
                outputDirectory,
                signal: controller.signal
              })
              response.warnings = [
                ...(response.warnings ?? []),
                `Auto-routed to MinerU: ${quality.reasons.join(', ')}.`
              ]
            } catch (error) {
              response = {
                ...lightweightResponse,
                warnings: [
                  ...(lightweightResponse.warnings ?? []),
                  `MinerU fallback failed; using MarkItDown: ${safeErrorMessage(error)}`
                ]
              }
              degradedFrom = 'mineru-local'
            }
          } else {
            response.warnings = [
              ...(response.warnings ?? []),
              `This document may need high-accuracy parsing (${quality.reasons.join(', ')}); install local MinerU to improve the result.`
            ]
          }
        }
      }
      if (!response.ok || !response.markdownPath) {
        throw new DocumentEngineError(response.message || 'Document parser returned an invalid response.', 'document_parse_failed')
      }
      const markdownPath = await resolveContainedPath({
        root: workspaceRoot,
        target: response.markdownPath,
        mustExist: true,
        expect: 'file',
        rejectFinalLink: true
      })
      const markdown = await readFile(markdownPath, 'utf8')
      if (Buffer.byteLength(markdown) > MAX_PROTOCOL_BYTES) {
        throw new DocumentEngineError('Parsed Markdown exceeds the 16 MiB result limit.', 'resource_limit')
      }
      const selectedEngine = response.engine ?? engine
      if (extension === '.pdf' && !pdfAnalysis) {
        pdfAnalysis = await analyzePdfDocument(inputPath, controller.signal).catch((error) => {
          response.warnings = [...(response.warnings ?? []), `PDF.js text-layer analysis failed: ${safeErrorMessage(error)}`]
          return undefined
        })
      }
      const supplemented = supplementPageReferences({
        headings: response.headings ?? [],
        tables: response.tables ?? [],
        references: response.references ?? [],
        analysis: pdfAnalysis
      })
      const result: DocumentParseResultV1 = {
        id: parseId,
        engine: selectedEngine,
        engineVersion: response.engineVersion || (selectedEngine === 'markitdown' ? MARKITDOWN_ENGINE_VERSION : 'mineru-3.4'),
        sourceSha256: response.sourceSha256 || sourceSha256,
        markdown,
        headings: supplemented.headings,
        tables: supplemented.tables,
        media: response.media ?? [],
        references: supplemented.references,
        warnings: [...(response.warnings ?? []), ...(pdfAnalysis?.warnings ?? [])],
        quality: {
          status: degradedFrom
            ? 'degraded'
            : selectedEngine === 'mineru-local' || selectedEngine === 'mineru-private'
            ? 'enhanced'
            : quality.needsAccurateEngine ? 'degraded' : 'good',
          reasons: degradedFrom
            ? [...new Set([...quality.reasons, 'engine_fallback'])]
            : quality.reasons
        },
        route: {
          requestedMode: request.mode,
          selectedEngine,
          ...(degradedFrom ? { fallbackFrom: degradedFrom } : {})
        },
        degradedFrom,
        cacheHit: false,
        durationMs: response.durationMs ?? 0
      }
      await this.writeCache(workspaceRoot, outputDirectory, markdownPath, result)
      return result
    } finally {
      this.active.delete(parseId)
    }
  }

  cancel(parseId: string): boolean {
    const controller = this.active.get(parseId)
    if (!controller) return false
    controller.abort('user_cancelled')
    return true
  }

  mineruPreflight(): Promise<MineruInstallPreflight> {
    return this.mineruInstaller.preflight()
  }

  async installMineru(): Promise<DocumentEngineStatusV1> {
    await this.mineruInstaller.install()
    const statuses = await this.listEngines()
    return statuses.find((status) => status.id === 'mineru-local')!
  }

  private async selectEngine(
    request: DocumentParseRequestV1,
    extension: string,
    mineruAvailable: boolean
  ): Promise<DocumentEngineId> {
    if (request.preferredEngine) {
      if (request.preferredEngine === 'mineru-private' && !request.allowPrivateServerUpload) {
        throw new DocumentEngineError('Private document upload was not authorized.', 'document_upload_not_allowed')
      }
      return request.preferredEngine
    }
    if (request.mode === 'fast' || extension !== '.pdf') return 'markitdown'
    if (request.mode === 'accurate') {
      if (mineruAvailable) return 'mineru-local'
      throw new DocumentEngineError('The high-accuracy MinerU engine is not installed.', 'document_engine_unavailable')
    }
    // Auto starts with the lightweight local parser. Quality signals returned by
    // the parser are surfaced as warnings; an installed MinerU can be selected
    // explicitly without ever uploading the document.
    return 'markitdown'
  }

  private async readCache(
    workspaceRoot: string,
    outputDirectory: string,
    parseId: string
  ): Promise<DocumentParseResultV1 | null> {
    try {
      const workwisePayload = JSON.parse(await readFile(join(outputDirectory, 'workwise-result.json'), 'utf8')) as {
        markdownPath: string
        result: DocumentParseResultV1
      }
      if (!workwisePayload.markdownPath || !workwisePayload.result?.sourceSha256) return null
      const workwiseMarkdownPath = await resolveContainedPath({
        root: workspaceRoot,
        target: workwisePayload.markdownPath,
        mustExist: true,
        expect: 'file',
        rejectFinalLink: true
      })
      const workwiseMarkdown = await readFile(workwiseMarkdownPath, 'utf8')
      return {
        ...workwisePayload.result,
        id: parseId,
        markdown: workwiseMarkdown,
        cacheHit: true,
        durationMs: 0
      }
    } catch {
      // Older sidecar-only caches remain readable below.
    }
    try {
      const payload = JSON.parse(await readFile(join(outputDirectory, 'result.json'), 'utf8')) as DocumentSidecarResponse
      if (!payload.ok || !payload.markdownPath || !payload.engine || !payload.sourceSha256) return null
      const markdownPath = await resolveContainedPath({
        root: workspaceRoot,
        target: payload.markdownPath,
        mustExist: true,
        expect: 'file',
        rejectFinalLink: true
      })
      const markdown = await readFile(markdownPath, 'utf8')
      return {
        id: parseId,
        engine: payload.engine,
        engineVersion: payload.engineVersion ?? MARKITDOWN_ENGINE_VERSION,
        sourceSha256: payload.sourceSha256,
        markdown,
        headings: payload.headings ?? [],
        tables: payload.tables ?? [],
        media: payload.media ?? [],
        references: payload.references ?? [],
        warnings: payload.warnings ?? [],
        quality: { status: 'good', reasons: [] },
        route: { requestedMode: 'fast', selectedEngine: payload.engine },
        cacheHit: true,
        durationMs: 0
      }
    } catch {
      return null
    }
  }

  private async writeCache(
    workspaceRoot: string,
    outputDirectory: string,
    markdownPath: string,
    result: DocumentParseResultV1
  ): Promise<void> {
    await atomicWriteFile(
      join(outputDirectory, 'workwise-result.json'),
      `${JSON.stringify({
        markdownPath: relative(workspaceRoot, markdownPath).replaceAll('\\', '/'),
        result: { ...result, markdown: '' }
      }, null, 2)}\n`
    )
  }

  private runEngine(input: Parameters<DocumentEngineRunner>[0]): Promise<DocumentSidecarResponse> {
    if (this.options.runner) return this.options.runner(input)
    if (input.engine === 'markitdown') return runJsonSidecar(this.markitdownExecutable(), [], input)
    return runJsonSidecar(this.mineruInstaller.pythonExecutable(), [this.mineruInstaller.adapterPath()], input)
  }

  private markitdownExecutable(): string {
    const executable = this.options.platform === 'win32' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
    const packaged = join(this.options.resourcesPath, 'app.asar.unpacked', 'sidecars', 'markitdown', executable)
    const development = join(
      this.options.developmentRoot,
      'build',
      'sidecars',
      `markitdown-${this.options.platform}-${this.options.arch}`,
      'workwise-markitdown',
      executable
    )
    return existsSync(packaged) ? packaged : development
  }

  private async executableStatus(path: string): Promise<boolean> {
    if (this.options.runner) return true
    try {
      await access(path)
      return (await stat(path)).isFile()
    } catch {
      return false
    }
  }
}

function engineCacheVersion(engine: DocumentEngineId): string {
  return engine === 'markitdown'
    ? MARKITDOWN_ENGINE_VERSION
    : engine === 'mineru-local'
      ? `mineru-${MINERU_VERSION}`
      : 'mineru-private-v1'
}

function supplementPageReferences(input: {
  headings: DocumentParseResultV1['headings']
  tables: DocumentParseResultV1['tables']
  references: DocumentParseResultV1['references']
  analysis?: PdfDocumentAnalysisV1
}): Pick<DocumentParseResultV1, 'headings' | 'tables' | 'references'> {
  if (!input.analysis?.pages.length) {
    return { headings: input.headings, tables: input.tables, references: input.references }
  }
  const references = [...input.references]
  const headings = input.headings.map((heading, index) => {
    const page = heading.page ?? findPdfPage(input.analysis!.pages, heading.text)
    if (page && !references.some((reference) => reference.blockId === `heading-${index + 1}`)) {
      references.push({ page, blockId: `heading-${index + 1}`, kind: 'text' })
    }
    return page ? { ...heading, page } : heading
  })
  const tables = input.tables.map((table, index) => {
    const page = table.page ?? findPdfPage(input.analysis!.pages, table.markdown)
    if (page && !references.some((reference) => reference.blockId === `table-${index + 1}`)) {
      references.push({ page, blockId: `table-${index + 1}`, kind: 'table' })
    }
    return page ? { ...table, page } : table
  })
  return { headings, tables, references }
}

function findPdfPage(pages: PdfDocumentAnalysisV1['pages'], value: string): number | undefined {
  const query = normalizeForPageMatch(value)
  if (!query) return undefined
  const probes = [query.slice(0, 120), query.slice(0, 48), query.slice(0, 20)]
    .filter((probe, index, list) => probe.length >= 4 && list.indexOf(probe) === index)
  for (const page of pages) {
    const text = normalizeForPageMatch(page.text)
    if (probes.some((probe) => text.includes(probe))) return page.page
  }
  return undefined
}

function normalizeForPageMatch(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[|#*_`~>-]/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase()
}

async function sha256File(path: string): Promise<string> {
  const contents = await readFile(path)
  return createHash('sha256').update(contents).digest('hex')
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error'
  return error.message.replace(/(?:[A-Za-z]:)?[\\/](?:[^\s/\\]+[\\/])+[^\s/\\]+/g, '[path]').slice(0, 240)
}

async function runJsonSidecar(
  executable: string,
  args: string[],
  input: Parameters<DocumentEngineRunner>[0]
): Promise<DocumentSidecarResponse> {
  let child: ChildProcess | undefined
  const abort = (): void => {
    if (!child?.pid) return
    if (process.platform === 'win32') {
      void safeSpawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f']).catch(() => child?.kill())
    } else {
      try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    }
  }
  input.signal.addEventListener('abort', abort, { once: true })
  try {
    child = await safeSpawn(executable, args, {
      cwd: input.workspaceRoot,
      workspaceRoot: input.workspaceRoot,
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
    if (input.signal.aborted) abort()
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let bytes = 0
    child.stdout?.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes <= MAX_PROTOCOL_BYTES) stdout.push(chunk)
      else abort()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.reduce((sum, item) => sum + item.byteLength, 0) < 64 * 1024) stderr.push(chunk)
    })
    child.stdin?.end(JSON.stringify({
      workspaceRoot: input.workspaceRoot,
      inputPath: input.inputPath,
      outputDirectory: input.outputDirectory
    }))
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      child?.once('error', reject)
      child?.once('exit', resolveExit)
    })
    if (input.signal.aborted) throw new DocumentEngineError('Document parsing was cancelled.', 'document_parse_cancelled')
    if (bytes > MAX_PROTOCOL_BYTES) throw new DocumentEngineError('Parser response exceeded the result limit.', 'resource_limit')
    const text = Buffer.concat(stdout).toString('utf8').trim()
    let response: DocumentSidecarResponse
    try {
      response = JSON.parse(text) as DocumentSidecarResponse
    } catch {
      throw new DocumentEngineError(
        `Document parser exited with ${exitCode ?? 'unknown'}: ${Buffer.concat(stderr).toString('utf8').slice(0, 240)}`,
        'document_parse_failed'
      )
    }
    if (exitCode !== 0 || !response.ok) {
      throw new DocumentEngineError(response.message || 'Document parser failed.', 'document_parse_failed')
    }
    return response
  } finally {
    input.signal.removeEventListener('abort', abort)
  }
}

export function documentDisplayName(path: string): string {
  return basename(path)
}

export function documentRelativePath(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, path).replaceAll('\\', '/')
}
