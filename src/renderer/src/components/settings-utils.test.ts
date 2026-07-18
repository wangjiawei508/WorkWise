import { describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultManagedRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '@shared/app-settings'
import { coerceRendererSettings, mergeSettingsPatches } from './settings-utils'

function legacySettings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'zh',
    theme: 'light',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: { kun: defaultManagedRuntimeSettings() },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: true, retentionDays: 2 },
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

describe('settings utils', () => {
  it('keeps the WorkWise V2 revision in renderer state', () => {
    const settings = {
      ...legacySettings(),
      schema: 'workwise.settings' as const,
      version: 2 as const,
      revision: 17
    }

    expect(coerceRendererSettings(settings)).toMatchObject({
      schema: 'workwise.settings',
      version: 2,
      revision: 17,
      conversation: { viewMode: 'concise' },
      documents: { parsingMode: 'auto' }
    })
  })

  it('merges debounced nested patches while replacing arrays', () => {
    const patch = mergeSettingsPatches(
      {
        uiFontScale: 'medium',
        write: { inlineCompletion: { enabled: false, maxTokens: 80 } },
        schedule: { tasks: [{ id: 'old' }] }
      },
      {
        uiFontScale: 'large',
        write: { inlineCompletion: { maxTokens: 120 } },
        schedule: { tasks: [{ id: 'new' }] }
      }
    )

    expect(patch).toMatchObject({
      uiFontScale: 'large',
      write: { inlineCompletion: { enabled: false, maxTokens: 120 } },
      schedule: { tasks: [{ id: 'new' }] }
    })
  })
})
