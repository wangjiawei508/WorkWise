import { describe, expect, it, vi } from 'vitest'
import {
  createNotificationClickHandler,
  dispatchNotificationOpenThread
} from './notification-navigation'
import { createNotificationOpenThreadBuffer } from '../preload/notification-open-thread-buffer'

function target(loading: boolean) {
  let didFinishLoad: (() => void) | undefined
  const send = vi.fn()
  return {
    send,
    finishLoading: () => didFinishLoad?.(),
    window: {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        isLoadingMainFrame: () => loading,
        once: vi.fn((_event: 'did-finish-load', listener: () => void) => {
          didFinishLoad = listener
        }),
        send
      }
    }
  }
}

describe('notification thread navigation', () => {
  it('routes a system notification click through preload to the renderer subscriber', () => {
    const loading = target(true)
    const reveal = vi.fn()
    const buffer = createNotificationOpenThreadBuffer()
    const received = vi.fn()
    buffer.subscribe(received)

    createNotificationClickHandler(() => loading.window, reveal, ' thread-3 ')()

    expect(reveal).toHaveBeenCalledOnce()
    expect(received).not.toHaveBeenCalled()

    loading.finishLoading()
    buffer.push(loading.send.mock.calls[0]?.[1] as string)

    expect(received).toHaveBeenCalledWith('thread-3')
  })

  it('waits for a newly created renderer before sending the thread route', () => {
    const loading = target(true)

    expect(dispatchNotificationOpenThread(loading.window, ' thread-1 ')).toBe(true)
    expect(loading.send).not.toHaveBeenCalled()

    loading.finishLoading()

    expect(loading.send).toHaveBeenCalledWith('notification:open-thread', 'thread-1')
  })

  it('sends immediately when the renderer is already loaded', () => {
    const loaded = target(false)

    expect(dispatchNotificationOpenThread(loaded.window, 'thread-2')).toBe(true)
    expect(loaded.send).toHaveBeenCalledWith('notification:open-thread', 'thread-2')
  })
})
