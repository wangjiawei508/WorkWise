import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_AGNES_IMAGE_MODEL,
  DEFAULT_AGNES_PROVIDER_ID,
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { buildAgnesImageRequest } from './write-agnes-image-service'

function settings(): AppSettingsV1 {
  const provider = defaultModelProviderSettings()
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      ...provider,
      providers: provider.providers.map((item) =>
        item.id === DEFAULT_AGNES_PROVIDER_ID
          ? { ...item, apiKey: 'sk-agnes' }
          : item
      )
    },
    agents: { kun: defaultKunRuntimeSettings() },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  }
}

describe('write Agnes image service', () => {
  it('builds an OpenAI-compatible Agnes image generation request', () => {
    const request = buildAgnesImageRequest(settings(), {
      workspaceRoot: '/tmp/workspace',
      currentFilePath: '/tmp/workspace/draft.md',
      prompt: '生成一张工程监测汇报封面',
      size: '1024x1024'
    })

    expect(request).toEqual({
      url: `${DEFAULT_AGNES_BASE_URL}/images/generations`,
      apiKey: 'sk-agnes',
      model: DEFAULT_AGNES_IMAGE_MODEL,
      prompt: '生成一张工程监测汇报封面',
      size: '1024x1024'
    })
  })

  it('rejects missing Agnes API keys before making a network request', () => {
    const input = settings()
    input.provider.providers = input.provider.providers.map((item) =>
      item.id === DEFAULT_AGNES_PROVIDER_ID ? { ...item, apiKey: '' } : item
    )

    expect(() => buildAgnesImageRequest(input, {
      workspaceRoot: '/tmp/workspace',
      currentFilePath: '/tmp/workspace/draft.md',
      prompt: 'test'
    })).toThrow(/Agnes AI API Key is missing/)
  })
})
