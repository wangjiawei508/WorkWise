import { app, dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  type AppSettingsPatch,
  type AppSettingsV1,
  type ClawRunResult,
  type ClawTaskFromTextResult,
  type ClawRuntimeStatus,
  type ScheduleRunResult,
  type ScheduleRuntimeStatus,
  type ScheduleTaskFromTextResult
} from '../../shared/app-settings'
import type {
  ClawImInstallPollResult,
  ClawImInstallQrResult,
  DesktopCommand,
  RuntimeRequestResult,
  SystemNotificationResult,
  TurnCompleteNotificationPayload,
  UpstreamModelsResult,
  WorkspacePickResult
} from '../../shared/workwise-api'
import type { WorkspaceFileSaveAsResult } from '../../shared/workspace-file'
import type { GuiUpdateDownloadResult, GuiUpdateInfo, GuiUpdateInstallResult, GuiUpdateState } from '../../shared/gui-update'
import {
  agentProfileListPayloadSchema,
  agentProfileSavePayloadSchema,
  clawMirrorPayloadSchema,
  clawImInstallPollPayloadSchema,
  confirmDialogPayloadSchema,
  clawTaskFromTextPayloadSchema,
  bundledAgentPackInstallPayloadSchema,
  cancelOperationPayloadSchema,
  bundledSkillInstallPayloadSchema,
  runtimeConfigContentSchema,
  desktopCommandSchema,
  documentEngineIdSchema,
  diagnosticsExportPayloadSchema,
  documentParsePayloadSchema,
  defaultPathSchema,
  gitBranchPayloadSchema,
  gitCheckpointCreatePayloadSchema,
  gitRollbackApplyPayloadSchema,
  gitRollbackPreviewPayloadSchema,
  githubSkillInstallPayloadSchema,
  githubSkillSyncPayloadSchema,
  guiUpdateChannelSchema,
  logErrorPayloadSchema,
  lspRequestPayloadSchema,
  managedToolIdSchema,
  mcpServerActionPayloadSchema,
  mcpServerAuthorizePayloadSchema,
  mcpServerListPayloadSchema,
  mcpServerSavePayloadSchema,
  notificationPayloadSchema,
  openEditorPathPayloadSchema,
  rootPathSchema,
  repoMapBuildPayloadSchema,
  repoMapQueryPayloadSchema,
  runtimeRequestPayloadSchema,
  scheduleTaskFromTextPayloadSchema,
  shellOpenExternalUrlSchema,
  skillListPayloadSchema,
  skillSaveFilePayloadSchema,
  settingsSetPayloadSchema,
  streamIdSchema,
  workspaceDirectoryCreatePayloadSchema,
  workspaceClipboardImageSavePayloadSchema,
  workspaceDirectoryTargetPayloadSchema,
  workspaceEntryDeletePayloadSchema,
  workspaceEntryRenamePayloadSchema,
  workspaceFileCreatePayloadSchema,
  workspaceFileSaveAsPayloadSchema,
  workspaceFileTargetPayloadSchema,
  workspaceFileWatchPayloadSchema,
  workspaceFileWritePayloadSchema,
  workspacePreviewPayloadSchema,
  workspaceTrustGetPayloadSchema,
  workspaceTrustSetPayloadSchema,
  writeAgnesImageGenerationPayloadSchema,
  writeExportPayloadSchema,
  writeRichClipboardPayloadSchema,
  writeInfographicPayloadSchema,
  writeInlineCompletionPayloadSchema,
  writeKnowledgeSearchPayloadSchema,
  workspaceRootSchema
} from './app-ipc-schemas'
import type { JsonSettingsStore } from '../settings-store'
import type { ClawRuntime } from '../claw-runtime'
import type { ScheduleRuntime } from '../schedule-runtime'
import { createAndSwitchGitBranch, getGitBranches, switchGitBranch } from '../services/git-service'
import {
  createWorkspaceDirectory,
  createWorkspaceFile,
  deleteWorkspaceEntry,
  expandHomePath,
  listEditorsResult,
  listWorkspaceDirectory,
  normalizeSkillFolderName,
  openEditorPath,
  openPathWithShell,
  readClipboardImage,
  readWorkspaceImage,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveOpenTargetPath,
  resolveWorkspaceFile,
  saveWorkspaceClipboardImage,
  writeWorkspaceFile
} from '../services/workspace-service'
import {
  clearWriteInlineCompletionDebugEntries,
  listWriteInlineCompletionDebugEntries,
  requestWriteInlineCompletion
} from '../services/write-inline-completion-service'
import { requestWriteInfographic } from '../services/write-infographic-service'
import { refreshWriteKnowledgeBase, searchWriteKnowledge } from '../services/write-knowledge-service'
import { copyWriteDocumentAsRichText, exportWriteDocument } from '../services/write-export-service'
import { generateAgnesImage } from '../services/write-agnes-image-service'
import {
  installBundledSkill,
  installGithubSkill,
  listGuiSkills,
  syncGithubManagedSkills
} from '../services/skill-service'
import { installBundledAgentPack } from '../services/agent-pack-service'
import {
  diagnoseManagedTool,
  installManagedTool,
  listManagedTools,
  removeManagedTool,
  updateManagedTool
} from '../services/managed-tool-service'
import { appCancellationRegistry } from '../cancellation-registry'
import { runtimeThreadInterruptPath } from '../../shared/runtime-endpoints'
import { atomicWriteFile as durableWriteFile } from '../services/durable-file'
import { AgentProfileService } from '../services/agent-profile-service'
import { WorkspaceTrustService } from '../services/workspace-trust-service'
import { DocumentEngineService } from '../services/document-engine-service'
import { WorkspacePreviewService } from '../services/workspace-preview-service'
import { GitCheckpointService } from '../services/git-checkpoint-service'
import { RepoMapService } from '../services/repo-map-service'
import { McpConfigService } from '../services/mcp-config-service'

