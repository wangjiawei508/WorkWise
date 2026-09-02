import type { ThreadStore, ThreadStoreListOptions } from '../ports/thread-store.js'
import type { ThreadRecord, ThreadSummary } from '../contracts/threads.js'
import { toThreadSummary } from '../domain/thread.js'

/**
 * In-memory thread store. Used by tests and the file-backed
 * implementation is layered on top in section 3.4.
 */
export class InMemoryThreadStore implements ThreadStore {
  private readonly threads = new Map<string, ThreadRecord>()

  async list(options: ThreadStoreListOptions = {}): Promise<ThreadSummary[]> {
    let summaries = [...this.threads.values()]
      .map(toThreadSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    if (options.domain) summaries = summaries.filter((thread) => thread.domain === options.domain)
    if (options.projectId) summaries = summaries.filter((thread) => thread.projectId === options.projectId)
    if (options.archivedOnly) summaries = summaries.filter((thread) => thread.status === 'archived')
    else if (!options.includeArchived) summaries = summaries.filter((thread) => thread.status !== 'archived' && thread.status !== 'deleted')
    if (!options.includeSide) summaries = summaries.filter((thread) => (thread.relation ?? 'primary') !== 'side')
    return typeof options.limit === 'number' ? summaries.slice(0, options.limit) : summaries
  }

  async get(threadId: string): Promise<ThreadRecord | null> {
    return this.threads.get(threadId) ?? null
  }

  async upsert(thread: ThreadRecord): Promise<ThreadRecord> {
    this.threads.set(thread.id, thread)
    return thread
  }

  async delete(threadId: string): Promise<boolean> {
    return this.threads.delete(threadId)
  }
}
