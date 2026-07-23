import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { WorkWiseApi } from '../shared/workwise-api'
import {
  RUNTIME_TASKS_PATH,
  RUNTIME_SHELL_SESSIONS_PATH,
  runtimeShellSessionTerminatePath,
  runtimeTaskCancelPath,
  runtimeTaskPath,
  runtimeTaskResumePath,
  runtimeTaskRetryPath,
  runtimeTaskDiagnosticsPath,
  runtimeThreadAgentPath,
  runtimeThreadPath
} from '../shared/runtime-endpoints'

async function runtimeJson<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke('runtime:request', {
    path,
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }) as { ok: boolean; status: number; body: string }
  let parsed: unknown
  try {
    parsed = JSON.parse(result.body)
  } catch {
    parsed = null
  }
  if (!result.ok) {
    const message = parsed && typeof parsed === 'object' && 'message' in parsed
      ? String(parsed.message)
      : `Runtime request failed (${result.status}).`
    throw new Error(message)
  }
  return parsed as T
}

const api = {
  platform: process.platform,
  onApplicationMenuAction: (handler) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      action: Parameters<typeof handler>[0]
    ): void => handler(action)
    ipcRenderer.on('app:menu-action', wrapped)
    return () => ipcRenderer.removeListener('app:menu-action', wrapped)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial, expectedRevision) =>
    ipcRenderer.invoke('settings:set', { patch: partial, expectedRevision }),
  runtimeRequest: (path, method, body) =>
    ipcRenderer.invoke('runtime:request', { path, method, body }),
  cancelOperation: (request) => ipcRenderer.invoke('operation:cancel', request),
  getTaskRun: (taskId) => runtimeJson(runtimeTaskPath(taskId)),
  listTaskRuns: (query) => {
    const params = new URLSearchParams()
    if (query?.threadId) params.set('threadId', query.threadId)
    if (query?.status) params.set('status', query.status)
    if (query?.limit) params.set('limit', String(query.limit))
    return runtimeJson(`${RUNTIME_TASKS_PATH}${params.size ? `?${params}` : ''}`)
  },
  resumeTask: (taskId, request) => runtimeJson(runtimeTaskResumePath(taskId), 'POST', request),
  retryTask: (taskId, request) => runtimeJson(runtimeTaskRetryPath(taskId), 'POST', request),
  cancelTask: (taskId, request) => runtimeJson(runtimeTaskCancelPath(taskId), 'POST', request),
  getTaskDiagnostics: (taskId) => runtimeJson(runtimeTaskDiagnosticsPath(taskId)),
  exportTaskDiagnostics: (taskId) => ipcRenderer.invoke('diagnostics:export-task', { taskId }),
  listShellSessions: (taskId) => {
    const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : ''
    return runtimeJson(`${RUNTIME_SHELL_SESSIONS_PATH}${query}`)
  },
  terminateShellSession: (sessionId, request) =>
    runtimeJson(runtimeShellSessionTerminatePath(sessionId), 'POST', request),
  fetchUpstreamModels: () => ipcRenderer.invoke('upstream:models'),
  getClawStatus: () => ipcRenderer.invoke('claw:status'),
  runClawTask: (taskId) =>
    ipcRenderer.invoke('claw:task:run', taskId),
  getScheduleStatus: () => ipcRenderer.invoke('schedule:status'),
  runScheduleTask: (taskId) =>
    ipcRenderer.invoke('schedule:task:run', taskId),
  startClawImInstallQr: (provider, options) =>
    ipcRenderer.invoke('claw:im-install:qrcode', { provider, isLark: options?.isLark }),
  pollClawImInstall: (provider, deviceCode) =>
    ipcRenderer.invoke('claw:im-install:poll', { provider, deviceCode }),
  pickWorkspaceDirectory: (defaultPath) =>
    ipcRenderer.invoke('workspace:pick-directory', defaultPath),
  confirmDialog: (options) =>
    ipcRenderer.invoke('dialog:confirm', options),
  listSkills: (workspaceRoot) =>
    ipcRenderer.invoke('skill:list', { workspaceRoot }),
  refreshSkills: (workspaceRoot) =>
    ipcRenderer.invoke('skill:refresh', { workspaceRoot }),
  onSkillsChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, generation: number): void => listener(generation)
    ipcRenderer.on('skills:changed', wrapped)
    return () => ipcRenderer.removeListener('skills:changed', wrapped)
  },
  saveSkillFile: (rootPath, skillName, content) =>
    ipcRenderer.invoke('skill:save-file', { rootPath, skillName, content }),
  installGithubSkill: (rootPath, source) =>
    ipcRenderer.invoke('skill:install-github', { rootPath, source }),
  installBundledSkill: (rootPath, source) =>
    ipcRenderer.invoke('skill:install-bundled', { rootPath, source }),
  installBundledAgentPack: (source) =>
    ipcRenderer.invoke('agent-pack:install-bundled', { source }),
  syncGithubSkills: (workspaceRoot) =>
    ipcRenderer.invoke('skill:sync-github', { workspaceRoot }),
  listManagedTools: () => ipcRenderer.invoke('tool:list-managed'),
  installManagedTool: (id) => ipcRenderer.invoke('tool:install-managed', id),
  updateManagedTool: (id) => ipcRenderer.invoke('tool:update-managed', id),
  diagnoseManagedTool: (id) => ipcRenderer.invoke('tool:diagnose-managed', id),
  removeManagedTool: (id) => ipcRenderer.invoke('tool:remove-managed', id),
  listAgentProfiles: (workspaceRoot) => ipcRenderer.invoke('agent-profile:list', { workspaceRoot }),
  saveAgentProfile: (request) => ipcRenderer.invoke('agent-profile:save', request),
  setThreadAgent: async (threadId, request) => {
    const thread = await runtimeJson<{ workspace: string }>(runtimeThreadPath(threadId))
    const snapshot = await ipcRenderer.invoke('agent-profile:list', {
      workspaceRoot: thread.workspace
    }) as Awaited<ReturnType<WorkWiseApi['listAgentProfiles']>>
    const selected = snapshot.profiles.find((profile) => profile.id === request.agentId)
    if (!selected) throw new Error(`Agent profile not found: ${request.agentId}`)
    const { builtIn: _builtIn, source: _source, path: _path, ...profile } = selected
    return runtimeJson<Awaited<ReturnType<WorkWiseApi['setThreadAgent']>>>(runtimeThreadAgentPath(threadId), 'POST', {
      agentId: request.agentId,
      profile,
      expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey
    })
  },
  getWorkspaceTrust: (workspaceRoot) => ipcRenderer.invoke('workspace-trust:get', { workspaceRoot }),
  setWorkspaceTrust: (request) => ipcRenderer.invoke('workspace-trust:set', request),
  listMcpServers: (workspaceRoot) => ipcRenderer.invoke('mcp-server:list', { workspaceRoot }),
  saveMcpServer: (request) => ipcRenderer.invoke('mcp-server:save', request),
  testMcpServer: (serverId, workspaceRoot) => ipcRenderer.invoke('mcp-server:test', { serverId, workspaceRoot }),
  authorizeMcpServer: (request) => ipcRenderer.invoke('mcp-server:authorize', request),
  listDocumentEngines: () => ipcRenderer.invoke('document-engine:list'),
  installDocumentEngine: (id) => ipcRenderer.invoke('document-engine:install', id),
  diagnoseDocumentEngine: (id) => ipcRenderer.invoke('document-engine:diagnose', id),
  parseDocument: (request) => ipcRenderer.invoke('document-engine:parse', request),
  cancelDocumentParse: (parseId) => ipcRenderer.invoke('document-engine:cancel', parseId),
  previewWorkspaceFile: (request) => ipcRenderer.invoke('file:preview-workspace', request),
  openSkillRoot: (rootPath) =>
    ipcRenderer.invoke('skill:open-root', rootPath),
  getRuntimeConfigFile: () =>
    ipcRenderer.invoke('runtime:config:read'),
  setRuntimeConfigFile: (content) =>
    ipcRenderer.invoke('runtime:config:write', content),
  openRuntimeConfigDir: () =>
    ipcRenderer.invoke('runtime:config:open-dir'),
  getGitBranches: (workspaceRoot) =>
    ipcRenderer.invoke('git:branches', workspaceRoot),
  switchGitBranch: (workspaceRoot, branch) =>
    ipcRenderer.invoke('git:switch-branch', { workspaceRoot, branch }),
  createAndSwitchGitBranch: (workspaceRoot, branch) =>
    ipcRenderer.invoke('git:create-and-switch-branch', { workspaceRoot, branch }),
  createGitCheckpoint: (request) => ipcRenderer.invoke('git:checkpoint:create', request),
  previewGitRollback: (request) => ipcRenderer.invoke('git:rollback:preview', request),
  applyGitRollback: (request) => ipcRenderer.invoke('git:rollback:apply', request),
  buildRepoMap: (request) => ipcRenderer.invoke('repo-map:build', request),
  queryRepoMap: (request) => ipcRenderer.invoke('repo-map:query', request),
  lspRequest: (request) => ipcRenderer.invoke('lsp:request', request),
  listEditors: () => ipcRenderer.invoke('editor:list'),
  openEditorPath: (options) =>
    ipcRenderer.invoke('editor:open-path', options),
  listWorkspaceDirectory: (options) =>
    ipcRenderer.invoke('file:list-workspace-directory', options),
  resolveWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:resolve-workspace', options),
  readWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:read-workspace', options),
  readWorkspaceImage: (options) =>
    ipcRenderer.invoke('file:read-workspace-image', options),
  openWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:open-workspace', options),
  revealWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:reveal-workspace', options),
  saveWorkspaceFileAs: (payload) =>
    ipcRenderer.invoke('file:save-as', payload),
  writeWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:write-workspace', payload),
  createWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:create-workspace', payload),
  createWorkspaceDirectory: (payload) =>
    ipcRenderer.invoke('file:create-workspace-directory', payload),
  saveWorkspaceClipboardImage: (payload) =>
    ipcRenderer.invoke('file:save-workspace-clipboard-image', payload),
  readClipboardImage: () =>
    ipcRenderer.invoke('clipboard:read-image'),
  renameWorkspaceEntry: (payload) =>
    ipcRenderer.invoke('file:rename-workspace-entry', payload),
  deleteWorkspaceEntry: (payload) =>
    ipcRenderer.invoke('file:delete-workspace-entry', payload),
  watchWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:watch-workspace', payload),
  unwatchWorkspaceFile: (watchId) =>
    ipcRenderer.invoke('file:unwatch-workspace', watchId),
  onWorkspaceFileChanged: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('file:workspace-changed', wrapped)
    return () => ipcRenderer.removeListener('file:workspace-changed', wrapped)
  },
  exportWriteDocument: (payload) =>
    ipcRenderer.invoke('write:export', payload),
  copyWriteDocumentAsRichText: (payload) =>
    ipcRenderer.invoke('write:copy-rich-text', payload),
  exportDesignToPptx: (payload) =>
    ipcRenderer.invoke('design:export-pptx', payload),
  listDesignDocuments: (payload) =>
    ipcRenderer.invoke('design:document:list', payload),
  loadDesignDocument: (payload) =>
    ipcRenderer.invoke('design:document:load', payload),
  saveDesignDocument: (payload) =>
    ipcRenderer.invoke('design:document:save', payload),
  importDesignImageAsset: (payload) =>
    ipcRenderer.invoke('design:asset:import-image', payload),
  readDesignAsset: (payload) =>
    ipcRenderer.invoke('design:asset:read', payload),
  importPptxToDesign: (payload) =>
    ipcRenderer.invoke('design:import-pptx', payload),
  saveDesignAssetToWrite: (payload) =>
    ipcRenderer.invoke('design:save-to-write', payload),
  renderPresetShape: (payload) =>
    ipcRenderer.invoke('design:render-preset', payload),
  listPresetShapes: () =>
    ipcRenderer.invoke('design:list-presets'),
  generateAgnesImage: (payload) =>
    ipcRenderer.invoke('write:agnes-image-generate', payload),
  requestWriteInlineCompletion: (payload) =>
    ipcRenderer.invoke('write:inline-completion', payload),
  generateWriteInfographic: (payload) =>
    ipcRenderer.invoke('write:generate-infographic', payload),
  listWriteInlineCompletionDebugEntries: () =>
    ipcRenderer.invoke('write:inline-completion-debug:list'),
  clearWriteInlineCompletionDebugEntries: () =>
    ipcRenderer.invoke('write:inline-completion-debug:clear'),
  getWriteKnowledgeBaseStatus: () => ipcRenderer.invoke('write:knowledge-base:status'),
  refreshWriteKnowledgeBase: () => ipcRenderer.invoke('write:knowledge-base:refresh'),
  searchWriteKnowledge: (query) => ipcRenderer.invoke('write:knowledge-base:search', { query }),
  startSse: (threadId, sinceSeq, streamId) =>
    ipcRenderer.invoke('runtime:sse:start', { threadId, sinceSeq, streamId }),
  stopSse: (streamId) => ipcRenderer.invoke('runtime:sse:stop', streamId),
  onSseEvent: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-event', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-event', wrapped)
  },
  onSseEnd: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-end', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-end', wrapped)
  },
  onSseError: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-error', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-error', wrapped)
  },
  onClawChannelActivity: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('claw:channel-activity', wrapped)
    return () => ipcRenderer.removeListener('claw:channel-activity', wrapped)
  },
  mirrorClawChannelMessage: (threadId, text, direction) =>
    ipcRenderer.invoke('claw:channel:mirror', { threadId, text, direction }),
  mirrorClawChannelMessageToFeishu: (threadId, text, direction) =>
    ipcRenderer.invoke('claw:channel:mirror-to-feishu', { threadId, text, direction }),
  createClawTaskFromText: (text, options) =>
    ipcRenderer.invoke('claw:task:create-from-text', {
      text,
      channelId: options?.channelId,
      modelHint: options?.modelHint,
      mode: options?.mode
    }),
  createScheduleTaskFromText: (text, options) =>
    ipcRenderer.invoke('schedule:task:create-from-text', {
      text,
      workspaceRoot: options?.workspaceRoot,
      modelHint: options?.modelHint,
      mode: options?.mode
    }),
  runDesktopCommand: (command) =>
    ipcRenderer.invoke('desktop:command', command),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  showTurnCompleteNotification: (payload) => ipcRenderer.invoke('notification:turn-complete', payload),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getGuiUpdateState: () => ipcRenderer.invoke('gui:update-state'),
  checkGuiUpdate: (channel) =>
    ipcRenderer.invoke('gui:update-check', channel),
  downloadGuiUpdate: (channel) =>
    ipcRenderer.invoke('gui:update-download', channel),
  installGuiUpdate: () => ipcRenderer.invoke('gui:update-install'),
  onGuiUpdateState: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('gui:update-state', wrapped)
    return () => ipcRenderer.removeListener('gui:update-state', wrapped)
  },
  logError: (category, message, detail) =>
    ipcRenderer.invoke('log:error', { category, message, detail }),
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  openLogDir: () => ipcRenderer.invoke('log:open-dir'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
} satisfies WorkWiseApi

contextBridge.exposeInMainWorld('workwise', api)
// Deprecated compatibility boundary for 0.2.x renderers. Remove after 0.3.x.
contextBridge.exposeInMainWorld('kunGui', api)