type GuiUpdaterModule = typeof import('../gui-updater')

type WorkspaceFileWatchRecord = {
  watcher: FSWatcher
  sender: WebContents
  path: string
  workspaceRoot: string
  timer: ReturnType<typeof setTimeout> | null
}

type RegisterAppIpcHandlersOptions = {
  store: JsonSettingsStore
  getMainWindow: () => BrowserWindow | null
  applySettingsPatch: (partial: AppSettingsPatch, expectedRevision?: number) => Promise<AppSettingsV1>
  runtimeRequest: (
    path: string,
    method?: string,
    body?: string
  ) => Promise<RuntimeRequestResult>
  fetchUpstreamModels: () => Promise<UpstreamModelsResult>
  getClawRuntime: () => ClawRuntime | null
  getScheduleRuntime: () => ScheduleRuntime | null
  startFeishuInstallQrcode: (isLark: boolean) => Promise<ClawImInstallQrResult>
  pollFeishuInstall: (deviceCode: string) => Promise<ClawImInstallPollResult>
  startWeixinInstallQrcode: (weixinBridgeUrl?: string) => Promise<ClawImInstallQrResult>
  pollWeixinInstall: (deviceCode: string, weixinBridgeUrl?: string) => Promise<ClawImInstallPollResult>
  resolveRuntimeConfigPath: () => string
  onRuntimeMcpConfigWritten?: (path: string, content: string) => Promise<void> | void
  showTurnCompleteNotification: (
    payload: TurnCompleteNotificationPayload
  ) => Promise<SystemNotificationResult>
  getAppVersion: () => string
  readGuiUpdateState: () => Promise<GuiUpdateState>
  loadGuiUpdaterModule: () => Promise<GuiUpdaterModule>
  resolveLogDirectory: () => string
  logError: (category: string, message: string, detail?: unknown) => void
}

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw new Error(`Invalid payload for ${channel}: ${issue?.message ?? 'Bad request.'}`)
}

function safeSaveAsFileName(input: string | undefined, fallback = 'generated-file'): string {
  const candidate = (input ?? '').trim().replace(/\0/g, '')
  const name = basename(candidate) || fallback
  if (name === '.' || name === '..') return fallback
  return name
}

function saveDialogFilters(fileName: string, mimeType: string | undefined): Electron.FileFilter[] {
  const ext = extname(fileName).replace(/^\./, '').trim()
  const mime = mimeType?.toLowerCase().trim() ?? ''
  const filters: Electron.FileFilter[] = []
  if (mime.startsWith('image/')) {
    filters.push({ name: 'Images', extensions: ext ? [ext] : ['png', 'jpg', 'jpeg', 'webp', 'gif'] })
  } else if (mime.startsWith('video/')) {
    filters.push({ name: 'Videos', extensions: ext ? [ext] : ['mp4', 'webm', 'mov', 'm4v'] })
  } else if (ext) {
    filters.push({ name: `${ext.toUpperCase()} file`, extensions: [ext] })
  }
  filters.push({ name: 'All Files', extensions: ['*'] })
  return filters
}

