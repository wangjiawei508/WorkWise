import {
  DEFAULT_GUI_UPDATE_CHANNEL,
  normalizeGuiUpdateChannel,
  type AppBehaviorConfigV1,
  type AppSettingsV1,
  type ClawSettingsPatchV1,
  type GuiUpdateConfigV1,
  type NotificationConfigV1,
  type ScheduleSettingsPatchV1,
  type WriteSettingsPatchV1
} from './app-settings-types'
import { normalizeKeyboardShortcuts, type KeyboardShortcutsConfigV1 } from './keyboard-shortcuts'
import {
  defaultManagedRuntimeSettings,
  getManagedRuntimeSettings,
  kunSettingsEnvelope,
  mergeManagedRuntimeSettings,
  migrateLegacyAppSettings
} from './app-settings-runtime'
import { normalizeModelProviderSettings } from './app-settings-provider'
import { normalizeDeepseekBaseUrl } from './app-settings-normalizers'
import { normalizeClawSettings } from './app-settings-claw'
import { normalizeScheduleSettings } from './app-settings-schedule'
import { normalizeWriteSettings } from './app-settings-write'

export function normalizeAppSettings(settings: AppSettingsV1): AppSettingsV1 {
  const migrated = shouldMigrateLegacySettings(settings)
    ? migrateLegacyAppSettings(settings as Parameters<typeof migrateLegacyAppSettings>[0])
    : settings
  const maybeSettings = migrated as AppSettingsV1 & {
    appBehavior?: Partial<AppBehaviorConfigV1>
    keyboardShortcuts?: Partial<KeyboardShortcutsConfigV1>
    notifications?: Partial<NotificationConfigV1>
    provider?: Parameters<typeof normalizeModelProviderSettings>[0]
    write?: WriteSettingsPatchV1
    claw?: ClawSettingsPatchV1
    schedule?: ScheduleSettingsPatchV1
    guiUpdate?: Partial<GuiUpdateConfigV1>
  }
  const runtime = getManagedRuntimeSettings(maybeSettings)
  return {
    ...migrated,
    schema: 'workwise.settings',
    version: 2,
    revision: Number.isSafeInteger(maybeSettings.revision) && (maybeSettings.revision ?? -1) >= 0
      ? maybeSettings.revision
      : 0,
    locale: maybeSettings.locale === 'zh' ? 'zh' : 'en',
    theme:
      maybeSettings.theme === 'light' || maybeSettings.theme === 'dark' || maybeSettings.theme === 'system'
        ? maybeSettings.theme
        : 'system',
    uiFontScale:
      maybeSettings.uiFontScale === 'small' ||
      maybeSettings.uiFontScale === 'medium' ||
      maybeSettings.uiFontScale === 'large'
        ? maybeSettings.uiFontScale
        : 'small',
    provider: normalizeModelProviderSettings(maybeSettings.provider),
    agents: kunSettingsEnvelope(mergeManagedRuntimeSettings(defaultManagedRuntimeSettings(), {
      ...runtime,
      baseUrl: runtime.baseUrl.trim() ? normalizeDeepseekBaseUrl(runtime.baseUrl) : ''
    })),
    workspaceRoot: typeof maybeSettings.workspaceRoot === 'string' ? maybeSettings.workspaceRoot : '',
    log: {
      enabled: maybeSettings.log?.enabled !== false,
      retentionDays: typeof maybeSettings.log?.retentionDays === 'number' ? maybeSettings.log.retentionDays : 2
    },
    notifications: {
      turnComplete: maybeSettings.notifications?.turnComplete !== false
    },
    appBehavior: normalizeAppBehaviorSettings(maybeSettings.appBehavior),
    keyboardShortcuts: normalizeKeyboardShortcuts(maybeSettings.keyboardShortcuts),
    write: normalizeWriteSettings(maybeSettings.write),
    claw: normalizeClawSettings(maybeSettings.claw),
    schedule: normalizeScheduleSettings(maybeSettings.schedule),
    guiUpdate: {
      channel: normalizeGuiUpdateChannel(
        maybeSettings.guiUpdate?.channel ?? DEFAULT_GUI_UPDATE_CHANNEL
      )
    },
    conversation: {
      viewMode:
        maybeSettings.conversation?.viewMode === 'standard' ||
        maybeSettings.conversation?.viewMode === 'developer'
          ? maybeSettings.conversation.viewMode
          : 'concise'
    },
    documents: {
      parsingMode:
        maybeSettings.documents?.parsingMode === 'fast' ||
        maybeSettings.documents?.parsingMode === 'accurate'
          ? maybeSettings.documents.parsingMode
          : 'auto',
      privateMineruServerUrl:
        typeof maybeSettings.documents?.privateMineruServerUrl === 'string'
          ? maybeSettings.documents.privateMineruServerUrl.trim()
          : '',
      allowPrivateServerUploadByWorkspace:
        maybeSettings.documents?.allowPrivateServerUploadByWorkspace &&
        typeof maybeSettings.documents.allowPrivateServerUploadByWorkspace === 'object'
          ? Object.fromEntries(
              Object.entries(maybeSettings.documents.allowPrivateServerUploadByWorkspace)
                .filter(([root, allowed]) => root.trim().length > 0 && allowed === true)
            )
          : {}
    },
    codePromptPrefix: typeof maybeSettings.codePromptPrefix === 'string' ? maybeSettings.codePromptPrefix : ''
  }
}

export function normalizeAppBehaviorSettings(
  settings?: Partial<AppBehaviorConfigV1>
): AppBehaviorConfigV1 {
  const openAtLogin = settings?.openAtLogin === true
  return {
    openAtLogin,
    startMinimized: openAtLogin && settings?.startMinimized === true,
    closeToTray: settings?.closeToTray === true
  }
}

function shouldMigrateLegacySettings(settings: AppSettingsV1): boolean {
  const raw = settings as AppSettingsV1 & {
    agentProvider?: unknown
    deepseek?: unknown
    agents?: {
      kun?: Partial<ReturnType<typeof defaultManagedRuntimeSettings>>
      codewhale?: unknown
      reasonix?: unknown
    }
  }
  if (!raw.agents?.kun) return true
  if ('agentProvider' in raw || 'deepseek' in raw) return true
  if (raw.agents.codewhale || raw.agents.reasonix) return true
  const dataDir = typeof raw.agents.kun.dataDir === 'string'
    ? raw.agents.kun.dataDir.replace(/\\/g, '/').toLowerCase()
    : ''
  return dataDir === '~/.deepseekgui/coreagent' || dataDir.endsWith('/.deepseekgui/coreagent')
}
