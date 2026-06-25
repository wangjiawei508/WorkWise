import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_AGNES_PROVIDER_ID,
  DEFAULT_AGNES_TEXT_MODEL,
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  normalizeModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  resolveModelSelectionForProvider,
  resolveKunRuntimeSettings,
  type AppSettingsV1
} from './app-settings'

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      ...defaultModelProviderSettings(),
      providers: [
        ...defaultModelProviderSettings().providers,
        {
          id: 'custom',
          name: 'Custom Provider',
          apiKey: 'sk-custom',
          baseUrl: 'https://custom.example/v1',
          apiType: 'responses',
          models: ['custom-model']
        }
      ]
    },
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        providerId: 'custom',
        model: 'custom-model'
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
    codePromptPrefix: ''
  }
}

describe('model provider settings', () => {
  it('includes Agnes AI as a built-in OpenAI-compatible provider preset', () => {
    const provider = defaultModelProviderSettings()

    expect(provider.providers).toContainEqual(expect.objectContaining({
      id: DEFAULT_AGNES_PROVIDER_ID,
      name: 'Agnes AI',
      baseUrl: DEFAULT_AGNES_BASE_URL,
      apiType: 'chat_completions',
      models: [DEFAULT_AGNES_TEXT_MODEL]
    }))
  })

  it('adds the Agnes preset when normalizing older settings', () => {
    const normalized = normalizeModelProviderSettings({
      apiKey: 'sk-deepseek',
      baseUrl: 'https://api.deepseek.com',
      providers: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          apiKey: 'sk-deepseek',
          baseUrl: 'https://api.deepseek.com',
          apiType: 'chat_completions',
          models: ['deepseek-v4-pro']
        }
      ]
    })

    expect(normalized.providers).toContainEqual(expect.objectContaining({
      id: DEFAULT_AGNES_PROVIDER_ID,
      baseUrl: DEFAULT_AGNES_BASE_URL,
      models: [DEFAULT_AGNES_TEXT_MODEL]
    }))
  })

  it('resolves Kun runtime credentials from the selected provider', () => {
    const runtime = resolveKunRuntimeSettings(settings())

    expect(runtime.apiKey).toBe('sk-custom')
    expect(runtime.baseUrl).toBe('https://custom.example/v1')
    expect(runtime.apiType).toBe('responses')
  })

  it('lets the Kun runtime API protocol override the selected provider', () => {
    const input = settings()
    input.agents.kun.apiType = 'chat_completions'

    const runtime = resolveKunRuntimeSettings(input)

    expect(runtime.apiType).toBe('chat_completions')
  })

  it('inherits the selected provider model when the Kun model is still the built-in default', () => {
    const input = settings()
    input.agents.kun.model = defaultKunRuntimeSettings().model
    input.agents.kun.apiType = 'chat_completions'

    const runtime = resolveKunRuntimeSettings(input)

    expect(runtime.model).toBe('custom-model')
    expect(runtime.apiType).toBe('responses')
  })

  it('preserves an explicit Kun model override', () => {
    const input = settings()
    input.agents.kun.model = 'runtime-only-model'

    const runtime = resolveKunRuntimeSettings(input)

    expect(runtime.model).toBe('runtime-only-model')
  })

  it('maps stale built-in composer models to the selected provider default', () => {
    const input = settings()
    input.agents.kun.model = defaultKunRuntimeSettings().model

    expect(resolveModelSelectionForProvider(input, 'deepseek-v4-pro')).toBe('custom-model')
    expect(resolveModelSelectionForProvider(input, 'auto')).toBe('custom-model')
  })

  it('preserves provider-supported model selections', () => {
    const input = settings()

    expect(resolveModelSelectionForProvider(input, 'custom-model')).toBe('custom-model')
  })

  it('preserves auto mode for providers with built-in DeepSeek models', () => {
    const input = settings()
    input.provider = defaultModelProviderSettings()
    input.agents.kun.providerId = ''
    input.agents.kun.model = defaultKunRuntimeSettings().model

    expect(resolveModelSelectionForProvider(input, 'auto')).toBe('auto')
  })
})