async function saveWorkspaceFileAs(
  payload: unknown,
  getMainWindow: () => BrowserWindow | null
): Promise<WorkspaceFileSaveAsResult> {
  const request = parseIpcPayload('file:save-as', workspaceFileSaveAsPayloadSchema, payload)
  try {
    const sourcePath = request.sourcePath
      ? await resolveOpenTargetPath(request.sourcePath, request.workspaceRoot, { allowBasenameFallback: false })
      : ''
    const fileName = safeSaveAsFileName(request.suggestedName || (sourcePath ? basename(sourcePath) : undefined))
    const defaultPath = request.workspaceRoot?.trim()
      ? join(expandHomePath(request.workspaceRoot), fileName)
      : fileName
    const options: Electron.SaveDialogOptions = {
      title: 'Save generated file',
      defaultPath,
      filters: saveDialogFilters(fileName, request.mimeType)
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true, message: 'Save cancelled.' }
    }

    const targetPath = resolve(result.filePath)
    await mkdir(dirname(targetPath), { recursive: true })
    if (sourcePath) {
      if (resolve(sourcePath) !== targetPath) {
        await durableWriteFile(targetPath, await readFile(sourcePath))
      }
    } else if (request.dataBase64) {
      await durableWriteFile(targetPath, Buffer.from(request.dataBase64, 'base64'))
    } else {
      return { ok: false, message: 'No file data was available to save.' }
    }
    return { ok: true, path: targetPath }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function validateMcpConfigContent(content: string): void {
  const trimmed = content.trim()
  if (!trimmed) return
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`MCP config must be JSON: ${message}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MCP config must be a JSON object.')
  }
}

function runDesktopCommand(
  command: DesktopCommand,
  sender: WebContents,
  getMainWindow: () => BrowserWindow | null
): void {
  const mainWindow = getMainWindow()
  const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : sender

  switch (command) {
    case 'undo':
      contents.undo()
      return
    case 'redo':
      contents.redo()
      return
    case 'cut':
      contents.cut()
      return
    case 'copy':
      contents.copy()
      return
    case 'paste':
      contents.paste()
      return
    case 'selectAll':
      contents.selectAll()
      return
    case 'reload':
      contents.reload()
      return
    case 'zoomIn':
      contents.setZoomLevel(contents.getZoomLevel() + 1)
      return
    case 'zoomOut':
      contents.setZoomLevel(contents.getZoomLevel() - 1)
      return
    case 'resetZoom':
      contents.setZoomLevel(0)
      return
    case 'toggleDevTools':
      contents.toggleDevTools()
      return
    case 'minimize':
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
      return
    case 'toggleMaximize':
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      return
    case 'close':
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
      return
    case 'quit':
      app.quit()
      return
  }
}

export function registerAppIpcHandlers(options: RegisterAppIpcHandlersOptions): void {
  const {
    store,
    getMainWindow,
    applySettingsPatch,
    runtimeRequest,
    fetchUpstreamModels,
    getClawRuntime,
    getScheduleRuntime,
    startFeishuInstallQrcode,
    pollFeishuInstall,
    startWeixinInstallQrcode,
    pollWeixinInstall,
    resolveRuntimeConfigPath,
    onRuntimeMcpConfigWritten,
    showTurnCompleteNotification,
    getAppVersion,
    readGuiUpdateState,
    loadGuiUpdaterModule,
    resolveLogDirectory,
    logError
  } = options
  const workspaceFileWatchers = new Map<string, WorkspaceFileWatchRecord>()
  const agentProfileService = new AgentProfileService()
  const workspaceTrustService = new WorkspaceTrustService()
  const documentEngineService = new DocumentEngineService({
    resourcesPath: process.resourcesPath,
    developmentRoot: process.cwd()
  })
  const workspacePreviewService = new WorkspacePreviewService(documentEngineService)
  const gitCheckpointService = new GitCheckpointService()
  const repoMapService = new RepoMapService()
  const mcpConfigService = new McpConfigService()
  let skillCatalogGeneration = 1

  const notifySkillsChanged = (): number => {
    skillCatalogGeneration += 1
    getMainWindow()?.webContents.send('skills:changed', skillCatalogGeneration)
    return skillCatalogGeneration
  }

  const loadSkillCatalog = async (workspaceRoot?: string) => {
    const settings = await store.load()
    const result = await listGuiSkills(settings, workspaceRoot)
    return result.ok ? { ...result, generation: skillCatalogGeneration } : result
  }

  const disposeWorkspaceFileWatch = (watchId: string): boolean => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return false
    if (record.timer) clearTimeout(record.timer)
    try {
      record.watcher.close()
    } catch (error) {
      logError('workspace-watch', 'Failed to close workspace file watcher', {
        watchId,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    workspaceFileWatchers.delete(watchId)
    return true
  }

  const disposeWorkspaceFileWatchesForSender = (sender: WebContents): void => {
    for (const [watchId, record] of workspaceFileWatchers) {
      if (record.sender.id === sender.id) {
        disposeWorkspaceFileWatch(watchId)
      }
    }
  }

  const emitWorkspaceFileChange = async (watchId: string): Promise<void> => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return
    const changedAt = new Date().toISOString()
    try {
      const result = await readWorkspaceFile({
        path: record.path,
        workspaceRoot: record.workspaceRoot
      })
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest || latest.sender.isDestroyed()) return
      if (result.ok) {
        latest.sender.send('file:workspace-changed', {
          ok: true,
          watchId,
          workspaceRoot: latest.workspaceRoot,
          path: result.path,
          content: result.content,
          size: result.size,
          truncated: result.truncated,
          changedAt
        })
        return
      }
      latest.sender.send('file:workspace-changed', {
        ok: false,
        watchId,
        workspaceRoot: latest.workspaceRoot,
        path: latest.path,
        message: result.message,
        changedAt
      })
    } catch (error) {
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest || latest.sender.isDestroyed()) return
      latest.sender.send('file:workspace-changed', {
        ok: false,
        watchId,
        workspaceRoot: latest.workspaceRoot,
        path: latest.path,
        message: error instanceof Error ? error.message : String(error),
        changedAt
      })
    }
  }

  const scheduleWorkspaceFileChange = (watchId: string): void => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return
    if (record.timer) clearTimeout(record.timer)
    record.timer = setTimeout(() => {
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest) return
      latest.timer = null
      void emitWorkspaceFileChange(watchId)
    }, 90)
  }

  ipcMain.handle('settings:get', async () => store.load())
  ipcMain.handle('settings:set', async (_, payload: unknown) => {
    const parsed = parseIpcPayload('settings:set', settingsSetPayloadSchema, payload)
    return parsed.expectedRevision === undefined
      ? applySettingsPatch(parsed.patch as AppSettingsPatch)
      : applySettingsPatch(parsed.patch as AppSettingsPatch, parsed.expectedRevision)
  })

  ipcMain.handle('runtime:request', async (_, payload: unknown) => {
    const request = parseIpcPayload('runtime:request', runtimeRequestPayloadSchema, payload)
    const method = (request.method ?? 'GET').toUpperCase()
    const deleteThread = method === 'DELETE'
      ? /^\/v1\/threads\/([^/?]+)$/.exec(request.path)
      : null
    if (deleteThread?.[1]) {
      await appCancellationRegistry.cancel(
        { scope: 'thread', id: decodeURIComponent(deleteThread[1]) },
        'thread_deleted'
      )
    }
    const result = await runtimeRequest(request.path, request.method, request.body)
    const startMatch = method === 'POST'
      ? /^\/v1\/threads\/([^/?]+)\/(?:turns|review)$/.exec(request.path)
      : null
    if (result.ok && startMatch?.[1]) {
      try {
        const body = JSON.parse(result.body) as { threadId?: unknown; turnId?: unknown }
        const threadId = typeof body.threadId === 'string'
          ? body.threadId
          : decodeURIComponent(startMatch[1])
        const turnId = typeof body.turnId === 'string' ? body.turnId : ''
        if (threadId && turnId) {
          appCancellationRegistry.register(
            { scope: 'thread', id: threadId },
            { parent: { scope: 'app', id: 'app' } }
          )
          appCancellationRegistry.register(
            { scope: 'turn', id: turnId },
            {
              parent: { scope: 'thread', id: threadId },
              cleanup: async () => {
                await runtimeRequest(
                  runtimeThreadInterruptPath(threadId, turnId),
                  'POST',
                  JSON.stringify({ discard: false })
                ).catch(() => undefined)
              }
            }
          )
        }
      } catch {
        // Invalid successful responses are handled by the renderer contract parser.
      }
    }
    return result
  })
  ipcMain.handle('diagnostics:export-task', async (_, payload: unknown) => {
    const request = parseIpcPayload('diagnostics:export-task', diagnosticsExportPayloadSchema, payload)
    const response = await runtimeRequest(`/v1/tasks/${encodeURIComponent(request.taskId)}/diagnostics`, 'GET')
    if (!response.ok) {
      return { ok: false, message: `Unable to collect diagnostics (${response.status}).` }
    }
    let normalized: string
    try {
      normalized = `${JSON.stringify(JSON.parse(response.body), null, 2)}\n`
    } catch {
      return { ok: false, message: 'The runtime returned an invalid diagnostics response.' }
    }
    const options: Electron.SaveDialogOptions = {
      title: '导出 WorkWise 任务诊断包',
      defaultPath: `WorkWise-task-diagnostics-${request.taskId}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    await durableWriteFile(result.filePath, normalized)
    return { ok: true, path: result.filePath }
  })
  ipcMain.handle('operation:cancel', async (_, payload: unknown) => {
    const request = parseIpcPayload('operation:cancel', cancelOperationPayloadSchema, payload)
    const cancelled = await appCancellationRegistry.cancel(
      { scope: request.scope, id: request.id },
      request.reason
    )
    return { ok: true as const, cancelled }
  })

  ipcMain.handle('agent-profile:list', async (_, payload: unknown) => {
    const request = parseIpcPayload('agent-profile:list', agentProfileListPayloadSchema, payload)
    return agentProfileService.list(request.workspaceRoot)
  })
  ipcMain.handle('agent-profile:save', async (_, payload: unknown) => {
    const request = parseIpcPayload('agent-profile:save', agentProfileSavePayloadSchema, payload)
    return agentProfileService.save({
      scope: request.scope,
      workspaceRoot: request.workspaceRoot,
      profile: request.profile,
      expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey
    })
  })
  ipcMain.handle('workspace-trust:get', async (_, payload: unknown) => {
    const request = parseIpcPayload('workspace-trust:get', workspaceTrustGetPayloadSchema, payload)
    return workspaceTrustService.get(request.workspaceRoot)
  })
  ipcMain.handle('workspace-trust:set', async (_, payload: unknown) => {
    const request = parseIpcPayload('workspace-trust:set', workspaceTrustSetPayloadSchema, payload)
    return workspaceTrustService.set({
      workspaceRoot: request.workspaceRoot,
      level: request.level,
      expectedRevision: request.expectedRevision,
      confirmed: request.confirmed,
      idempotencyKey: request.idempotencyKey
    })
  })
  ipcMain.handle('mcp-server:list', async (_, payload: unknown) => {
    const request = parseIpcPayload('mcp-server:list', mcpServerListPayloadSchema, payload)
    return mcpConfigService.list(request.workspaceRoot)
  })
  ipcMain.handle('mcp-server:save', async (_, payload: unknown) => {
    const request = parseIpcPayload('mcp-server:save', mcpServerSavePayloadSchema, payload)
    return mcpConfigService.save(request)
  })
  ipcMain.handle('mcp-server:test', async (_, payload: unknown) => {
    const request = parseIpcPayload('mcp-server:test', mcpServerActionPayloadSchema, payload)
    return mcpConfigService.test(request.serverId, request.workspaceRoot)
  })
  ipcMain.handle('mcp-server:authorize', async (_, payload: unknown) => {
    const request = parseIpcPayload('mcp-server:authorize', mcpServerAuthorizePayloadSchema, payload)
    return mcpConfigService.authorize(request)
  })
  ipcMain.handle('document-engine:list', async () => {
    const settings = await store.load()
    return documentEngineService.listEngines(settings.documents.privateMineruServerUrl)
  })
  ipcMain.handle('document-engine:diagnose', async (_, payload: unknown) => {
    const id = parseIpcPayload('document-engine:diagnose', documentEngineIdSchema, payload)
    const settings = await store.load()
    const status = await documentEngineService.listEngines(settings.documents.privateMineruServerUrl)
    return status.find((entry) => entry.id === id)!
  })
  ipcMain.handle('document-engine:install', async (_, payload: unknown) => {
    const id = parseIpcPayload('document-engine:install', documentEngineIdSchema, payload)
    const settings = await store.load()
    const status = await documentEngineService.listEngines(settings.documents.privateMineruServerUrl)
    const current = status.find((entry) => entry.id === id)!
    if (id === 'mineru-local' && current.state === 'not_installed') {
      return documentEngineService.installMineru()
    }
    return current
  })
  ipcMain.handle('document-engine:parse', async (_, payload: unknown) => {
    const request = parseIpcPayload('document-engine:parse', documentParsePayloadSchema, payload)
    const settings = await store.load()
    const allowed = settings.documents.allowPrivateServerUploadByWorkspace[request.workspaceRoot] === true
    return documentEngineService.parse({
      ...request,
      allowPrivateServerUpload: request.allowPrivateServerUpload === true && allowed
    })
  })
  ipcMain.handle('document-engine:cancel', async (_, payload: unknown) => {
    const parseId = parseIpcPayload('document-engine:cancel', streamIdSchema, payload)
    return documentEngineService.cancel(parseId)
  })
  ipcMain.handle('file:preview-workspace', async (_, payload: unknown) => {
    const request = parseIpcPayload('file:preview-workspace', workspacePreviewPayloadSchema, payload)
    return workspacePreviewService.preview(request)
  })

  ipcMain.handle('upstream:models', async () => fetchUpstreamModels())

  ipcMain.handle('claw:status', async (): Promise<ClawRuntimeStatus> =>
    getClawRuntime()?.status() ?? {
      imServerRunning: false,
      imUrl: '',
      runningTaskIds: []
    }
  )

  ipcMain.handle('claw:task:run', async (_, taskId: unknown): Promise<ClawRunResult> => {
    const normalizedTaskId = parseIpcPayload('claw:task:run', streamIdSchema, taskId)
    const scheduleRuntime = getScheduleRuntime()
    if (!scheduleRuntime) return { ok: false, message: 'Schedule runtime is not initialized.' }
    return scheduleRuntime.runTask(normalizedTaskId)
  })

  ipcMain.handle('schedule:status', async (): Promise<ScheduleRuntimeStatus> =>
    getScheduleRuntime()?.status() ?? {
      internalServerRunning: false,
      internalUrl: '',
      runningTaskIds: [],
      powerSaveBlockerActive: false
    }
  )

  ipcMain.handle('schedule:task:run', async (_, taskId: unknown): Promise<ScheduleRunResult> => {
    const normalizedTaskId = parseIpcPayload('schedule:task:run', streamIdSchema, taskId)
    const scheduleRuntime = getScheduleRuntime()
    if (!scheduleRuntime) return { ok: false, message: 'Schedule runtime is not initialized.' }
    return scheduleRuntime.runTask(normalizedTaskId)
  })

  ipcMain.handle(
    'claw:channel:mirror',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('claw:channel:mirror', clawMirrorPayloadSchema, payload)
      const clawRuntime = getClawRuntime()
      if (!clawRuntime) return { ok: false as const, message: 'Claw runtime is not initialized.' }
      return clawRuntime.mirrorThreadMessageToIm(
        request.threadId,
        request.text,
        request.direction
      )
    }
  )

  ipcMain.handle(
    'claw:channel:mirror-to-feishu',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('claw:channel:mirror-to-feishu', clawMirrorPayloadSchema, payload)
      const clawRuntime = getClawRuntime()
      if (!clawRuntime) return { ok: false as const, message: 'Claw runtime is not initialized.' }
      return clawRuntime.mirrorThreadMessageToIm(
        request.threadId,
        request.text,
        request.direction
      )
    }
  )

  ipcMain.handle(
    'claw:task:create-from-text',
    async (_, payload: unknown): Promise<ClawTaskFromTextResult> => {
      const request = parseIpcPayload(
        'claw:task:create-from-text',
        clawTaskFromTextPayloadSchema,
        payload
      )
      const scheduleRuntime = getScheduleRuntime()
      if (!scheduleRuntime) return { kind: 'error', message: 'Schedule runtime is not initialized.' }
      const settings = await store.load()
      const channel = request.channelId
        ? settings.claw.channels.find((item) => item.id === request.channelId)
        : undefined
      return scheduleRuntime.createScheduledTaskFromText(request.text, {
        workspaceRoot: channel?.workspaceRoot || settings.schedule.defaultWorkspaceRoot || settings.workspaceRoot,
        modelHint: request.modelHint,
        mode: request.mode
      })
    }
  )

  ipcMain.handle(
    'schedule:task:create-from-text',
    async (_, payload: unknown): Promise<ScheduleTaskFromTextResult> => {
      const request = parseIpcPayload(
        'schedule:task:create-from-text',
        scheduleTaskFromTextPayloadSchema,
        payload
      )
      const scheduleRuntime = getScheduleRuntime()
      if (!scheduleRuntime) return { kind: 'error', message: 'Schedule runtime is not initialized.' }
      return scheduleRuntime.createScheduledTaskFromText(request.text, {
        workspaceRoot: request.workspaceRoot,
        modelHint: request.modelHint,
        mode: request.mode
      })
    }
  )

  ipcMain.handle(
    'claw:im-install:qrcode',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'claw:im-install:qrcode',
        z.object({ provider: z.enum(['feishu', 'weixin']), isLark: z.boolean().optional() }).strict(),
        payload
      )
      if (request.provider === 'weixin') {
        return startWeixinInstallQrcode()
      }
      return startFeishuInstallQrcode(request.isLark === true)
    }
  )

  ipcMain.handle(
    'claw:im-install:poll',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('claw:im-install:poll', clawImInstallPollPayloadSchema, payload)
      if (request.provider === 'weixin') {
        return pollWeixinInstall(request.deviceCode)
      }
      return pollFeishuInstall(request.deviceCode)
    }
  )

  ipcMain.handle('workspace:pick-directory', async (_, defaultPath: unknown): Promise<WorkspacePickResult> => {
    const normalizedDefaultPath = parseIpcPayload(
      'workspace:pick-directory',
      z.object({ defaultPath: defaultPathSchema }).strict(),
      { defaultPath }
    ).defaultPath
    const options: Electron.OpenDialogOptions = {
      title: 'Select working directory',
      defaultPath: normalizedDefaultPath,
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent']
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return {
      canceled: result.canceled,
      path: result.canceled ? null : (result.filePaths[0] ?? null)
    }
  })

  // Replaces window.confirm in the renderer: the synchronous native confirm
  // leaves the WebContents unable to focus inputs after it closes
  // (electron/electron#19977), which froze the composer after deleting threads.
  ipcMain.handle('dialog:confirm', async (_, payload: unknown): Promise<boolean> => {
    const request = parseIpcPayload('dialog:confirm', confirmDialogPayloadSchema, payload)
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: [request.confirmLabel ?? 'OK', request.cancelLabel ?? 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: request.message,
      detail: request.detail,
      noLink: true
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options)
    return result.response === 0
  })

  ipcMain.handle(
    'skill:save-file',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('skill:save-file', skillSaveFilePayloadSchema, payload)
      try {
        const rootPath = expandHomePath(request.rootPath)
        if (!rootPath) {
          return { ok: false as const, message: 'Skill directory is required.' }
        }
        const skillName = normalizeSkillFolderName(request.skillName)
        const skillDir = join(rootPath, skillName)
        const filePath = join(skillDir, 'SKILL.md')
        await mkdir(skillDir, { recursive: true })
        await durableWriteFile(filePath, request.content)
        notifySkillsChanged()
        return { ok: true as const, path: filePath }
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('skill:list', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:list', skillListPayloadSchema, payload)
    return loadSkillCatalog(request.workspaceRoot)
  })

  ipcMain.handle('skill:refresh', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:refresh', skillListPayloadSchema, payload)
    return loadSkillCatalog(request.workspaceRoot)
  })

  ipcMain.handle('skill:install-github', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:install-github', githubSkillInstallPayloadSchema, payload)
    const result = await installGithubSkill(request.rootPath, request.source)
    if (result.ok) notifySkillsChanged()
    return result
  })

  ipcMain.handle('skill:install-bundled', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:install-bundled', bundledSkillInstallPayloadSchema, payload)
    const result = await installBundledSkill(request.rootPath, request.source)
    if (result.ok) notifySkillsChanged()
    return result
  })

  ipcMain.handle('agent-pack:install-bundled', async (_, payload: unknown) => {
    const request = parseIpcPayload('agent-pack:install-bundled', bundledAgentPackInstallPayloadSchema, payload)
    return installBundledAgentPack(request.source)
  })

  ipcMain.handle('skill:sync-github', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:sync-github', githubSkillSyncPayloadSchema, payload)
    const settings = await store.load()
    const result = await syncGithubManagedSkills(settings, request.workspaceRoot)
    if (result.ok && result.updated > 0) notifySkillsChanged()
    return result
  })

  ipcMain.handle('tool:list-managed', async () => listManagedTools())

  ipcMain.handle('tool:install-managed', async (_, payload: unknown) => {
    const id = parseIpcPayload('tool:install-managed', managedToolIdSchema, payload)
    const result = await installManagedTool(id)
    if (result.ok) notifySkillsChanged()
    return result
  })

  ipcMain.handle('tool:update-managed', async (_, payload: unknown) => {
    const id = parseIpcPayload('tool:update-managed', managedToolIdSchema, payload)
    const result = await updateManagedTool(id)
    if (result.ok) notifySkillsChanged()
    return result
  })

  ipcMain.handle('tool:diagnose-managed', async (_, payload: unknown) => {
    const id = parseIpcPayload('tool:diagnose-managed', managedToolIdSchema, payload)
    return diagnoseManagedTool(id)
  })

  ipcMain.handle('tool:remove-managed', async (_, payload: unknown) => {
    const id = parseIpcPayload('tool:remove-managed', managedToolIdSchema, payload)
    const result = await removeManagedTool(id)
    if (result.ok) notifySkillsChanged()
    return result
  })

  ipcMain.handle('skill:open-root', async (_, rootPath: unknown) => {
    const normalizedRootPath = parseIpcPayload('skill:open-root', rootPathSchema, rootPath)
    try {
      const target = expandHomePath(normalizedRootPath)
      if (!target) {
        return { ok: false as const, message: 'Skill directory is required.' }
      }
      await mkdir(target, { recursive: true })
      return openPathWithShell(target)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('runtime:config:read', async () => {
    const path = resolveRuntimeConfigPath()
    try {
      const content = await readFile(path, 'utf8')
      return { path, content, exists: true as const }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { path, content: '', exists: false as const }
      }
      throw error
    }
  })

  ipcMain.handle('runtime:config:write', async (_, content: unknown) => {
    const validatedContent = parseIpcPayload(
      'runtime:config:write',
      runtimeConfigContentSchema,
      content
    )
    const path = resolveRuntimeConfigPath()
    validateMcpConfigContent(validatedContent)
    await mkdir(dirname(path), { recursive: true })
    await durableWriteFile(path, validatedContent)
    try {
      await onRuntimeMcpConfigWritten?.(path, validatedContent)
    } catch (error: unknown) {
      logError('mcp-config', 'Failed to apply MCP config change after write', {
        path,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    return { ok: true as const, path }
  })

  ipcMain.handle('runtime:config:open-dir', async () => {
    try {
      const path = resolveRuntimeConfigPath()
      const dirPath = dirname(path)
      await mkdir(dirPath, { recursive: true })
      return openPathWithShell(dirPath)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('git:branches', async (_, workspaceRoot: unknown) =>
    getGitBranches(parseIpcPayload('git:branches', workspaceRootSchema, workspaceRoot))
  )
  ipcMain.handle(
    'git:switch-branch',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:switch-branch', gitBranchPayloadSchema, payload)
      return switchGitBranch(request.workspaceRoot, request.branch)
    }
  )
  ipcMain.handle(
    'git:create-and-switch-branch',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'git:create-and-switch-branch',
        gitBranchPayloadSchema,
        payload
      )
      return createAndSwitchGitBranch(request.workspaceRoot, request.branch)
    }
  )
  ipcMain.handle('git:checkpoint:create', async (_, payload: unknown) => {
    const request = parseIpcPayload('git:checkpoint:create', gitCheckpointCreatePayloadSchema, payload)
    return gitCheckpointService.create(request)
  })
  ipcMain.handle('git:rollback:preview', async (_, payload: unknown) => {
    const request = parseIpcPayload('git:rollback:preview', gitRollbackPreviewPayloadSchema, payload)
    return gitCheckpointService.preview(request)
  })
  ipcMain.handle('git:rollback:apply', async (_, payload: unknown) => {
    const request = parseIpcPayload('git:rollback:apply', gitRollbackApplyPayloadSchema, payload)
    return gitCheckpointService.apply(request)
  })
  ipcMain.handle('repo-map:build', async (_, payload: unknown) => {
    const request = parseIpcPayload('repo-map:build', repoMapBuildPayloadSchema, payload)
    return repoMapService.build(request)
  })
  ipcMain.handle('repo-map:query', async (_, payload: unknown) => {
    const request = parseIpcPayload('repo-map:query', repoMapQueryPayloadSchema, payload)
    return repoMapService.query(request)
  })
  ipcMain.handle('lsp:request', async (_, payload: unknown) => {
    const request = parseIpcPayload('lsp:request', lspRequestPayloadSchema, payload)
    return repoMapService.lsp(request)
  })

  ipcMain.handle('editor:list', async () => listEditorsResult())
  ipcMain.handle('editor:open-path', async (_, payload: unknown) =>
    openEditorPath(parseIpcPayload('editor:open-path', openEditorPathPayloadSchema, payload))
  )

  ipcMain.handle('file:resolve-workspace', async (_, payload: unknown) =>
    resolveWorkspaceFile(
      parseIpcPayload('file:resolve-workspace', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:list-workspace-directory', async (_, payload: unknown) =>
    listWorkspaceDirectory(
      parseIpcPayload('file:list-workspace-directory', workspaceDirectoryTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:read-workspace', async (_, payload: unknown) =>
    readWorkspaceFile(
      parseIpcPayload('file:read-workspace', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:read-workspace-image', async (_, payload: unknown) =>
    readWorkspaceImage(
      parseIpcPayload('file:read-workspace-image', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:open-workspace', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'file:open-workspace',
      workspaceFileTargetPayloadSchema,
      payload
    )
    try {
      const target = await resolveOpenTargetPath(request.path, request.workspaceRoot, {
        allowBasenameFallback: false
      })
      return openPathWithShell(target)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })
  ipcMain.handle('file:reveal-workspace', async (_, payload: unknown) => {
    const request = parseIpcPayload(
      'file:reveal-workspace',
      workspaceFileTargetPayloadSchema,
      payload
    )
    try {
      const target = await resolveOpenTargetPath(request.path, request.workspaceRoot, {
        allowBasenameFallback: false
      })
      shell.showItemInFolder(target)
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })
  ipcMain.handle('file:save-as', async (_, payload: unknown) =>
    saveWorkspaceFileAs(payload, getMainWindow)
  )
  ipcMain.handle('file:write-workspace', async (_, payload: unknown) =>
    writeWorkspaceFile(
      parseIpcPayload('file:write-workspace', workspaceFileWritePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:create-workspace', async (_, payload: unknown) =>
    createWorkspaceFile(
      parseIpcPayload('file:create-workspace', workspaceFileCreatePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:create-workspace-directory', async (_, payload: unknown) =>
    createWorkspaceDirectory(
      parseIpcPayload('file:create-workspace-directory', workspaceDirectoryCreatePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:save-workspace-clipboard-image', async (_, payload: unknown) =>
    saveWorkspaceClipboardImage(
      parseIpcPayload(
        'file:save-workspace-clipboard-image',
        workspaceClipboardImageSavePayloadSchema,
        payload
      )
    )
  )
  ipcMain.handle('clipboard:read-image', async () => readClipboardImage())
  ipcMain.handle('file:rename-workspace-entry', async (_, payload: unknown) =>
    renameWorkspaceEntry(
      parseIpcPayload('file:rename-workspace-entry', workspaceEntryRenamePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:delete-workspace-entry', async (_, payload: unknown) =>
    deleteWorkspaceEntry(
      parseIpcPayload('file:delete-workspace-entry', workspaceEntryDeletePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:watch-workspace', async (event, payload: unknown) => {
    const request = parseIpcPayload('file:watch-workspace', workspaceFileWatchPayloadSchema, payload)
    const initial = await readWorkspaceFile(request)
    let watchedPath: string
    let initialContent: string
    let initialSize: number
    let initialTruncated: boolean
    if (initial.ok) {
      watchedPath = initial.path
      initialContent = initial.content
      initialSize = initial.size
      initialTruncated = initial.truncated
    } else {
      const initialImage = await readWorkspaceImage(request)
      if (!initialImage.ok) return initial
      watchedPath = initialImage.path
      initialContent = ''
      initialSize = initialImage.size
      initialTruncated = false
    }

    const watchId = randomUUID()
    try {
      const watcher = watch(watchedPath, { persistent: false }, () => {
        scheduleWorkspaceFileChange(watchId)
      })
      workspaceFileWatchers.set(watchId, {
        watcher,
        sender: event.sender,
        path: watchedPath,
        workspaceRoot: request.workspaceRoot,
        timer: null
      })
      event.sender.once('destroyed', () => disposeWorkspaceFileWatchesForSender(event.sender))
      return {
        ok: true as const,
        watchId,
        path: watchedPath,
        content: initialContent,
        size: initialSize,
        truncated: initialTruncated,
        startedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })
  ipcMain.handle('file:unwatch-workspace', async (_, watchId: unknown) =>
    disposeWorkspaceFileWatch(parseIpcPayload('file:unwatch-workspace', streamIdSchema, watchId))
  )
  ipcMain.handle('write:export', async (_, payload: unknown) =>
    exportWriteDocument(
      parseIpcPayload('write:export', writeExportPayloadSchema, payload),
      { parentWindow: getMainWindow() }
    )
  )
  ipcMain.handle('write:copy-rich-text', async (_, payload: unknown) =>
    copyWriteDocumentAsRichText(
      parseIpcPayload('write:copy-rich-text', writeRichClipboardPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:agnes-image-generate', async (_, payload: unknown) =>
    generateAgnesImage(
      await store.load(),
      parseIpcPayload('write:agnes-image-generate', writeAgnesImageGenerationPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:inline-completion', async (_, payload: unknown) =>
    requestWriteInlineCompletion(
      await store.load(),
      parseIpcPayload('write:inline-completion', writeInlineCompletionPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:generate-infographic', async (_, payload: unknown) =>
    requestWriteInfographic(
      await store.load(),
      parseIpcPayload('write:generate-infographic', writeInfographicPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:inline-completion-debug:list', async () => listWriteInlineCompletionDebugEntries())
  ipcMain.handle('write:inline-completion-debug:clear', async () => {
    clearWriteInlineCompletionDebugEntries()
    return true
  })
  ipcMain.handle('write:knowledge-base:status', async () => {
    const settings = await store.load()
    return refreshWriteKnowledgeBase(settings.write.knowledgeBase)
  })
  ipcMain.handle('write:knowledge-base:refresh', async () => {
    const settings = await store.load()
    return refreshWriteKnowledgeBase(settings.write.knowledgeBase)
  })
  ipcMain.handle('write:knowledge-base:search', async (_, payload: unknown) => {
    const settings = await store.load()
    const { query } = parseIpcPayload('write:knowledge-base:search', writeKnowledgeSearchPayloadSchema, payload)
    return searchWriteKnowledge(query, settings.write.knowledgeBase)
  })
  ipcMain.handle('desktop:command', async (event, command: unknown) => {
    runDesktopCommand(
      parseIpcPayload('desktop:command', desktopCommandSchema, command),
      event.sender,
      getMainWindow
    )
  })
  ipcMain.handle('shell:open-external', async (_, url: unknown) => {
    const validatedUrl = parseIpcPayload('shell:open-external', shellOpenExternalUrlSchema, url)
    await shell.openExternal(validatedUrl)
  })
  ipcMain.handle('notification:turn-complete', async (_, payload: unknown) =>
    showTurnCompleteNotification(
      parseIpcPayload('notification:turn-complete', notificationPayloadSchema, payload)
    )
  )
  ipcMain.handle('app:version', async () => getAppVersion())
  ipcMain.handle('gui:update-state', async () => readGuiUpdateState())
  ipcMain.handle('gui:update-check', async (_, channel: unknown): Promise<GuiUpdateInfo> => {
    const module = await loadGuiUpdaterModule()
    return module.checkGuiUpdate(
      parseIpcPayload(
        'gui:update-check',
        z.object({ channel: guiUpdateChannelSchema }).strict(),
        { channel }
      ).channel
    )
  })
  ipcMain.handle('gui:update-download', async (_, channel: unknown): Promise<GuiUpdateDownloadResult> => {
    const module = await loadGuiUpdaterModule()
    return module.downloadGuiUpdate(
      parseIpcPayload(
        'gui:update-download',
        z.object({ channel: guiUpdateChannelSchema }).strict(),
        { channel }
      ).channel
    )
  })
  ipcMain.handle('gui:update-install', async (): Promise<GuiUpdateInstallResult> => {
    const module = await loadGuiUpdaterModule()
    return module.installGuiUpdate()
  })

  ipcMain.handle('log:error', async (_, payload: unknown) => {
    const request = parseIpcPayload('log:error', logErrorPayloadSchema, payload)
    logError(request.category, request.message, request.detail)
  })
  ipcMain.handle('log:get-path', async () => resolveLogDirectory())
  ipcMain.handle('log:open-dir', async () => {
    const dir = resolveLogDirectory()
    try {
      await mkdir(dir, { recursive: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message }
    }
    const error = await shell.openPath(dir)
    if (error) return { ok: false, message: error }
    return { ok: true }
  })
}
