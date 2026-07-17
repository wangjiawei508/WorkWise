import { getActiveAgentApiKey, type WorkWiseSettingsV2 } from '@shared/app-settings'

export function shouldRequireInitialSetup(settings: WorkWiseSettingsV2): boolean {
  return settings.revision === 0 && !getActiveAgentApiKey(settings).trim()
}
