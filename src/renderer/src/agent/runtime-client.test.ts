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
    documents: { parsingMode: 'auto', unlimitedOcrServerUrl: '', privateMineruServerUrl: '', allowPrivateServerUploadByWorkspace: {} },
    codePromptPrefix: ''
  }
}

afterEach(() => {
  rendererRuntimeClient.invalidateSettings()
  vi.unstubAllGlobals()
})

describe('rendererRuntimeClient', () => {
  it('searches structured workspace references through the thread-scoped Runtime route', async () => {
    const runtimeRequest = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        entries: [{ path: 'docs/投标.md', name: '投标.md', kind: 'file', depth: 2 }],
        truncated: false,
        indexedAt: '2026-08-17T00:00:00.000Z'
      })
    }))
    vi.stubGlobal('window', { workwise: { runtimeRequest } })

    await expect(rendererRuntimeClient.searchWorkspaceReferences(
      'thr /1',
      '/tmp/workspace',
      '投标',
      10
    )).resolves.toMatchObject({
      entries: [{ path: 'docs/投标.md', kind: 'file' }]
    })
    expect(runtimeRequest).toHaveBeenCalledWith(
      '/v1/threads/thr%20%2F1/workspace/references/search',
      'POST',
      JSON.stringify({ query: '投标', limit: 10 })
    )
  })

  it('searches the workspace-scoped Runtime route before a thread exists', async () => {
    const runtimeRequest = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: JSON.stringify({
        entries: [{ path: '资料', name: '资料', kind: 'directory', depth: 1 }],
        truncated: false,
        indexedAt: '2026-08-19T00:00:00.000Z'
      })
    }))
    vi.stubGlobal('window', { workwise: { runtimeRequest } })

    await expect(rendererRuntimeClient.searchWorkspaceReferences(
      null,
      '/tmp/投标 workspace',
      '资料',
      20
    )).resolves.toMatchObject({ entries: [{ path: '资料', kind: 'directory' }] })
    expect(runtimeRequest).toHaveBeenCalledWith(
      '/v1/workspace/references/search',
      'POST',
      JSON.stringify({ workspaceRoot: '/tmp/投标 workspace', query: '资料', limit: 20 })
    )
  })

  it('returns null only when an older Runtime lacks the reference route', async () => {
    const runtimeRequest = vi.fn(async () => ({
      ok: false,
      status: 404,
      body: JSON.stringify({ code: 'not_found', message: 'route not found' })
    }))
    vi.stubGlobal('window', { workwise: { runtimeRequest } })

    await expect(rendererRuntimeClient.searchWorkspaceReferences(
      'thr_1', '/tmp/workspace', '', 20
    )).resolves.toBeNull()
  })

  it('surfaces a missing thread instead of treating the Runtime as legacy', async () => {
    const runtimeRequest = vi.fn(async () => ({
      ok: false,
      status: 404,
      body: JSON.stringify({ code: 'not_found', message: 'thread not found: thr_missing' })
    }))
    vi.stubGlobal('window', { workwise: { runtimeRequest } })

    await expect(rendererRuntimeClient.searchWorkspaceReferences(
      'thr_missing', '/tmp/workspace', '', 20
    ))
      .rejects.toThrow('thread not found: thr_missing')
  })

  it('surfaces Runtime workspace search failures instead of silently falling back', async () => {
    const runtimeRequest = vi.fn(async () => ({
      ok: false,
      status: 500,
      body: JSON.stringify({ message: 'index unavailable' })
    }))
    vi.stubGlobal('window', { workwise: { runtimeRequest } })

    await expect(rendererRuntimeClient.searchWorkspaceReferences(
      'thr_1', '/tmp/workspace', '', 20
    ))
      .rejects.toThrow('index unavailable')
  })

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

  it('recomputes queued read-modify-write patches from the latest settings', async () => {
    let current = settings('sk-1', 4)
    const getSettings = vi.fn(async () => current)
    const setSettings = vi.fn(async (
      partial: { claw?: WorkWiseSettingsV2['claw'] },
      expectedRevision?: number
    ) => {
      expect(expectedRevision).toBe(current.revision)
      current = {
        ...current,
        claw: partial.claw ?? current.claw,
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

    await Promise.all([
      rendererRuntimeClient.updateSettings((latest) => ({
        claw: { ...latest.claw, channels: [{ id: 'feishu' } as never] }
      })),
      rendererRuntimeClient.updateSettings((latest) => ({
        claw: { ...latest.claw, channels: [...latest.claw.channels, { id: 'weixin' } as never] }
      }))
    ])

    expect(current.claw.channels.map((channel) => channel.id)).toEqual(['feishu', 'weixin'])
    expect(current.revision).toBe(6)
  })
})
