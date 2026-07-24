import { describe, expect, it, vi } from 'vitest'
import {
  isStaleAgentSelectionError,
  setThreadAgentWithOneRevisionReplay
} from './thread-agent-selection'

describe('thread Agent selection', () => {
  it('replays exactly once after a structured stale_request', async () => {
    const stale = Object.assign(new Error('[stale_request] stale revision'), {
      code: 'stale_request',
      status: 409
    })
    const setThreadAgent = vi.fn()
      .mockRejectedValueOnce(stale)
      .mockResolvedValueOnce({})
    const refreshThreads = vi.fn().mockResolvedValue(undefined)

    await setThreadAgentWithOneRevisionReplay({
      threadId: 'thread-1',
      agentId: 'tender-master',
      expectedRevision: 7,
      setThreadAgent,
      refreshThreads,
      readExpectedRevision: () => 8,
      createIdempotencyKey: () => `key-${setThreadAgent.mock.calls.length + 1}`
    })

    expect(refreshThreads).toHaveBeenCalledTimes(1)
    expect(setThreadAgent).toHaveBeenCalledTimes(2)
    expect(setThreadAgent.mock.calls[0]?.[1]).toMatchObject({ expectedRevision: 7 })
    expect(setThreadAgent.mock.calls[1]?.[1]).toMatchObject({ expectedRevision: 8 })
  })

  it('does not replay unrelated 409 or idempotency failures', async () => {
    const conflict = Object.assign(new Error('[idempotency_conflict] conflict'), {
      code: 'idempotency_conflict',
      status: 409
    })
    const setThreadAgent = vi.fn().mockRejectedValue(conflict)
    const refreshThreads = vi.fn().mockResolvedValue(undefined)

    await expect(setThreadAgentWithOneRevisionReplay({
      threadId: 'thread-1',
      agentId: 'tender-master',
      expectedRevision: 7,
      setThreadAgent,
      refreshThreads,
      readExpectedRevision: () => 8
    })).rejects.toBe(conflict)
    expect(refreshThreads).not.toHaveBeenCalled()
    expect(setThreadAgent).toHaveBeenCalledTimes(1)
  })

  it('surfaces the second failure and never retries a third time', async () => {
    const stale = Object.assign(new Error('[stale_request] stale'), { code: 'stale_request' })
    const secondFailure = new Error('runtime unavailable')
    const setThreadAgent = vi.fn()
      .mockRejectedValueOnce(stale)
      .mockRejectedValueOnce(secondFailure)

    await expect(setThreadAgentWithOneRevisionReplay({
      threadId: 'thread-1',
      agentId: 'tender-master',
      expectedRevision: 1,
      setThreadAgent,
      refreshThreads: vi.fn().mockResolvedValue(undefined),
      readExpectedRevision: () => 2
    })).rejects.toBe(secondFailure)
    expect(setThreadAgent).toHaveBeenCalledTimes(2)
  })

  it('recognizes only the explicit stale_request code or prefix', () => {
    expect(isStaleAgentSelectionError({ code: 'stale_request' })).toBe(true)
    expect(isStaleAgentSelectionError(new Error('[stale_request] stale'))).toBe(true)
    expect(isStaleAgentSelectionError(new Error('revision conflict 409'))).toBe(false)
  })
})
