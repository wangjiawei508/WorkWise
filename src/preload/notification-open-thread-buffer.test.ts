import { describe, expect, it, vi } from 'vitest'
import { createNotificationOpenThreadBuffer } from './notification-open-thread-buffer'

describe('notification open-thread preload buffer', () => {
  it('replays a click received before the renderer subscribes', () => {
    const buffer = createNotificationOpenThreadBuffer()
    const handler = vi.fn()

    buffer.push(' thread-1 ')
    const unsubscribe = buffer.subscribe(handler)

    expect(handler).toHaveBeenCalledWith('thread-1')
    unsubscribe()
    buffer.push('thread-2')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('keeps only the latest pre-subscription destination', () => {
    const buffer = createNotificationOpenThreadBuffer()
    const handler = vi.fn()

    buffer.push('thread-1')
    buffer.push('thread-2')
    buffer.subscribe(handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('thread-2')
  })
})
