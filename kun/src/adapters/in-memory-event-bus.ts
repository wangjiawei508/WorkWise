import type { EventBus } from '../ports/event-bus.js'
import type { RuntimeEvent } from '../contracts/events.js'

/**
 * Retained events per thread for `snapshotSince`. SSE replay reads the
 * persisted session store, not the bus, so the bus only needs a recent
 * tail — retaining every event leaked the full delta stream of every
 * long-running thread into memory.
 */
const MAX_RETAINED_EVENTS_PER_THREAD = 256

/**
 * In-memory implementation of the event bus used by tests and the
 * default runtime. Subscribers receive only events for their thread.
 * Live fan-out is the bus's job; durable replay belongs to the
 * session store.
 */
export class InMemoryEventBus implements EventBus {
  private readonly events = new Map<string, RuntimeEvent[]>()
  private readonly subscribers = new Map<string, Set<(event: RuntimeEvent) => void>>()
  private nextSeq = new Map<string, number>()
  private highestSeqByThread = new Map<string, number>()

  publish(event: RuntimeEvent): void {
    const list = this.events.get(event.threadId) ?? []
    list.push(event)
    if (list.length > MAX_RETAINED_EVENTS_PER_THREAD) {
      list.splice(0, list.length - MAX_RETAINED_EVENTS_PER_THREAD)
    }
    this.events.set(event.threadId, list)
    const highest = this.highestSeqByThread.get(event.threadId) ?? 0
    if (event.seq > highest) this.highestSeqByThread.set(event.threadId, event.seq)
    const subscribers = this.subscribers.get(event.threadId)
    if (!subscribers) return
    for (const handler of subscribers) {
      try {
        handler(event)
      } catch {
        // Subscribers should not throw; isolate failures so publishing continues.
      }
    }
  }

  subscribe(threadId: string, handler: (event: RuntimeEvent) => void): () => void {
    const set = this.subscribers.get(threadId) ?? new Set()
    set.add(handler)
    this.subscribers.set(threadId, set)
    return () => {
      set.delete(handler)
    }
  }

  snapshotSince(threadId: string, sinceSeq: number): RuntimeEvent[] {
    const list = this.events.get(threadId) ?? []
    return list.filter((event) => event.seq > sinceSeq)
  }

  highestSeq(threadId: string): number {
    return this.highestSeqByThread.get(threadId) ?? 0
  }

  /** Returns the next per-thread `seq` value, allocating one if needed. */
  allocateSeq(threadId: string): number {
    const next = (this.nextSeq.get(threadId) ?? this.highestSeq(threadId)) + 1
    this.nextSeq.set(threadId, next)
    return next
  }

  reset(): void {
    this.events.clear()
    this.subscribers.clear()
    this.nextSeq.clear()
    this.highestSeqByThread.clear()
  }
}
