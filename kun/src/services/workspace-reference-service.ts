import { lstat, readdir, realpath } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  WorkspaceReference,
  WorkspaceReferenceSearchEntry,
  WorkspaceReferenceSearchResponse
} from '../contracts/workspace-references.js'

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.next',
  '.svn',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out'
])

type WorkspaceReferenceIndex = {
  entries: WorkspaceReferenceSearchEntry[]
  truncated: boolean
  indexedAt: string
  loadedAtMs: number
}

export type WorkspaceReferenceServiceOptions = {
  ttlMs?: number
  maxEntries?: number
  maxDepth?: number
  ignoredDirectories?: ReadonlySet<string>
  nowMs?: () => number
  nowIso?: () => string
  readDirectory?: (path: string) => Promise<Dirent[]>
}

export class WorkspaceReferenceService {
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly maxDepth: number
  private readonly ignoredDirectories: ReadonlySet<string>
  private readonly nowMs: () => number
  private readonly nowIso: () => string
  private readonly readDirectory: (path: string) => Promise<Dirent[]>
  private readonly cache = new Map<string, WorkspaceReferenceIndex | Promise<WorkspaceReferenceIndex>>()

  constructor(options: WorkspaceReferenceServiceOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000
    this.maxEntries = options.maxEntries ?? 5_000
    this.maxDepth = options.maxDepth ?? 8
    this.ignoredDirectories = options.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES
    this.nowMs = options.nowMs ?? Date.now
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    this.readDirectory = options.readDirectory ?? ((path) => readdir(path, { withFileTypes: true }))
  }

