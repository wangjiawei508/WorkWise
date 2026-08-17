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
import { coerceRendererSettings, guiUpdateFailureMessage, mergeSettings, mergeSettingsPatches } from './settings-utils'

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

  it('preserves terminal notification filters across a partial enabled patch', () => {
    const current = coerceRendererSettings({
      ...legacySettings(),
      notifications: {
        turnComplete: true,
        turnTerminal: {
          enabled: true,
          kinds: ['error', 'waiting_approval'],
          suppressActiveThread: true,
          include: ['project-*'],
          exclude: ['*secret*']
        }
      }
    })

    expect(mergeSettings(current, {
      notifications: { turnTerminal: { enabled: false } }
    }).notifications).toEqual({
      turnComplete: false,
      turnTerminal: {
        enabled: false,
        kinds: ['error', 'waiting_approval'],
        suppressActiveThread: true,
        include: ['project-*'],
        exclude: ['*secret*']
      }
    })
  })

  it('localizes structured updater failures instead of exposing main-process English', () => {
    const translations: Record<string, string> = {
      guiUpdateErrUnsignedBuild: 'unsigned candidate',
      guiUpdateErrManifestUnavailable: 'manifest unavailable',
      guiUpdateErrNetwork: 'network unavailable',
      guiUpdateErrSignatureInvalid: 'signature invalid',
      guiUpdateErrWithdrawn: 'release withdrawn'
    }
    const t = (key: string): string => translations[key] ?? key
    const failure = (code: 'unsigned_build' | 'manifest_unavailable' | 'network' | 'signature_invalid' | 'withdrawn') =>
      guiUpdateFailureMessage({
        ok: false,
        currentVersion: '0.4.0',
        code,
        message: 'English main-process detail'
      }, t)

    expect(failure('unsigned_build')).toBe('unsigned candidate')
    expect(failure('manifest_unavailable')).toBe('manifest unavailable')
    expect(failure('network')).toBe('network unavailable')
    expect(failure('signature_invalid')).toBe('signature invalid')
    expect(failure('withdrawn')).toBe('release withdrawn')
  })
})
