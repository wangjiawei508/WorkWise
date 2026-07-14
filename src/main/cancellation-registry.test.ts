import { describe, expect, it, vi } from 'vitest'
import { CancellationRegistry } from './cancellation-registry'

describe('CancellationRegistry', () => {
  it('cancels descendants and runs every cleanup once', async () => {
    const registry = new CancellationRegistry()
    const cleanup = vi.fn()
    registry.register({ scope: 'app', id: 'app' })
    const thread = registry.register(
      { scope: 'thread', id: 'thr_1' },
      { parent: { scope: 'app', id: 'app' }, cleanup }
    )
    const turn = registry.register(
      { scope: 'turn', id: 'turn_1' },
      { parent: { scope: 'thread', id: 'thr_1' }, cleanup }
    )

    await expect(registry.cancel({ scope: 'thread', id: 'thr_1' }, 'deleted')).resolves.toBe(2)
    expect(thread.signal.aborted).toBe(true)
    expect(turn.signal.aborted).toBe(true)
    expect(cleanup).toHaveBeenCalledTimes(2)
    expect(registry.size()).toBe(1)
  })

  it('deduplicates concurrent cancellation', async () => {
    const registry = new CancellationRegistry()
    const cleanup = vi.fn(async () => undefined)
    registry.register({ scope: 'shell', id: 'proc_1' }, { cleanup })
    await Promise.all([
      registry.cancel({ scope: 'shell', id: 'proc_1' }),
      registry.cancel({ scope: 'shell', id: 'proc_1' })
    ])
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
