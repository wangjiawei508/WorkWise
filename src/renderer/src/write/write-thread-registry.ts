import type { NormalizedThread } from '../agent/types'
import { browserStorage, type BrowserStorageLike } from '../lib/browser-storage'
import { normalizeWorkspaceRoot } from '../lib/workspace-path'
import { WRITE_CONTEXT_HEADING } from './quoted-selection'

export const WRITE_ASSISTANT_THREAD_TITLE = 'Write Assistant'
export const MAX_WRITE_THREAD_IDS_PER_WORKSPACE = 20
export const MAX_WRITE_THREAD_REGISTRY_WORKSPACES = 80

export type WriteThreadWorkspaceRecord = {
  activeThreadId: string
  threadIds: string[]
  archived?: boolean
}

export type WriteThreadRegistry = {
  version: 2
  workspaces: Record<string, WriteThreadWorkspaceRecord>
  files: Record<string, WriteThreadWorkspaceRecord>
}

type WriteThreadCandidate = Pick<NormalizedThread, 'id' | 'workspace'> &
  Partial<Pick<NormalizedThread, 'title' | 'updatedAt' | 'archived'>>

const WRITE_THREAD_REGISTRY_KEY = 'workwise.write.threadRegistry.v2'
const LEGACY_WRITE_THREAD_REGISTRY_KEY = 'workwise.write.threadRegistry.v1'

export function emptyWriteThreadRegistry(): WriteThreadRegistry {
  return { version: 2, workspaces: {}, files: {} }
}

export function writeWorkspaceKey(workspaceRoot: string | undefined | null): string {
  return normalizeWorkspaceRoot(workspaceRoot ?? '')
}

