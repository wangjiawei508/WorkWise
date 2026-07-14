import type { CancellationRef, CancellationScope } from '../shared/cancellation'

type Cleanup = (reason: string) => void | Promise<void>
type Entry = {
  ref: CancellationRef
  controller: AbortController
  parent?: string
  children: Set<string>
  cleanups: Set<Cleanup>
  cancelPromise?: Promise<number>
}

function key(ref: CancellationRef): string {
  return `${ref.scope}:${ref.id}`
}

export class CancellationRegistry {
  private readonly entries = new Map<string, Entry>()

  register(
    ref: CancellationRef,
    options: { parent?: CancellationRef; cleanup?: Cleanup } = {}
  ): { signal: AbortSignal; addCleanup: (cleanup: Cleanup) => () => void; release: () => void } {
    const entry = this.ensure(ref)
    if (options.parent) {
      const parent = this.ensure(options.parent)
      entry.parent = key(parent.ref)
      parent.children.add(key(ref))
      if (parent.controller.signal.aborted && !entry.controller.signal.aborted) {
        entry.controller.abort(parent.controller.signal.reason)
      }
    }
    if (options.cleanup) entry.cleanups.add(options.cleanup)
    return {
      signal: entry.controller.signal,
      addCleanup: (cleanup) => {
        entry.cleanups.add(cleanup)
        return () => entry.cleanups.delete(cleanup)
      },
      release: () => { this.release(ref) }
    }
  }

  signal(scope: CancellationScope, id: string): AbortSignal | undefined {
    return this.entries.get(key({ scope, id }))?.controller.signal
  }

  async cancel(ref: CancellationRef, reason = 'operation_cancelled'): Promise<number> {
    const entry = this.entries.get(key(ref))
    if (!entry) return 0
    if (entry.cancelPromise) return entry.cancelPromise
    entry.cancelPromise = this.cancelEntry(entry, reason)
    return entry.cancelPromise
  }

  async cancelAll(reason = 'application_exit'): Promise<number> {
    const roots = [...this.entries.values()].filter((entry) => !entry.parent)
    const counts = await Promise.all(roots.map((entry) => this.cancel(entry.ref, reason)))
    return counts.reduce((total, value) => total + value, 0)
  }

  size(): number {
    return this.entries.size
  }

  release(ref: CancellationRef): boolean {
    const entryKey = key(ref)
    const entry = this.entries.get(entryKey)
    if (!entry || entry.children.size > 0) return false
    if (entry.parent) this.entries.get(entry.parent)?.children.delete(entryKey)
    this.entries.delete(entryKey)
    return true
  }

  private ensure(ref: CancellationRef): Entry {
    const entryKey = key(ref)
    const existing = this.entries.get(entryKey)
    if (existing) return existing
    const entry: Entry = {
      ref: { ...ref },
      controller: new AbortController(),
      children: new Set(),
      cleanups: new Set()
    }
    this.entries.set(entryKey, entry)
    return entry
  }

  private async cancelEntry(entry: Entry, reason: string): Promise<number> {
    if (!entry.controller.signal.aborted) entry.controller.abort(reason)
    const childCounts = await Promise.all(
      [...entry.children]
        .map((childKey) => this.entries.get(childKey))
        .filter((child): child is Entry => Boolean(child))
        .map((child) => this.cancel(child.ref, reason))
    )
    await Promise.allSettled([...entry.cleanups].reverse().map((cleanup) => cleanup(reason)))
    const count = 1 + childCounts.reduce((total, value) => total + value, 0)
    entry.cleanups.clear()
    entry.children.clear()
    if (entry.parent) this.entries.get(entry.parent)?.children.delete(key(entry.ref))
    this.entries.delete(key(entry.ref))
    return count
  }
}

export const appCancellationRegistry = new CancellationRegistry()
appCancellationRegistry.register({ scope: 'app', id: 'app' })
