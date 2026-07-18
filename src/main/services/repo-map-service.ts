import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import * as ts from 'typescript'
import type { LspRequestV1, LspResponseV1, RepoMapResultV1 } from '../../shared/agent-workbench'
import { atomicWriteFile, readRecoveredFile } from './durable-file'
import { canonicalizeContainmentRoot, resolveContainedPath } from './canonical-containment'

const execFileAsync = promisify(execFile)
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const MAX_FILES = 4_000
const MAX_BYTES = 20 * 1024 * 1024
const MAX_DURATION_MS = 5_000

type RepoMapCache = {
  result: RepoMapResultV1
  absoluteFiles: string[]
}

export type BuildRepoMapRequest = {
  workspaceRoot: string
  repositoryRoot: string
  maxFiles?: number
  maxBytes?: number
  maxDurationMs?: number
  idempotencyKey: string
}

export type QueryRepoMapRequest = {
  repositoryRoot: string
  query: string
  limit?: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function scriptKind(path: string): ts.ScriptKind {
  const extension = extname(path).toLowerCase()
  if (extension === '.tsx') return ts.ScriptKind.TSX
  if (extension === '.jsx') return ts.ScriptKind.JSX
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function lineColumn(source: ts.SourceFile, position: number): { line: number; column: number } {
  const point = source.getLineAndCharacterOfPosition(position)
  return { line: point.line + 1, column: point.character + 1 }
}

function isExported(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  )
}

function declarationName(node: ts.Node): string | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) return node.name?.getText() ?? null
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text
  return null
}

function declarationKind(node: ts.Node): string {
  if (ts.isFunctionDeclaration(node)) return 'function'
  if (ts.isClassDeclaration(node)) return 'class'
  if (ts.isInterfaceDeclaration(node)) return 'interface'
  if (ts.isTypeAliasDeclaration(node)) return 'type'
  if (ts.isEnumDeclaration(node)) return 'enum'
  if (ts.isModuleDeclaration(node)) return 'namespace'
  if (ts.isVariableDeclaration(node)) return 'variable'
  return 'symbol'
}

export class RepoMapService {
  private readonly cacheRoot: string
  private readonly maps = new Map<string, RepoMapCache>()

  constructor(cacheRoot = join(homedir(), '.workwise', 'cache', 'repo-map')) {
    this.cacheRoot = resolve(cacheRoot)
  }

