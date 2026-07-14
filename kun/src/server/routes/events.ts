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
        const deliver = (event: RuntimeEvent): void => {
          if (typeof event.seq === 'number') {
            if (event.seq <= lastDeliveredSeq) return
            lastDeliveredSeq = event.seq
          }
          controller.enqueue(encoder.encode(encodeSseEvent(event)))
        }
        const highestSeq = await input.sessionStore.highestSeq(input.threadId).catch(() => 0)
        let backlog = sinceSeq >= highestSeq
          ? []
          : await input.sessionStore.loadEventsSince(input.threadId, sinceSeq)
        const replayBytes = backlog.reduce(
          (total, event) => total + Buffer.byteLength(JSON.stringify(event), 'utf8'),
          0
        )
        if (
          backlog.length > RUNTIME_RESOURCE_LIMITS_V1.sseReplayEvents ||
          replayBytes > RUNTIME_RESOURCE_LIMITS_V1.sseReplayBytes
        ) {
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
          backlog = []
        }
        for (const event of backlog) {
          deliver(event)
        }
        unsubscribe = input.eventBus.subscribe(input.threadId, (event: RuntimeEvent) => {
          if (closed) return
          try {
            deliver(event)
          } catch {
            close()
          }
        })
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
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              message: error instanceof Error ? error.message : String(error)
            })}\n\n`
          )
        )
        close()
      }
    },
    cancel() {
      closed = true
      unsubscribe?.()
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
