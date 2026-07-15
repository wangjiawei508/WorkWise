import { describe, expect, it } from 'vitest'
import { normalizeAppSettings, type AppSettingsV1 } from '@shared/app-settings'
import { initialSetupSettingsPatch } from './initial-setup-settings'

describe('initialSetupSettingsPatch', () => {
  it('submits only patch fields accepted by the strict settings IPC schema', () => {
    const settings = normalizeAppSettings({
      locale: 'zh',
      theme: 'dark',
      provider: {
        apiKey: 'sk-local-test',
        baseUrl: 'https://api.deepseek.com',
        providers: []
      }
    } as unknown as AppSettingsV1)
    const patch = initialSetupSettingsPatch(settings)

    expect(patch).not.toHaveProperty('schema')
    expect(patch).not.toHaveProperty('version')
    expect(patch).not.toHaveProperty('revision')
    expect(patch).toMatchObject({ locale: 'zh', theme: 'dark' })
  })
})