export function writeFileContextKey(
  workspaceRoot: string | undefined | null,
  filePath: string | undefined | null
): string {
  const workspace = writeWorkspaceKey(workspaceRoot)
  if (!workspace) return ''
  const normalizedFile = normalizeWorkspaceRoot(filePath ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
  return `${workspace}::${normalizedFile || '@scratch'}`
}

function normalizeWriteWorkspacePathForMatch(workspaceRoot: string | undefined | null): string {
  return writeWorkspaceKey(workspaceRoot)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function homeRelativeSuffix(workspaceRoot: string): string {
  const normalized = normalizeWriteWorkspacePathForMatch(workspaceRoot)
  if (normalized === '~') return ''
  return normalized.startsWith('~/') ? normalized.slice(1) : ''
}

function writeWorkspacePathsMatch(
  left: string | undefined | null,
  right: string | undefined | null
): boolean {
  const a = normalizeWriteWorkspacePathForMatch(left)
  const b = normalizeWriteWorkspacePathForMatch(right)
  if (!a || !b) return false
  if (a === b) return true
  const aHomeSuffix = homeRelativeSuffix(a)
  if (aHomeSuffix && b.endsWith(aHomeSuffix)) return true
  const bHomeSuffix = homeRelativeSuffix(b)
  return Boolean(bHomeSuffix && a.endsWith(bHomeSuffix))
}

function writeAssistantTitleMatches(title: string | undefined): boolean {
  return title?.trim() === WRITE_ASSISTANT_THREAD_TITLE
}

function writeContextTitleMatches(title: string | undefined): boolean {
  return title?.trim().startsWith(WRITE_CONTEXT_HEADING) === true
}

function updatedAtMs(thread: WriteThreadCandidate): number {
  const value = typeof thread.updatedAt === 'string' ? Date.parse(thread.updatedAt) : Number.NaN
  return Number.isFinite(value) ? value : 0
}

export function writeThreadLooksLikeAssistant(
  thread: WriteThreadCandidate,
  writeWorkspaceRoots: string[]
): boolean {
  if (!thread.id?.trim()) return false
  const titleMatches = writeAssistantTitleMatches(thread.title) || writeContextTitleMatches(thread.title)
  if (!titleMatches) return false
  const workspaceKey = writeWorkspaceKey(thread.workspace)
  if (!workspaceKey) return writeContextTitleMatches(thread.title)
  const workspaceMatches = writeWorkspaceRoots.some((workspaceRoot) =>
    writeWorkspacePathsMatch(workspaceKey, workspaceRoot)
  )
  return workspaceMatches || writeContextTitleMatches(thread.title)
}

function normalizeThreadIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const ordered = new Set<string>()
  for (const id of ids) {
    if (typeof id === 'string' && id.trim()) ordered.add(id.trim())
  }
  return [...ordered].slice(0, MAX_WRITE_THREAD_IDS_PER_WORKSPACE)
}

function trimRegistryWorkspaces(
  workspaces: WriteThreadRegistry['workspaces']
): WriteThreadRegistry['workspaces'] {
  return Object.fromEntries(
    Object.entries(workspaces).slice(-MAX_WRITE_THREAD_REGISTRY_WORKSPACES)
  )
}

export function normalizeWriteThreadRegistry(raw: unknown): WriteThreadRegistry {
  if (!raw || typeof raw !== 'object') return emptyWriteThreadRegistry()
  const source = raw as { workspaces?: unknown; files?: unknown }
  if (!source.workspaces || typeof source.workspaces !== 'object') return emptyWriteThreadRegistry()

  const normalizeRecords = (
    records: Record<string, unknown>,
    keyFor: (key: string) => string
  ): Record<string, WriteThreadWorkspaceRecord> => {
    const normalized: Record<string, WriteThreadWorkspaceRecord> = {}
    for (const [rawKey, value] of Object.entries(records)) {
    const key = keyFor(rawKey)
    if (!key || !value || typeof value !== 'object') continue
    const record = value as { activeThreadId?: unknown; threadIds?: unknown; archived?: unknown }
    const threadIds = normalizeThreadIds(record.threadIds)
    const activeThreadId =
      typeof record.activeThreadId === 'string' && record.activeThreadId.trim()
        ? record.activeThreadId.trim()
        : threadIds[0] ?? ''
    const nextIds = activeThreadId
      ? [activeThreadId, ...threadIds.filter((id) => id !== activeThreadId)]
      : threadIds
    const cappedIds = nextIds.slice(0, MAX_WRITE_THREAD_IDS_PER_WORKSPACE)
    if (cappedIds.length > 0) {
      normalized[key] = {
        activeThreadId: cappedIds[0],
        threadIds: cappedIds,
        ...(record.archived === true ? { archived: true } : {})
      }
    }
  }
    return normalized
  }
  const workspaces = normalizeRecords(
    source.workspaces as Record<string, unknown>,
    (key) => writeWorkspaceKey(key)
  )
  const files = source.files && typeof source.files === 'object'
    ? normalizeRecords(source.files as Record<string, unknown>, (key) => key.trim())
    : Object.fromEntries(
        Object.entries(workspaces).map(([workspace, record]) => [
          writeFileContextKey(workspace, null),
          record
        ])
      )
  return {
    version: 2,
    workspaces: trimRegistryWorkspaces(workspaces),
    files: trimRegistryWorkspaces(files)
  }
}

export function readWriteThreadRegistry(storage: BrowserStorageLike | null = browserStorage()): WriteThreadRegistry {
  if (!storage) return emptyWriteThreadRegistry()
  try {
    const raw = storage.getItem(WRITE_THREAD_REGISTRY_KEY) ?? storage.getItem(LEGACY_WRITE_THREAD_REGISTRY_KEY)
    return normalizeWriteThreadRegistry(raw ? JSON.parse(raw) : null)
  } catch {
    return emptyWriteThreadRegistry()
  }
}

export function saveWriteThreadRegistry(
  registry: WriteThreadRegistry,
  storage: BrowserStorageLike | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(WRITE_THREAD_REGISTRY_KEY, JSON.stringify(normalizeWriteThreadRegistry(registry)))
  } catch {
    /* ignore storage failures */
  }
}

export function writeThreadIds(registry: WriteThreadRegistry = readWriteThreadRegistry()): Set<string> {
  const ids = new Set<string>()
  for (const record of Object.values(registry.workspaces)) {
    for (const id of record.threadIds) ids.add(id)
  }
  for (const record of Object.values(registry.files)) {
    for (const id of record.threadIds) ids.add(id)
  }
  return ids
}

export function isWriteThreadId(
  threadId: string | null | undefined,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): boolean {
  return Boolean(threadId && writeThreadIds(registry).has(threadId))
}

export function writeWorkspaceForThreadId(
  threadId: string | null | undefined,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): string {
  const id = threadId?.trim() ?? ''
  if (!id) return ''
  for (const [workspaceRoot, record] of Object.entries(registry.workspaces)) {
    if (record.threadIds.includes(id)) return workspaceRoot
  }
  for (const [contextKey, record] of Object.entries(registry.files)) {
    if (record.threadIds.includes(id)) return contextKey.split('::', 1)[0] ?? ''
  }
  return ''
}

