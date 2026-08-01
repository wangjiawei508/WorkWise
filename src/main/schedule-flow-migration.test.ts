import { describe, expect, it, vi } from 'vitest'
import type { AppSettingsV1 } from '../shared/app-settings'
import { migrateSchedulesToFlows } from './schedule-flow-migration'

const settingsWithTask = (): AppSettingsV1 => ({ schedule: { enabled: true, tasks: [{ id: 'task-1', title: 'Task', enabled: true, prompt: 'Run', workspaceRoot: '/tmp', model: 'model', reasoningEffort: 'medium', mode: 'workspace', schedule: { kind: 'daily', everyMinutes: 60, timeOfDay: '09:00', atTime: '' }, createdAt: '', updatedAt: '', lastRunAt: '', nextRunAt: '', lastStatus: 'idle', lastMessage: '', lastThreadId: '' }] } } as unknown as AppSettingsV1)

describe('schedule to Flow startup migration', () => {
  it('disables legacy execution only after Runtime confirms the idempotent migration', async () => {
    const settings = settingsWithTask()
    const patchSettings = vi.fn(async () => ({ ...settings, schedule: { ...settings.schedule, enabled: false } })); const request = vi.fn(async () => ({ ok: true, status: 200, body: JSON.stringify({ migrated: true }) }))
    const result = await migrateSchedulesToFlows({ settings, request, patchSettings, logError: vi.fn() })
    expect(request).toHaveBeenCalledWith(settings, '/v1/flows/migrations/schedules', expect.objectContaining({ method: 'POST' })); expect(patchSettings).toHaveBeenCalledWith({ schedule: { enabled: false } }); expect(result.schedule.enabled).toBe(false)
  })
  it('keeps legacy execution enabled when migration fails', async () => {
    const settings = settingsWithTask()
    const patchSettings = vi.fn(); const logError = vi.fn(); const result = await migrateSchedulesToFlows({ settings, request: vi.fn(async () => ({ ok: false, status: 503, body: 'offline' })), patchSettings, logError })
    expect(result).toBe(settings); expect(patchSettings).not.toHaveBeenCalled(); expect(logError).toHaveBeenCalled()
  })
})
