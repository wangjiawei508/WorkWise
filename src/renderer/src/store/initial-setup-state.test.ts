import { describe, expect, it } from 'vitest'
import { normalizeAppSettings, type WorkWiseSettingsV2 } from '@shared/app-settings'
import { shouldRequireInitialSetup } from './initial-setup-state'

function settings(revision: number, apiKey = ''): WorkWiseSettingsV2 {
  return normalizeAppSettings({
    version: 2,
    revision,
    provider: { apiKey }
  } as WorkWiseSettingsV2) as WorkWiseSettingsV2
}

describe('shouldRequireInitialSetup', () => {
  it('shows the guide only for a fresh profile without an API key', () => {
    expect(shouldRequireInitialSetup(settings(0))).toBe(true)
    expect(shouldRequireInitialSetup(settings(0, 'sk-test'))).toBe(false)
  })

  it('does not reopen the guide after local-writing preferences were saved', () => {
    expect(shouldRequireInitialSetup(settings(1))).toBe(false)
  })
})