export function writeThreadBelongsToWorkspace(
  thread: Pick<NormalizedThread, 'id' | 'workspace'>,
  workspaceRoot: string,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): boolean {
  if (!isWriteThreadId(thread.id, registry)) return false
  const registeredWorkspace = writeWorkspaceForThreadId(thread.id, registry)
  return writeWorkspacePathsMatch(registeredWorkspace || thread.workspace, workspaceRoot)
}

export function hydrateWriteThreadRegistry(
  threads: WriteThreadCandidate[],
  writeWorkspaceRoots: string[],
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): WriteThreadRegistry {
  const normalized = normalizeWriteThreadRegistry(registry)
  const writeWorkspaceKeys = [
    ...new Set(writeWorkspaceRoots.map((workspaceRoot) => writeWorkspaceKey(workspaceRoot)).filter(Boolean))
  ]
  if (writeWorkspaceKeys.length === 0) return normalized

  const canonicalWriteWorkspaceKey = (workspaceRoot: string | undefined | null): string => (
    writeWorkspaceKeys.find((key) => writeWorkspacePathsMatch(workspaceRoot, key)) ??
    writeWorkspaceKey(workspaceRoot)
  )

  const inferredByWorkspace: Record<string, string[]> = {}
  const candidates = threads
    .filter((thread) => writeThreadLooksLikeAssistant(thread, writeWorkspaceKeys))
    .sort((a, b) => updatedAtMs(b) - updatedAtMs(a))

  for (const thread of candidates) {
    const workspaceKey = writeContextTitleMatches(thread.title)
      ? writeWorkspaceKeys.find((key) => writeWorkspacePathsMatch(thread.workspace, key)) ?? writeWorkspaceKeys[0] ?? ''
      : canonicalWriteWorkspaceKey(thread.workspace)
    const threadId = thread.id.trim()
    if (!workspaceKey || !threadId) continue
    const ids = inferredByWorkspace[workspaceKey] ?? []
    if (!ids.includes(threadId)) ids.push(threadId)
    inferredByWorkspace[workspaceKey] = ids
  }

  const workspaces: WriteThreadRegistry['workspaces'] = { ...normalized.workspaces }
  for (const [workspaceRoot, inferredIds] of Object.entries(inferredByWorkspace)) {
    const current = workspaces[workspaceRoot]
    const threadIds = [
      ...(current?.threadIds ?? []),
      ...inferredIds.filter((id) => !(current?.threadIds ?? []).includes(id))
    ]
    if (threadIds.length === 0) continue
    delete workspaces[workspaceRoot]
    workspaces[workspaceRoot] = {
      activeThreadId:
        current?.activeThreadId && threadIds.includes(current.activeThreadId)
          ? current.activeThreadId
          : threadIds[0],
      threadIds
    }
  }

  return normalizeWriteThreadRegistry({ ...normalized, version: 2, workspaces })
}

export function markWriteThread(
  workspaceRoot: string,
  threadId: string,
  registry: WriteThreadRegistry = readWriteThreadRegistry(),
  filePath?: string | null
): WriteThreadRegistry {
  const key = writeWorkspaceKey(workspaceRoot)
  const id = threadId.trim()
  if (!key || !id) return registry
  const record = registry.workspaces[key] ?? { activeThreadId: '', threadIds: [] }
  const threadIds = [id, ...record.threadIds.filter((item) => item !== id)]
  const workspaces = { ...registry.workspaces }
  const contextKey = writeFileContextKey(workspaceRoot, filePath)
  const contextRecord = registry.files[contextKey] ?? { activeThreadId: '', threadIds: [] }
  const contextThreadIds = [id, ...contextRecord.threadIds.filter((item) => item !== id)]
  delete workspaces[key]
  return normalizeWriteThreadRegistry({
    ...registry,
    workspaces: {
      ...workspaces,
      [key]: { activeThreadId: id, threadIds }
    },
    files: {
      ...registry.files,
      [contextKey]: { activeThreadId: id, threadIds: contextThreadIds }
    }
  })
}

