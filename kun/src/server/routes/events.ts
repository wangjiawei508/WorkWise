import { encodeSseEvent } from '../sse.js'
import type { EventBus } from '../../ports/event-bus.js'
import type { SessionStore } from '../../ports/session-store.js'
import type { RuntimeEvent } from '../../contracts/events.js'
import { RUNTIME_RESOURCE_LIMITS_V1 } from '../../contracts/resource-limits.js'

const HEARTBEAT_INTERVAL_MS = 15_000

/**
 * Build an SSE response for `GET /v1/threads/{id}/events`.
 *
 * The handler first replays persisted events with `seq` greater than
 * `since_seq`, then subscribes to the event bus to deliver live
 * updates. The stream closes when the request's `AbortSignal`
 * fires (the client disconnects) or the server stops publishing.
 *
 * Delivery is deduplicated per connection: an event whose seq is at or
 * below the connection's high-water mark is dropped, so an event that
 * lands in both the persisted backlog and the live subscription (the
 * recorder persists before publishing) is delivered exactly once.
 * Heartbeats reuse the high-water mark instead of allocating fresh
 * seqs — after a runtime restart the in-memory seq counter starts
 * over, and stamping heartbeats with those low seqs used to rewind
 * client cursors, which made the next subscription replay the entire
 * thread history into the live transcript.
 */
export function buildEventStreamResponse(input: {
  request: Request
  threadId: string
  eventBus: EventBus
  sessionStore: SessionStore
}): Response {
  const url = new URL(input.request.url)
  const sinceSeqFromQuery = Number(url.searchParams.get('since_seq') ?? '0') || 0
  const sinceSeqFromHeader = Number(input.request.headers.get('Last-Event-ID') ?? '0') || 0
  const sinceSeq = sinceSeqFromQuery || sinceSeqFromHeader
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return
        closed = true
        unsubscribe?.()
        unsubscribe = undefined
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = undefined
        }
        try {
          controller.close()
        } catch {
          // Already closed; ignore.
        }
      }
      input.request.signal.addEventListener('abort', close)
      try {
        let lastDeliveredSeq = sinceSeq
        let replaying = true
        const pendingLiveEvents: RuntimeEvent[] = []
        let pendingLiveBytes = 0
        let pendingLiveHighWaterSeq = sinceSeq
        let replayOverflowed = false
        const deliver = (event: RuntimeEvent): void => {
          if (closed) return
          if (typeof event.seq === 'number') {
            if (event.seq <= lastDeliveredSeq) return
            lastDeliveredSeq = event.seq
          }
          controller.enqueue(encoder.encode(encodeSseEvent(event)))
        }
        unsubscribe = input.eventBus.subscribe(input.threadId, (event: RuntimeEvent) => {
          if (closed) return
          try {
            if (replaying) {
              if (typeof event.seq === 'number') {
                pendingLiveHighWaterSeq = Math.max(pendingLiveHighWaterSeq, event.seq)
              }
              const eventBytes = Buffer.byteLength(JSON.stringify(event), 'utf8')
              if (
                pendingLiveEvents.length >= RUNTIME_RESOURCE_LIMITS_V1.sseReplayEvents ||
                pendingLiveBytes + eventBytes > RUNTIME_RESOURCE_LIMITS_V1.sseReplayBytes
              ) {
                replayOverflowed = true
                pendingLiveEvents.length = 0
                pendingLiveBytes = 0
                return
              }
              pendingLiveEvents.push(event)
              pendingLiveBytes += eventBytes
              return
            }
            deliver(event)
          } catch {
            close()
          }
        })
        const highestSeq = await input.sessionStore.highestSeq(input.threadId).catch(() => 0)
        if (closed) return
        let backlog = sinceSeq >= highestSeq
          ? []
          : await input.sessionStore.loadEventsSince(input.threadId, sinceSeq)
        if (closed) return
        const replayBytes = backlog.reduce(
          (total, event) => total + Buffer.byteLength(JSON.stringify(event), 'utf8'),
          0
        )
        const backlogOverflowed =
          backlog.length > RUNTIME_RESOURCE_LIMITS_V1.sseReplayEvents ||
          replayBytes > RUNTIME_RESOURCE_LIMITS_V1.sseReplayBytes
        if (backlogOverflowed && !replayOverflowed) {
          const reset = {
            kind: 'replay_reset',
            seq: highestSeq,
            timestamp: new Date().toISOString(),
            threadId: input.threadId
          }
          controller.enqueue(
            encoder.encode(
              `id: ${highestSeq}\nevent: replay_reset\ndata: ${JSON.stringify(reset)}\n\n`
            )
          )
          lastDeliveredSeq = highestSeq
        }
        if (replayOverflowed) {
          const resetSeq = Math.max(highestSeq, pendingLiveHighWaterSeq)
          controller.enqueue(
            encoder.encode(
              `id: ${resetSeq}\nevent: replay_reset\ndata: ${JSON.stringify({
                kind: 'replay_reset',
                seq: resetSeq,
                timestamp: new Date().toISOString(),
                threadId: input.threadId
              })}\n\n`
            )
          )
          lastDeliveredSeq = resetSeq
          backlog = []
        } else if (backlogOverflowed) {
          backlog = []
        } else {
          for (const event of backlog) {
            deliver(event)
          }
        }
        replaying = false
        if (!replayOverflowed) {
          pendingLiveEvents.sort((a, b) => a.seq - b.seq)
          for (const event of pendingLiveEvents) {
            deliver(event)
          }
        }
        pendingLiveEvents.length = 0
        heartbeatTimer = setInterval(() => {
          if (closed) return
          try {
            controller.enqueue(
              encoder.encode(
                encodeSseEvent({
                  kind: 'heartbeat',
                  seq: lastDeliveredSeq,
                  timestamp: new Date().toISOString(),
                  threadId: input.threadId
                })
              )
            )
          } catch {
            close()
          }
        }, HEARTBEAT_INTERVAL_MS)
      } catch (error) {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              })}\n\n`
            )
          )
        } catch {
          // The request may have been aborted while replay was in flight.
        }
        close()
      }
    },
    cancel() {
      if (closed) return
      closed = true
      unsubscribe?.()
      unsubscribe = undefined
      if (heartbeatTimer) clearInterval(heartbeatTimer)
    }
  })
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  })
}
