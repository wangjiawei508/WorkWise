import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultManagedRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type WorkWiseSettingsV2
} from '@shared/app-settings'
import { rendererRuntimeClient } from './runtime-client'

function settings(apiKey: string, revision = 0): WorkWiseSettingsV2 {
  return {
    schema: 'workwise.settings',
    version: 2,
    revision,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: {
      kun: {
        ...defaultManagedRuntimeSettings(),
        apiKey
      }
    },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    conversation: { viewMode: 'concise' },
    documents: { parsingMode: 'auto', privateMineruServerUrl: '', allowPrivateServerUploadByWorkspace: {} },
    codePromptPrefix: ''
  }
}

afterEach(() => {
  rendererRuntimeClient.invalidateSettings()
  vi.unstubAllGlobals()
})

describe('rendererRuntimeClient', () => {
  it('caches settings reads until invalidated', async () => {
    const getSettings = vi.fn(async () => settings('sk-1'))
    vi.stubGlobal('window', {
      workwise: {
        getSettings,
        setSettings: vi.fn(),
        runtimeRequest: vi.fn(),
        startSse: vi.fn(),
        stopSse: vi.fn(),
        onSseEvent: vi.fn(),
        onSseEnd: vi.fn(),
        onSseError: vi.fn()
      }
    })

    const first = await rendererRuntimeClient.getSettings()
    const second = await rendererRuntimeClient.getSettings()

    expect(first.agents.kun.apiKey).toBe('sk-1')
    expect(second.agents.kun.apiKey).toBe('sk-1')
    expect(getSettings).toHaveBeenCalledTimes(1)
  })

  it('refreshes the cache after setSettings', async () => {
    const getSettings = vi.fn(async () => settings('sk-1'))
    const setSettings = vi.fn(async () => settings('sk-2'))
    vi.stubGlobal('window', {
      workwise: {
        getSettings,
        setSettings,
        runtimeRequest: vi.fn(),
        startSse: vi.fn(),
        stopSse: vi.fn(),
        onSseEvent: vi.fn(),
        onSseEnd: vi.fn(),
        onSseError: vi.fn()
      }
    })

    await rendererRuntimeClient.getSettings()
    const next = await rendererRuntimeClient.setSettings({ workspaceRoot: '/tmp/next' })
    const cached = await rendererRuntimeClient.getSettings()

    expect(next.agents.kun.apiKey).toBe('sk-2')
    expect(cached.agents.kun.apiKey).toBe('sk-2')
    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(setSettings).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent writes and uses the revision returned by the prior write', async () => {
    let current = settings('sk-1', 4)
    const expectedRevisions: Array<number | undefined> = []
    const getSettings = vi.fn(async () => current)
    const setSettings = vi.fn(async (
      partial: { uiFontScale?: WorkWiseSettingsV2['uiFontScale'] },
      expectedRevision?: number
    ) => {
      expectedRevisions.push(expectedRevision)
      current = {
        ...current,
        ...partial,
        revision: current.revision + 1
      }
      return current
    })
    vi.stubGlobal('window', {
      workwise: {
        getSettings,
        setSettings,
        runtimeRequest: vi.fn(),
        startSse: vi.fn(),
        stopSse: vi.fn(),
        onSseEvent: vi.fn(),
        onSseEnd: vi.fn(),
        onSseError: vi.fn()
      }
    })

    const [medium, large] = await Promise.all([
      rendererRuntimeClient.setSettings({ uiFontScale: 'medium' }),
      rendererRuntimeClient.setSettings({ uiFontScale: 'large' })
    ])

    expect(medium).toMatchObject({ uiFontScale: 'medium', revision: 5 })
    expect(large).toMatchObject({ uiFontScale: 'large', revision: 6 })
    expect(expectedRevisions).toEqual([4, 5])
    expect(getSettings).toHaveBeenCalledTimes(1)
  })
})