export function forgetWriteThread(
  threadId: string,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): WriteThreadRegistry {
  const id = threadId.trim()
  if (!id) return registry
  const workspaces: WriteThreadRegistry['workspaces'] = {}
  for (const [workspaceRoot, record] of Object.entries(registry.workspaces)) {
    const threadIds = record.threadIds.filter((item) => item !== id)
    if (threadIds.length === 0) continue
    workspaces[workspaceRoot] = {
      activeThreadId: record.activeThreadId === id ? threadIds[0] : record.activeThreadId,
      threadIds
    }
  }
  const files: WriteThreadRegistry['files'] = {}
  for (const [contextKey, record] of Object.entries(registry.files)) {
    const threadIds = record.threadIds.filter((item) => item !== id)
    if (threadIds.length === 0) continue
    files[contextKey] = {
      activeThreadId: record.activeThreadId === id ? threadIds[0] : record.activeThreadId,
      threadIds,
      ...(record.archived ? { archived: true } : {})
    }
  }
  return normalizeWriteThreadRegistry({ version: 2, workspaces, files })
}

export function pruneWriteThreadRegistry(
  threads: Pick<NormalizedThread, 'id' | 'workspace'>[],
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): WriteThreadRegistry {
  const known = new Set(threads.map((thread) => thread.id))
  const workspaces: WriteThreadRegistry['workspaces'] = {}
  for (const [workspaceRoot, record] of Object.entries(registry.workspaces)) {
    const threadIds = record.threadIds.filter((id) => known.has(id))
    if (threadIds.length === 0) continue
    const activeThreadId = threadIds.includes(record.activeThreadId)
      ? record.activeThreadId
      : threadIds[0]
    workspaces[workspaceRoot] = { activeThreadId, threadIds }
  }
  const files: WriteThreadRegistry['files'] = {}
  for (const [contextKey, record] of Object.entries(registry.files)) {
    const threadIds = record.threadIds.filter((id) => known.has(id))
    if (threadIds.length === 0) continue
    files[contextKey] = {
      activeThreadId: threadIds.includes(record.activeThreadId) ? record.activeThreadId : threadIds[0],
      threadIds,
      ...(record.archived ? { archived: true } : {})
    }
  }
  return normalizeWriteThreadRegistry({ version: 2, workspaces, files })
}

export function activeWriteThreadForWorkspace(
  workspaceRoot: string,
  threads: NormalizedThread[],
  registry: WriteThreadRegistry = readWriteThreadRegistry(),
  filePath?: string | null
): NormalizedThread | null {
  const key = writeWorkspaceKey(workspaceRoot)
  if (!key) return null
  const fileRecord = registry.files[writeFileContextKey(workspaceRoot, filePath)]
  const record = filePath === undefined ? registry.workspaces[key] : fileRecord
  if (!record || record.archived) return null
  const candidates = record.threadIds
    .map((id) => threads.find((thread) => thread.id === id) ?? null)
    .filter((thread): thread is NormalizedThread => Boolean(thread))
    .filter((thread) => thread.archived !== true)
    .filter((thread) =>
      writeWorkspacePathsMatch(writeWorkspaceForThreadId(thread.id, registry) || thread.workspace, key)
    )
  return candidates.find((thread) => thread.id === record.activeThreadId) ?? candidates[0] ?? null
}

export function writeThreadMatchesFileContext(
  threadId: string,
  workspaceRoot: string,
  filePath: string | null | undefined,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): boolean {
  const record = registry.files[writeFileContextKey(workspaceRoot, filePath)]
  return Boolean(record && !record.archived && record.threadIds.includes(threadId))
}

export function moveWriteFileContext(
  workspaceRoot: string,
  previousPath: string,
  nextPath: string,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): WriteThreadRegistry {
  const previous = writeFileContextKey(workspaceRoot, previousPath)
  const next = writeFileContextKey(workspaceRoot, nextPath)
  const record = registry.files[previous]
  if (!record || previous === next) return registry
  const files = { ...registry.files }
  delete files[previous]
  files[next] = { ...record, archived: false }
  return normalizeWriteThreadRegistry({ ...registry, files })
}

export function archiveWriteFileContext(
  workspaceRoot: string,
  filePath: string,
  registry: WriteThreadRegistry = readWriteThreadRegistry()
): WriteThreadRegistry {
  const key = writeFileContextKey(workspaceRoot, filePath)
  const record = registry.files[key]
  if (!record) return registry
  return normalizeWriteThreadRegistry({
    ...registry,
    files: { ...registry.files, [key]: { ...record, archived: true } }
  })
}