  async build(request: BuildRepoMapRequest): Promise<RepoMapResultV1> {
    const workspaceRoot = await canonicalizeContainmentRoot(request.workspaceRoot)
    const repositoryCandidate = await canonicalizeContainmentRoot(request.repositoryRoot)
    const repositoryRoot = await resolveContainedPath({
      root: workspaceRoot,
      target: repositoryCandidate,
      allowRoot: true,
      mustExist: true,
      expect: 'directory'
    })
    const maxFiles = Math.min(Math.max(request.maxFiles ?? MAX_FILES, 1), MAX_FILES)
    const maxBytes = Math.min(Math.max(request.maxBytes ?? MAX_BYTES, 1), MAX_BYTES)
    const maxDurationMs = Math.min(Math.max(request.maxDurationMs ?? MAX_DURATION_MS, 250), MAX_DURATION_MS)
    const startedAt = Date.now()
    const [head, listed] = await Promise.all([
      this.git(repositoryRoot, ['rev-parse', 'HEAD']).then((value) => value.trim()).catch(() => 'no-head'),
      this.git(repositoryRoot, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    ])
    const candidates = listed.split('\0').filter((path) => SOURCE_EXTENSIONS.has(extname(path).toLowerCase()))
    const metadata: Array<{ relativePath: string; absolutePath: string; size: number; mtimeMs: number }> = []
    let totalBytes = 0
    let truncated = false
    for (const relativePath of candidates) {
      if (metadata.length >= maxFiles || totalBytes >= maxBytes || Date.now() - startedAt >= maxDurationMs) {
        truncated = true
        break
      }
      const absolutePath = await resolveContainedPath({ root: repositoryRoot, target: relativePath })
      const info = await stat(absolutePath).catch(() => null)
      if (!info?.isFile() || info.size > 2 * 1024 * 1024 || totalBytes + info.size > maxBytes) {
        if (info?.isFile()) truncated = true
        continue
      }
      metadata.push({ relativePath: relativePath.replaceAll('\\', '/'), absolutePath, size: info.size, mtimeMs: info.mtimeMs })
      totalBytes += info.size
    }
    const cacheKey = sha256(JSON.stringify({
      head,
      limits: { maxFiles, maxBytes, maxDurationMs },
      files: metadata.map((file) => [file.relativePath, file.size, Math.trunc(file.mtimeMs)])
    }))
    const memoryCached = this.maps.get(repositoryRoot)
    if (memoryCached?.result.cacheKey === cacheKey) return memoryCached.result
    const diskCached = await this.readCache(cacheKey).catch(() => null)
    if (diskCached) {
      this.maps.set(repositoryRoot, { result: diskCached, absoluteFiles: metadata.map((file) => file.absolutePath) })
      return diskCached
    }

    const symbols: RepoMapResultV1['symbols'] = []
    const imports: RepoMapResultV1['imports'] = []
    for (const file of metadata) {
      if (Date.now() - startedAt >= maxDurationMs) {
        truncated = true
        break
      }
      const sourceText = await readFile(file.absolutePath, 'utf8').catch(() => '')
      const source = ts.createSourceFile(file.absolutePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(file.absolutePath))
      const visit = (node: ts.Node): void => {
        const name = declarationName(node)
        if (name) {
          const point = lineColumn(source, node.getStart(source))
          symbols.push({
            name,
            kind: declarationKind(node),
            relativePath: file.relativePath,
            line: point.line,
            exported: isExported(node) || (ts.isVariableDeclaration(node) && isExported(node.parent.parent))
          })
        }
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push({ from: file.relativePath, to: node.moduleSpecifier.text })
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    const result: RepoMapResultV1 = {
      repositoryRoot,
      cacheKey,
      filesIndexed: metadata.length,
      bytesIndexed: totalBytes,
      truncated,
      symbols,
      imports
    }
    this.maps.set(repositoryRoot, { result, absoluteFiles: metadata.map((file) => file.absolutePath) })
    await mkdir(this.cacheRoot, { recursive: true })
    await atomicWriteFile(join(this.cacheRoot, `${cacheKey}.json`), `${JSON.stringify(result)}\n`)
    return result
  }

  async query(request: QueryRepoMapRequest): Promise<RepoMapResultV1> {
    const repositoryRoot = await canonicalizeContainmentRoot(request.repositoryRoot)
    const cached = this.maps.get(repositoryRoot)
    if (!cached) throw Object.assign(new Error('Repo Map has not been built for this repository.'), { code: 'not_found' })
    const query = request.query.trim().toLocaleLowerCase()
    const limit = Math.min(Math.max(request.limit ?? 100, 1), 500)
    return {
      ...cached.result,
      symbols: cached.result.symbols.filter((symbol) =>
        `${symbol.name} ${symbol.kind} ${symbol.relativePath}`.toLocaleLowerCase().includes(query)
      ).slice(0, limit),
      imports: cached.result.imports.filter((entry) =>
        `${entry.from} ${entry.to}`.toLocaleLowerCase().includes(query)
      ).slice(0, limit)
    }
  }

  async lsp(request: LspRequestV1): Promise<LspResponseV1> {
    const workspaceRoot = await canonicalizeContainmentRoot(request.workspaceRoot)
    const repositoryCandidate = await canonicalizeContainmentRoot(request.repositoryRoot)
    const repositoryRoot = await resolveContainedPath({
      root: workspaceRoot,
      target: repositoryCandidate,
      allowRoot: true,
      mustExist: true,
      expect: 'directory'
    })
    const cached = this.maps.get(repositoryRoot)
    if (!cached) throw Object.assign(new Error('Repo Map must be built before code queries.'), { code: 'not_found' })
    const target = await resolveContainedPath({ root: repositoryRoot, target: request.relativePath, mustExist: true, expect: 'file' })
    const files = cached.absoluteFiles
    const versions = new Map(files.map((file) => [file, '1']))
    const service = ts.createLanguageService({
      getCompilationSettings: () => ({
        allowJs: true,
        checkJs: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
        skipLibCheck: true
      }),
      getScriptFileNames: () => files,
      getScriptVersion: (fileName) => versions.get(fileName) ?? '0',
      getScriptSnapshot: (fileName) => {
        if (!ts.sys.fileExists(fileName)) return undefined
        return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName) ?? '')
      },
      getCurrentDirectory: () => repositoryRoot,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory
    })
    const source = service.getProgram()?.getSourceFile(target)
    if (!source) return { kind: request.kind, items: [], truncated: false }
    const line = Math.max(0, request.line - 1)
    const column = Math.max(0, request.column - 1)
    const position = source.getPositionOfLineAndCharacter(Math.min(line, source.getLineAndCharacterOfPosition(source.end).line), column)
    const rawItems = this.lspItems(service, request.kind, target, position)
    const items = rawItems.slice(0, 500).map((item) => {
      const itemSource = service.getProgram()?.getSourceFile(item.fileName)
      const point = itemSource ? lineColumn(itemSource, item.start) : { line: 1, column: 1 }
      const rel = relative(repositoryRoot, item.fileName)
      return {
        relativePath: isAbsolute(rel) || rel.startsWith('..') ? item.fileName : rel.replaceAll('\\', '/'),
        line: point.line,
        column: point.column,
        ...(item.detail.name ? { name: item.detail.name } : {}),
        ...(item.detail.kind ? { kind: item.detail.kind } : {}),
        ...(item.detail.text ? { text: item.detail.text } : {}),
        ...(item.detail.category ? { category: item.detail.category } : {})
      }
    })
    return { kind: request.kind, items, truncated: rawItems.length > items.length }
  }

  private lspItems(
    service: ts.LanguageService,
    kind: LspRequestV1['kind'],
    fileName: string,
    position: number
  ): Array<{
    fileName: string
    start: number
    detail: Pick<LspResponseV1['items'][number], 'name' | 'kind' | 'text' | 'category'>
  }> {
    if (kind === 'definition') {
      return (service.getDefinitionAtPosition(fileName, position) ?? []).map((item) => ({
        fileName: item.fileName,
        start: item.textSpan.start,
        detail: { name: item.name, kind: item.kind }
      }))
    }
    if (kind === 'references') {
      return (service.getReferencesAtPosition(fileName, position) ?? []).map((item) => ({
        fileName: item.fileName,
        start: item.textSpan.start,
        detail: {}
      }))
    }
    if (kind === 'symbols') {
      return service.getNavigationTree(fileName).childItems?.flatMap((item) => item.spans.map((span) => ({
        fileName,
        start: span.start,
        detail: { name: item.text, kind: item.kind }
      }))) ?? []
    }
    if (kind === 'diagnostics') {
      return [...service.getSyntacticDiagnostics(fileName), ...service.getSemanticDiagnostics(fileName)].map((item) => ({
        fileName: item.file?.fileName ?? fileName,
        start: item.start ?? 0,
        detail: {
          text: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
          category: ts.DiagnosticCategory[item.category]
        }
      }))
    }
    const info = service.getQuickInfoAtPosition(fileName, position)
    return info ? [{
      fileName,
      start: info.textSpan.start,
      detail: {
        kind: info.kind,
        text: ts.displayPartsToString(info.displayParts)
      }
    }] : []
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 20_000,
      maxBuffer: 32 * 1024 * 1024,
      encoding: 'utf8'
    })
    return String(stdout)
  }

  private async readCache(cacheKey: string): Promise<RepoMapResultV1> {
    return JSON.parse(await readRecoveredFile(join(this.cacheRoot, `${cacheKey}.json`))) as RepoMapResultV1
  }
}
