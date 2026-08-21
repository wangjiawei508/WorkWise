export type NotificationOpenThreadBuffer = {
  push(threadId: string): void
  subscribe(handler: (threadId: string) => void): () => void
}

export function createNotificationOpenThreadBuffer(): NotificationOpenThreadBuffer {
  const handlers = new Set<(threadId: string) => void>()
  let pendingThreadId: string | null = null

  return {
    push(rawThreadId) {
      const threadId = rawThreadId.trim()
      if (!threadId) return
      if (handlers.size === 0) {
        pendingThreadId = threadId
        return
      }
      for (const handler of handlers) handler(threadId)
    },
    subscribe(handler) {
      handlers.add(handler)
      if (pendingThreadId) {
        const threadId = pendingThreadId
        pendingThreadId = null
        handler(threadId)
      }
      return () => handlers.delete(handler)
    }
  }
}
