import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettingsV1 } from '../shared/app-settings'
import { defaultKunRuntimeSettings } from '../shared/app-settings'
import { appCancellationRegistry } from './cancellation-registry'
import { registerRuntimeSseIpc, stopAllRuntimeSse } from './runtime-sse-ipc'

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function createHarness() {
  const handlers = new Map<string, InvokeHandler>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: InvokeHandler) => {
      handlers.set(channel, handler)
    })
  } as unknown as IpcMain
  const settings = {
    agents: { kun: defaultKunRuntimeSettings() }
  } as AppSettingsV1

  registerRuntimeSseIpc({
    ipcMain,
    store: { load: vi.fn(async () => settings) } as never,
    ensureRuntime: vi.fn(async () => undefined),
    logError: vi.fn()
  })

  const sender = {
    id: 42,
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  }
  const event = { sender } as unknown as IpcMainInvokeEvent

  return {
    start: (streamId: string) =>
      handlers.get('runtime:sse:start')?.(event, {
        threadId: 'thread-1',
        sinceSeq: 0,
        streamId
      }),
    stop: (streamId: string) =>
      handlers.get('runtime:sse:stop')?.(event, streamId)
  }
}

describe('runtime SSE IPC lifecycle', () => {
  beforeEach(async () => {
    await stopAllRuntimeSse('test_reset')
    // Deliberately never settle. This simulates a fetch implementation that
    // does not observe abort immediately and exposes stale controller leaks.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
  })

  afterEach(async () => {
    await stopAllRuntimeSse('test_cleanup')
    vi.unstubAllGlobals()
  })

  it('releases stopped streams synchronously before a replacement starts', async () => {
    const harness = createHarness()

    for (let index = 0; index < 12; index += 1) {
      const streamId = `stream-${index}`
      await expect(harness.start(streamId)).resolves.toEqual({ streamId })
      await expect(harness.stop(streamId)).resolves.toBe(true)
    }
  })

  it('does not let a replaced stream consume an additional connection slot', async () => {
    const harness = createHarness()

    await expect(harness.start('stable-stream')).resolves.toEqual({ streamId: 'stable-stream' })
    await expect(harness.start('stable-stream')).resolves.toEqual({ streamId: 'stable-stream' })
    await expect(harness.stop('stable-stream')).resolves.toBe(true)
  })

  it('releases the stream slot when its renderer window is cancelled', async () => {
    const harness = createHarness()

    await expect(harness.start('window-stream')).resolves.toEqual({ streamId: 'window-stream' })
    await appCancellationRegistry.cancel({ scope: 'window', id: '42' }, 'window_destroyed')
    await expect(harness.start('replacement-stream')).resolves.toEqual({ streamId: 'replacement-stream' })
    await expect(harness.stop('replacement-stream')).resolves.toBe(true)
  })
})
