import {
  getModelProviderSettings,
  type AppSettingsPatch,
  type AppSettingsV1
} from '@shared/app-settings'

export function initialSetupSettingsPatch(settings: AppSettingsV1): AppSettingsPatch {
  const provider = getModelProviderSettings(settings)
  return {
    locale: settings.locale,
    theme: settings.theme,
    provider: {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl
    }
  }
}
