type SetThreadAgent = (
  threadId: string,
  request: {
    agentId: string
    expectedRevision: number
    idempotencyKey: string
  }
) => Promise<unknown>

export function isStaleAgentSelectionError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : ''
  if (code === 'stale_request') return true
  const message = cause instanceof Error ? cause.message : ''
  return /^\[stale_request\](?:\s|$)/i.test(message)
}

export async function setThreadAgentWithOneRevisionReplay(input: {
  threadId: string
  agentId: string
  expectedRevision: number
  setThreadAgent: SetThreadAgent
  refreshThreads: () => Promise<void>
  readExpectedRevision: () => number | undefined
  createIdempotencyKey?: () => string
}): Promise<void> {
  const createIdempotencyKey = input.createIdempotencyKey ?? (() => crypto.randomUUID())
  const apply = (expectedRevision: number) =>
    input.setThreadAgent(input.threadId, {
      agentId: input.agentId,
      expectedRevision,
      idempotencyKey: createIdempotencyKey()
    })

  try {
    await apply(input.expectedRevision)
  } catch (cause) {
    if (!isStaleAgentSelectionError(cause)) throw cause
    await input.refreshThreads()
    await apply(input.readExpectedRevision() ?? input.expectedRevision)
  }
}
