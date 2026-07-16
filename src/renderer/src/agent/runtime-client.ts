import type { AppSettingsPatch, WorkWiseSettingsV2 } from '@shared/app-settings'
import type {
  RuntimeRequestResult,
  SseEndPayload,
  SseErrorPayload,
  SseEventPayload
} from '@shared/workwise-api'

class RendererRuntimeClient {
  private cachedSettings: WorkWiseSettingsV2 | null = null
  private settingsPromise: Promise<WorkWiseSettingsV2> | null = null
  private settingsWriteQueue: Promise<void> = Promise.resolve()

  async getSettings(options?: { forceRefresh?: boolean }): Promise<WorkWiseSettingsV2> {
    if (options?.forceRefresh) {
      this.invalidateSettings()
    }
    if (this.cachedSettings) return this.cachedSettings
    if (this.settingsPromise) return this.settingsPromise
    const task = window.workwise.getSettings().then((settings) => {
      this.cachedSettings = settings
      return settings
    })
    this.settingsPromise = task
    void task.then(() => {
      if (this.settingsPromise === task) this.settingsPromise = null
    }, () => {
      if (this.settingsPromise === task) this.settingsPromise = null
    })
    return task
  }

  async setSettings(partial: AppSettingsPatch): Promise<WorkWiseSettingsV2> {
    const task = this.settingsWriteQueue.then(() => this.writeSettings(partial))
    this.settingsWriteQueue = task.then(() => undefined, () => undefined)
    return task
  }

  private async writeSettings(partial: AppSettingsPatch): Promise<WorkWiseSettingsV2> {
    const current = await this.getSettings()
    let settings: WorkWiseSettingsV2
    try {
      settings = await window.workwise.setSettings(partial, current.revision)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/revision conflict|stale_request/i.test(message)) throw error
      const latest = await this.getSettings({ forceRefresh: true })
      settings = await window.workwise.setSettings(partial, latest.revision)
    }
    this.cachedSettings = settings
    this.settingsPromise = null
    return settings
  }

  invalidateSettings(): void {
    this.cachedSettings = null
    this.settingsPromise = null
  }

  runtimeRequest(path: string, method?: string, body?: string): Promise<RuntimeRequestResult> {
    if (body === undefined) {
      if (method === undefined) return window.workwise.runtimeRequest(path)
      return window.workwise.runtimeRequest(path, method)
    }
    return window.workwise.runtimeRequest(path, method, body)
  }

  startSse(threadId: string, sinceSeq: number, streamId?: string): Promise<{ streamId: string }> {
    return window.workwise.startSse(threadId, sinceSeq, streamId)
  }

  stopSse(streamId: string): Promise<boolean> {
    return window.workwise.stopSse(streamId)
  }

  onSseEvent(handler: (payload: SseEventPayload) => void): () => void {
    return window.workwise.onSseEvent(handler)
  }

  onSseEnd(handler: (payload: SseEndPayload) => void): () => void {
    return window.workwise.onSseEnd(handler)
  }

  onSseError(handler: (payload: SseErrorPayload) => void): () => void {
    return window.workwise.onSseError(handler)
  }
}

export const rendererRuntimeClient = new RendererRuntimeClient()