  async search(input: {
    workspaceRoot: string
    query?: string
    limit?: number
  }): Promise<WorkspaceReferenceSearchResponse> {
    const root = await this.canonicalWorkspaceRoot(input.workspaceRoot)
    const index = await this.loadIndex(root)
    const query = normalizeRelativePath(input.query ?? '').toLocaleLowerCase()
    const limit = Math.max(1, Math.min(50, input.limit ?? 20))
    const entries = index.entries
      .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) =>
        right.score - left.score ||
        left.entry.path.length - right.entry.path.length ||
        left.entry.path.localeCompare(right.entry.path)
      )
      .slice(0, limit)
      .map(({ entry }) => entry)
    return {
      entries,
      truncated: index.truncated || entries.length < index.entries.filter((entry) => scoreEntry(entry, query) > 0).length,
      indexedAt: index.indexedAt
    }
  }

  async validateReferences(
    workspaceRoot: string,
    references: readonly WorkspaceReference[]
  ): Promise<WorkspaceReference[]> {
    if (references.length > 32) {
      throw workspaceReferenceError('workspace reference limit exceeded')
    }
    const root = await this.canonicalWorkspaceRoot(workspaceRoot)
    const seen = new Set<string>()
    const validated: WorkspaceReference[] = []
    for (const reference of references) {
      const rawPath = reference.path.trim().replaceAll('\\', '/')
      if (
        !rawPath ||
        isAbsolute(rawPath) ||
        /^[A-Za-z]:\//u.test(rawPath) ||
        rawPath.includes('\0') ||
        rawPath.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
      ) {
        throw workspaceReferenceError(`workspace reference escapes the workspace: ${reference.path}`)
      }
      const path = normalizeRelativePath(rawPath)
      const key = `${reference.kind}:${path}`
      if (seen.has(key)) continue
      const absolutePath = resolve(root, ...path.split('/'))
      assertInsideWorkspace(root, absolutePath)
      await this.rejectSymlinkPath(root, path)
      const canonicalPath = await realpath(absolutePath).catch(() => {
        throw workspaceReferenceError(`workspace reference does not exist: ${path}`)
      })
      assertInsideWorkspace(root, canonicalPath)
      const stat = await lstat(absolutePath)
      const actualKind = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : null
      if (!actualKind || actualKind !== reference.kind) {
        throw workspaceReferenceError(`workspace reference kind mismatch: ${path}`)
      }
      seen.add(key)
      validated.push({ path, kind: actualKind })
    }
    return validated
  }

  async invalidate(workspaceRoot?: string): Promise<void> {
    if (!workspaceRoot) {
      this.cache.clear()
      return
    }
    const root = await this.canonicalWorkspaceRoot(workspaceRoot)
    this.cache.delete(root)
  }

  private async canonicalWorkspaceRoot(workspaceRoot: string): Promise<string> {
    if (!workspaceRoot.trim()) throw workspaceReferenceError('workspace root is required')
    const root = await realpath(resolve(workspaceRoot)).catch(() => {
      throw workspaceReferenceError('workspace root does not exist')
    })
    const stat = await lstat(root)
    if (!stat.isDirectory()) throw workspaceReferenceError('workspace root must be a directory')
    return root
  }

  private async loadIndex(root: string): Promise<WorkspaceReferenceIndex> {
    const cached = this.cache.get(root)
    if (cached instanceof Promise) return cached
    if (cached && this.nowMs() - cached.loadedAtMs < this.ttlMs) return cached

    const task = this.buildIndex(root)
    this.cache.set(root, task)
    try {
      const index = await task
      this.cache.set(root, index)
      return index
    } catch (error) {
      this.cache.delete(root)
      throw error
    }
  }

  private async buildIndex(root: string): Promise<WorkspaceReferenceIndex> {
    const entries: WorkspaceReferenceSearchEntry[] = []
    const queue: Array<{ absolutePath: string; relativePath: string; depth: number }> = [
      { absolutePath: root, relativePath: '', depth: 0 }
    ]
    let truncated = false
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) break
      const children = await this.readDirectory(current.absolutePath).catch(() => {
        truncated = true
        return []
      })
      children.sort((left, right) => left.name.localeCompare(right.name))
      for (const child of children) {
        if (child.isSymbolicLink()) continue
        const path = current.relativePath ? `${current.relativePath}/${child.name}` : child.name
        if (child.isDirectory() && this.ignoredDirectories.has(child.name.toLocaleLowerCase())) continue
        const kind = child.isDirectory() ? 'directory' : child.isFile() ? 'file' : null
        if (!kind) continue
        if (entries.length >= this.maxEntries) {
          truncated = true
          queue.length = 0
          break
        }
        const depth = current.depth + 1
        entries.push({ path, name: child.name, kind, depth })
        if (kind === 'directory') {
          if (depth < this.maxDepth) {
            queue.push({ absolutePath: resolve(current.absolutePath, child.name), relativePath: path, depth })
          } else {
            truncated = true
          }
        }
      }
    }
    return {
      entries,
      truncated,
      indexedAt: this.nowIso(),
      loadedAtMs: this.nowMs()
    }
  }

  private async rejectSymlinkPath(root: string, path: string): Promise<void> {
    let current = root
    for (const segment of path.split('/')) {
      current = resolve(current, segment)
      const stat = await lstat(current).catch(() => {
        throw workspaceReferenceError(`workspace reference does not exist: ${path}`)
      })
      if (stat.isSymbolicLink()) {
        throw workspaceReferenceError(`workspace reference must not traverse a symlink: ${path}`)
      }
    }
  }
}

function normalizeRelativePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/{2,}/gu, '/')
}

function assertInsideWorkspace(root: string, candidate: string): void {
  const offset = relative(root, candidate)
  if (offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))) return
  throw workspaceReferenceError('workspace reference escapes the workspace')
}

function scoreEntry(entry: WorkspaceReferenceSearchEntry, query: string): number {
  if (!query) return entry.kind === 'directory' ? 2 : 1
  const name = entry.name.toLocaleLowerCase()
  const path = entry.path.toLocaleLowerCase()
  if (path === query) return 100
  if (name === query) return 95
  if (path.startsWith(query)) return 80
  if (name.startsWith(query)) return 70
  if (path.includes(`/${query}`)) return 55
  if (name.includes(query)) return 40
  if (path.includes(query)) return 25
  return 0
}

function workspaceReferenceError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'workspace_reference_invalid' })
}
