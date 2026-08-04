import { browserStorage, type BrowserStorageLike } from '../lib/browser-storage'

const DESIGN_THREAD_REGISTRY_KEY = 'workwise.design.threadRegistry.v1'
const MAX_DESIGN_THREAD_RECORDS = 200

export type DesignThreadRecord = {
  documentId: string
  threadId: string
  workspaceRoot: string
  updatedAt: string
}
export type DesignThreadRegistry = {
  version: 1
  documents: Record<string, DesignThreadRecord>
}

function emptyRegistry(): DesignThreadRegistry {
  return { version: 1, documents: {} }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeDesignThreadRegistry(raw: unknown): DesignThreadRegistry {
  if (!raw || typeof raw !== 'object') return emptyRegistry()
  const source = raw as { documents?: unknown }
  if (!source.documents || typeof source.documents !== 'object') return emptyRegistry()
  const records: DesignThreadRecord[] = []
  for (const [key, value] of Object.entries(source.documents as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Partial<DesignThreadRecord>
    const documentId = normalizeText(candidate.documentId) || normalizeText(key)
    const threadId = normalizeText(candidate.threadId)
    const workspaceRoot = normalizeText(candidate.workspaceRoot).replaceAll('\\', '/').replace(/\/+$/, '')
    if (!documentId || !threadId || !workspaceRoot) continue
    records.push({
      documentId,
      threadId,
      workspaceRoot,
      updatedAt: normalizeText(candidate.updatedAt) || new Date(0).toISOString()
    })
  }
  const documents = Object.fromEntries(
    records
      .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))
      .slice(-MAX_DESIGN_THREAD_RECORDS)
      .map((record) => [record.documentId, record])
  )
  return { version: 1, documents }
}

export function readDesignThreadRegistry(
  storage: BrowserStorageLike | null = browserStorage()
): DesignThreadRegistry {
  if (!storage) return emptyRegistry()
  try {
    const value = storage.getItem(DESIGN_THREAD_REGISTRY_KEY)
    return normalizeDesignThreadRegistry(value ? JSON.parse(value) : null)
  } catch {
    return emptyRegistry()
  }
}

export function saveDesignThreadRegistry(
  registry: DesignThreadRegistry,
  storage: BrowserStorageLike | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(DESIGN_THREAD_REGISTRY_KEY, JSON.stringify(normalizeDesignThreadRegistry(registry)))
  } catch {
    /* ignore storage failures */
  }
}

export function markDesignAssistantThread(
  documentId: string,
  threadId: string,
  workspaceRoot: string,
  storage: BrowserStorageLike | null = browserStorage()
): DesignThreadRegistry {
  const registry = readDesignThreadRegistry(storage)
  const normalizedDocumentId = documentId.trim()
  const normalizedThreadId = threadId.trim()
  const normalizedWorkspace = workspaceRoot.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  if (!normalizedDocumentId || !normalizedThreadId || !normalizedWorkspace) return registry
  const next = normalizeDesignThreadRegistry({
    version: 1,
    documents: {
      ...registry.documents,
      [normalizedDocumentId]: {
        documentId: normalizedDocumentId,
        threadId: normalizedThreadId,
        workspaceRoot: normalizedWorkspace,
        updatedAt: new Date().toISOString()
      }
    }
  })
  saveDesignThreadRegistry(next, storage)
  return next
}

export function designAssistantThreadIdForDocument(
  documentId: string,
  registry: DesignThreadRegistry = readDesignThreadRegistry()
): string {
  return registry.documents[documentId.trim()]?.threadId ?? ''
}

export function isDesignAssistantThreadId(
  threadId: string | null | undefined,
  registry: DesignThreadRegistry = readDesignThreadRegistry()
): boolean {
  const normalized = threadId?.trim() ?? ''
  return Boolean(normalized && Object.values(registry.documents).some((record) => record.threadId === normalized))
}
