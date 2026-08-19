import { describe, expect, it, vi } from 'vitest'
import { dispatchNotificationOpenThread } from './notification-navigation'

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
