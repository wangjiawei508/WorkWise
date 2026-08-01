import type { AppSettingsV1 } from '../shared/app-settings'

export type ScheduleFlowMigrationRequest = (settings: AppSettingsV1, path: string, init: { method: string; body: string; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; body: string }>

export async function migrateSchedulesToFlows<T extends AppSettingsV1>(options: {
  settings: T
  request: ScheduleFlowMigrationRequest
  patchSettings: (patch: { schedule: { enabled: boolean } }) => Promise<T>
  logError: (scope: string, message: string, details?: Record<string, unknown>) => void
}): Promise<T> {
  if (!options.settings.schedule.tasks.length) return options.settings
  const response = await options.request(options.settings, '/v1/flows/migrations/schedules', {
    method: 'POST', body: JSON.stringify({ tasks: options.settings.schedule.tasks }), headers: { 'content-type': 'application/json' }
  })
  if (!response.ok) {
    options.logError('schedule-flow-migration', 'Failed to migrate scheduled tasks to Flow; legacy scheduling remains enabled', { status: response.status, body: response.body.slice(0, 1000) })
    return options.settings
  }
  try {
    const parsed = JSON.parse(response.body) as { migrated?: boolean; idempotent?: boolean }
    if (parsed.migrated !== true && parsed.idempotent !== true) throw new Error('Runtime did not confirm schedule migration')
    return await options.patchSettings({ schedule: { enabled: false } })
  } catch (error) {
    options.logError('schedule-flow-migration', 'Runtime returned an invalid schedule migration response; legacy scheduling remains enabled', { message: error instanceof Error ? error.message : String(error) })
    return options.settings
  }
}
