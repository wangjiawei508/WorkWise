import { describe, expect, it, vi } from 'vitest'
import {
  UiActionClient,
  UiActionInteractionCache,
  type UiActionTransport
} from './ui-action-client'

const base = {
  threadId: 'thr_1',
  messageId: 'item_card',
  blockId: 'filters',
  actionId: 'choose-kind',
  specFingerprint: '0123456789abcdef',
  value: 'two'
}

describe('UiActionClient', () => {
  it('deduplicates simultaneous clicks and reuses the same idempotency key after an uncertain failure', async () => {
    const calls: Array<Record<string, unknown>> = []
    let fail = true
    const transport: UiActionTransport = {
      post: vi.fn(async (_threadId, body) => {
        calls.push(body)
        if (fail) throw new Error('network interrupted')
        return { threadId: 'thr_1', turnId: 'turn_1', uiActionItemId: 'item_action_1' }
      })
    }
    const client = new UiActionClient({ transport, makeId: () => 'stable-click-id' })

    await expect(Promise.all([client.submit(base), client.submit(base)])).rejects.toThrow('network interrupted')
    expect(calls).toHaveLength(1)
    const firstKey = calls[0]?.idempotencyKey

    fail = false
    await expect(client.submit(base)).resolves.toMatchObject({ turnId: 'turn_1' })
    expect(calls).toHaveLength(2)
    expect(calls[1]?.idempotencyKey).toBe(firstKey)
  })

  it('keeps at most 200 card interaction records and never sends password material', async () => {
    const cache = new UiActionInteractionCache(200)
    for (let index = 0; index < 201; index += 1) {
      cache.setValue(`card-${index}`, 'field', String(index))
    }
    expect(cache.size).toBe(200)
    expect(cache.getValue('card-0', 'field')).toBeUndefined()
    expect(cache.getValue('card-200', 'field')).toBe('200')

    const transport: UiActionTransport = { post: vi.fn() }
    const client = new UiActionClient({ transport, makeId: () => 'never-used' })
    await expect(client.submit({ ...base, password: 'do-not-send-this-secret' })).rejects.toThrow(/password/i)
    expect(transport.post).not.toHaveBeenCalled()
  })

  it('bounds uncertain interaction records and removes a record after success', async () => {
    const transport: UiActionTransport = {
      post: vi.fn(async () => ({ threadId: 'thr_1', turnId: 'turn_1', uiActionItemId: 'item_action_1' }))
    }
    const client = new UiActionClient({ transport, makeId: (() => {
      let index = 0
      return () => `key-${index++}`
    })() })

    for (let index = 0; index < 205; index += 1) {
      await client.submit({ ...base, actionId: `action-${index}` })
    }

    expect(client.size).toBeLessThanOrEqual(200)
    expect(client.hasInteraction({ ...base, actionId: 'action-204' })).toBe(false)
  })

  it('rejects new actions when the bounded interaction table is full of pending requests', async () => {
    let resolvePending!: (response: { threadId: string; turnId: string; uiActionItemId: string }) => void
    const pending = new Promise<{ threadId: string; turnId: string; uiActionItemId: string }>((resolve) => {
      resolvePending = resolve
    })
    const transport: UiActionTransport = {
      post: vi.fn(async () => pending)
    }
    const client = new UiActionClient({ transport, makeId: () => 'stable-pending-id' })
    const requests = Array.from({ length: 200 }, (_, index) => client.submit({ ...base, actionId: `pending-${index}` }))

    expect(client.size).toBe(200)
    await expect(client.submit({ ...base, actionId: 'pending-overflow' })).rejects.toThrow(/capacity/i)
    resolvePending({ threadId: 'thr_1', turnId: 'turn_1', uiActionItemId: 'item_action_1' })
    await Promise.all(requests)
  })
})
