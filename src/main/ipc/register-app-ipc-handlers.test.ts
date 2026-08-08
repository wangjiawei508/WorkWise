import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  mergeScheduleSettings,
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultManagedRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsPatch,
  type AppSettingsV1
} from '../../shared/app-settings'

const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()
const managedToolMocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ ok: true, tools: [] })),
  install: vi.fn(async () => ({ ok: false, message: 'fixture' })),
  update: vi.fn(async () => ({ ok: false, message: 'fixture' })),
  diagnose: vi.fn(async (id: string) => ({ ok: true, status: { id, state: 'not_installed' } })),
  remove: vi.fn(async () => ({ ok: false, message: 'fixture' }))
}))

vi.mock('../services/managed-tool-service', () => ({
  listManagedTools: managedToolMocks.list,
  installManagedTool: managedToolMocks.install,
  updateManagedTool: managedToolMocks.update,
  diagnoseManagedTool: managedToolMocks.diagnose,
  removeManagedTool: managedToolMocks.remove
}))

vi.mock('electron', () => ({
  app: {
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp')
  },
  dialog: {},
  shell: {
    openPath: vi.fn(async () => ''),
    showItemInFolder: vi.fn()
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    })
  }
}))

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: {
      kun: defaultManagedRuntimeSettings()
    },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  }
}

function registerOptions(overrides: Partial<Parameters<typeof import('./register-app-ipc-handlers').registerAppIpcHandlers>[0]> = {}) {
  const applySettingsPatch = vi.fn(async () => settings())
  return {
    store: { load: vi.fn(async () => settings()) } as never,
    getMainWindow: () => null,
    applySettingsPatch,
    runtimeRequest: vi.fn() as never,
    fetchUpstreamModels: vi.fn() as never,
    getClawRuntime: () => null,
    getScheduleRuntime: () => null,
    startFeishuInstallQrcode: vi.fn() as never,
    pollFeishuInstall: vi.fn() as never,
    startWeixinInstallQrcode: vi.fn() as never,
    pollWeixinInstall: vi.fn() as never,
    resolveRuntimeConfigPath: () => '/tmp/kun.json',
    showTurnCompleteNotification: vi.fn() as never,
    getAppVersion: () => '0.1.0',
    readGuiUpdateState: vi.fn() as never,
    loadGuiUpdaterModule: vi.fn() as never,
    resolveLogDirectory: () => '/tmp/logs',
    logError: vi.fn(),
    ...overrides
  }
}

describe('registerAppIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
  })

  it('requires explicit confirmation when update preflight finds active Agent work', async () => {
    const installGuiUpdate = vi.fn(async () => ({ ok: true as const }))
    const runtimeRequest = vi.fn(async (path: string) => {
      if (path.startsWith('/v1/tasks')) {
        return { ok: true, status: 200, body: JSON.stringify([{ id: 'task-1', goal: '编制投标文件', status: 'running' }]) }
      }
      if (path === '/v1/flows') return { ok: true, status: 200, body: JSON.stringify({ flows: [] }) }
      return { ok: false, status: 404, body: '{}' }
    })
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    registerAppIpcHandlers(registerOptions({
      runtimeRequest: runtimeRequest as never,
      loadGuiUpdaterModule: vi.fn(async () => ({ installGuiUpdate })) as never
    }))

    const preflight = await handlers.get('gui:update-install-preflight')?.({})
    expect(preflight).toMatchObject({
      ok: true,
      activeWork: [{ kind: 'agent', id: 'task-1', status: 'running', recoverable: true }]
    })
    await expect(handlers.get('gui:update-install')?.({}, {})).resolves.toMatchObject({ ok: false })
    expect(installGuiUpdate).not.toHaveBeenCalled()
    await expect(handlers.get('gui:update-install')?.({}, { confirmActiveWork: true })).resolves.toEqual({ ok: true })
    expect(installGuiUpdate).toHaveBeenCalledTimes(1)
  })

  it('preserves heading, page, table, worksheet, and slide provenance in attachment sections', async () => {
    const { buildAttachmentSections } = await import('./register-app-ipc-handlers')
    const sections = buildAttachmentSections(
      'att_fixture',
      '# 报价条款\n\n报价表\n\n<!-- Slide number: 3 -->\n\n| 条款 | 金额 |\n| --- | --- |\n| A | 100 |',
      {
        headings: [{ text: '报价条款', page: 7 }],
        tables: [{ markdown: '| 条款 | 金额 |\n| --- | --- |\n| A | 100 |', page: 8 }],
        sourceStructure: { worksheets: ['报价表'], slideCount: 3 }
      }
    )
    expect(sections[0]?.provenance).toEqual({
      heading: '报价条款', worksheet: '报价表', slide: 3, table: 'table-1', page: 8
    })
  })

  it('rejects invalid settings patches at the handler boundary', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const handler = handlers.get('settings:set')
    expect(handler).toBeTypeOf('function')
    await expect(
      handler?.({}, { agents: { kun: { mysteryFlag: true } } })
    ).rejects.toThrow(/Invalid payload for settings:set/)
    expect(applySettingsPatch).not.toHaveBeenCalled()
  })

  it('passes valid settings patches through to applySettingsPatch', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = {
      theme: 'dark' as const,
      agents: {
        kun: {
          port: 9000
        }
      }
    }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toEqual(settings())
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('registers every managed-tool IPC handler and validates tool ids', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')

    registerAppIpcHandlers(registerOptions())

    for (const channel of [
      'tool:list-managed',
      'tool:install-managed',
      'tool:update-managed',
      'tool:diagnose-managed',
      'tool:remove-managed'
    ]) {
      expect(handlers.get(channel), channel).toBeTypeOf('function')
    }

    await expect(
      handlers.get('tool:install-managed')?.({}, 'unknown-tool')
    ).rejects.toThrow(/Invalid payload for tool:install-managed/)

    await expect(handlers.get('tool:list-managed')?.({})).resolves.toEqual({ ok: true, tools: [] })
    await expect(handlers.get('tool:install-managed')?.({}, 'lark-cli')).resolves.toMatchObject({ ok: false })
    await expect(handlers.get('tool:update-managed')?.({}, 'officecli')).resolves.toMatchObject({ ok: false })
    await expect(handlers.get('tool:diagnose-managed')?.({}, 'ego-browser')).resolves.toMatchObject({
      ok: true,
      status: { id: 'ego-browser' }
    })
    await expect(handlers.get('tool:remove-managed')?.({}, 'officecli')).resolves.toMatchObject({ ok: false })
    expect(managedToolMocks.list).toHaveBeenCalledOnce()
    expect(managedToolMocks.install).toHaveBeenCalledWith('lark-cli')
    expect(managedToolMocks.update).toHaveBeenCalledWith('officecli')
    expect(managedToolMocks.diagnose).toHaveBeenCalledWith('ego-browser')
    expect(managedToolMocks.remove).toHaveBeenCalledWith('officecli')
  })

  it('routes unified catalog and plugin operations through validated IPC payloads', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const catalogService = {
      listSources: vi.fn(async () => []),
      listPackages: vi.fn(async () => ({ packages: [], conflicts: [] })),
      getSnapshot: vi.fn(async () => null),
      upsertSource: vi.fn(async (source) => source),
      removeSource: vi.fn(async () => undefined),
      syncSource: vi.fn(async (sourceId: string) => ({ sourceId, status: 'synced', stale: false }))
    }
    const pluginService = {
      listInstalled: vi.fn(async () => []),
      prepareImport: vi.fn(async (request) => ({ id: 'prepared-1', ...request })),
      cancelPrepared: vi.fn(async () => true),
      installPrepared: vi.fn(async (request) => ({ packageId: 'example', request })),
      rollback: vi.fn(async (request) => ({ packageId: request.packageId }))
    }
    const catalogCredentialService = {
      status: vi.fn(async (sourceId: string) => ({ sourceId, configured: true, storage: 'keychain' })),
      set: vi.fn(async () => 'keychain'),
      remove: vi.fn(async () => undefined),
      resolve: vi.fn(async () => undefined)
    }
    registerAppIpcHandlers(registerOptions({
      marketplaceCatalogService: catalogService as never,
      catalogCredentialService: catalogCredentialService as never,
      pluginManagementService: pluginService as never
    }))

    for (const channel of [
      'catalog:list-sources',
      'catalog:list-packages',
      'catalog:get-snapshot',
      'catalog:upsert-source',
      'catalog:list-credential-statuses',
      'catalog:set-credential',
      'catalog:clear-credential',
      'catalog:remove-source',
      'catalog:sync-source',
      'plugin:list-installed',
      'plugin:prepare-import',
      'plugin:cancel-import',
      'plugin:install',
      'plugin:rollback'
    ]) {
      expect(handlers.get(channel), channel).toBeTypeOf('function')
    }

    await expect(handlers.get('catalog:list-packages')?.({})).resolves.toEqual({
      packages: [],
      conflicts: []
    })
    await expect(handlers.get('plugin:prepare-import')?.({}, {
      sourcePath: '/tmp/example.wwx',
      format: 'wwx'
    })).resolves.toMatchObject({ id: 'prepared-1', format: 'wwx' })
    expect(pluginService.prepareImport).toHaveBeenCalledWith({
      sourcePath: '/tmp/example.wwx',
      format: 'wwx',
      catalogSourceId: undefined
    })

    await expect(handlers.get('plugin:install')?.({}, {
      preparedId: 'prepared-1',
      reviewSha256: 'invalid',
      expectedCurrentVersion: null,
      scope: 'user',
      permissions: [],
      idempotencyKey: 'install-1'
    })).rejects.toThrow(/Invalid payload for plugin:install/)
    expect(pluginService.installPrepared).not.toHaveBeenCalled()

    await expect(handlers.get('catalog:upsert-source')?.({}, {
      schemaVersion: 1,
      id: 'unsafe',
      name: 'Unsafe',
      type: 'https',
      scope: 'team',
      location: 'https://plugins.example.com/catalog.json',
      trust: 'unverified',
      searchable: true,
      auth: { type: 'token', secretKey: 'catalog.token', token: 'plaintext' },
      sync: { mode: 'manual', state: 'idle', mirroredByDefault: false, installedByDefault: false }
    })).rejects.toThrow(/Invalid payload for catalog:upsert-source/)
    expect(catalogService.upsertSource).not.toHaveBeenCalled()

    const privateSource = {
      schemaVersion: 1,
      id: 'private',
      name: 'Private',
      type: 'https',
      scope: 'team',
      location: 'https://plugins.example.com/catalog.json',
      trust: 'unverified',
      searchable: true,
      auth: { type: 'token', secretKey: 'catalog.private.token' },
      sync: { mode: 'manual', state: 'idle', mirroredByDefault: false, installedByDefault: false }
    }
    catalogService.listSources.mockResolvedValue([privateSource] as never)
    await expect(handlers.get('catalog:set-credential')?.({}, {
      sourceId: 'private',
      accessToken: 'renderer-secret'
    })).resolves.toEqual({ sourceId: 'private', configured: true, storage: 'keychain' })
    expect(catalogCredentialService.set).toHaveBeenCalledWith('catalog.private.token', 'renderer-secret')
    await expect(handlers.get('catalog:list-credential-statuses')?.({})).resolves.toEqual([{
      sourceId: 'private',
      configured: true,
      storage: 'keychain'
    }])
    await expect(handlers.get('catalog:clear-credential')?.({}, { sourceId: 'private' }))
      .resolves.toEqual({ sourceId: 'private', configured: false })
    expect(catalogCredentialService.remove).toHaveBeenCalledWith('catalog.private.token')
  })

  it('saves generated files to a user-selected path', async () => {
    const { dialog } = await import('electron')
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const temp = mkdtempSync(join(tmpdir(), 'kun-save-as-'))
    const source = join(temp, 'source.png')
    const target = join(temp, 'downloaded.png')
    writeFileSync(source, 'generated-image')
    ;(dialog as unknown as { showSaveDialog: ReturnType<typeof vi.fn> }).showSaveDialog = vi.fn(async () => ({
      canceled: false,
      filePath: target
    }))

    try {
      registerAppIpcHandlers(registerOptions())

      const handler = handlers.get('file:save-as')
      await expect(handler?.({}, {
        sourcePath: source,
        suggestedName: 'source.png',
        mimeType: 'image/png'
      })).resolves.toEqual({ ok: true, path: target })
      expect(readFileSync(target, 'utf8')).toBe('generated-image')
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it('opens and reveals verified workspace artifacts', async () => {
    const { shell } = await import('electron')
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const temp = mkdtempSync(join(tmpdir(), 'workwise-artifact-actions-'))
    const source = join(temp, 'deck.pptx')
    writeFileSync(source, 'fixture')

    try {
      registerAppIpcHandlers(registerOptions())

      await expect(handlers.get('file:open-workspace')?.({}, {
        path: 'deck.pptx',
        workspaceRoot: temp
      })).resolves.toEqual({ ok: true })
      await expect(handlers.get('file:reveal-workspace')?.({}, {
        path: 'deck.pptx',
        workspaceRoot: temp
      })).resolves.toEqual({ ok: true })
      const canonicalSource = realpathSync(source)
      expect(shell.openPath).toHaveBeenCalledWith(canonicalSource)
      expect(shell.showItemInFolder).toHaveBeenCalledWith(canonicalSource)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  })

  it('accepts the full settings snapshot emitted by SettingsView auto-apply', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = { ...settings(), locale: 'zh' as const }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toEqual(settings())
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('passes schedule settings patches through to applySettingsPatch', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async (partial: AppSettingsPatch) => ({
      ...settings(),
      schedule: mergeScheduleSettings(settings().schedule, partial.schedule)
    }))

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = {
      schedule: {
        enabled: true,
        keepAwake: true,
        tasks: [{
          id: 'task-1',
          title: 'Daily',
          enabled: true,
          prompt: 'Run',
          schedule: { kind: 'manual' as const }
        }]
      }
    }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toMatchObject({
      schedule: {
        enabled: true,
        keepAwake: true,
        tasks: [{ id: 'task-1', prompt: 'Run' }]
      }
    })
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('writes MCP config JSON and notifies the runtime apply hook', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const tempRoot = mkdtempSync(join(tmpdir(), 'workwise-ipc-'))
    const configPath = join(tempRoot, 'mcp.json')
    const onRuntimeMcpConfigWritten = vi.fn(async () => undefined)
    const content = `${JSON.stringify({
      servers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/project']
        }
      }
    }, null, 2)}\n`

    try {
      registerAppIpcHandlers(registerOptions({
        resolveRuntimeConfigPath: () => configPath,
        onRuntimeMcpConfigWritten
      }))

      await expect(handlers.get('runtime:config:write')?.({}, content)).resolves.toEqual({
        ok: true,
        path: configPath
      })
      expect(readFileSync(configPath, 'utf8')).toBe(content)
      expect(onRuntimeMcpConfigWritten).toHaveBeenCalledWith(configPath, content)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects invalid MCP config JSON before writing or applying it', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const tempRoot = mkdtempSync(join(tmpdir(), 'workwise-ipc-'))
    const configPath = join(tempRoot, 'mcp.json')
    const onRuntimeMcpConfigWritten = vi.fn(async () => undefined)

    try {
      registerAppIpcHandlers(registerOptions({
        resolveRuntimeConfigPath: () => configPath,
        onRuntimeMcpConfigWritten
      }))

      await expect(handlers.get('runtime:config:write')?.({}, '{')).rejects.toThrow(
        /MCP config must be JSON/
      )
      await expect(handlers.get('runtime:config:write')?.({}, '[]')).rejects.toThrow(
        /MCP config must be a JSON object/
      )
      expect(existsSync(configPath)).toBe(false)
      expect(onRuntimeMcpConfigWritten).not.toHaveBeenCalled()
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('uses the GUI-managed WeChat bridge for WeChat install handlers', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const configuredSettings = settings()
    configuredSettings.claw.im.weixinBridgeUrl = 'http://127.0.0.1:8787/rpc'
    const store = { load: vi.fn(async () => configuredSettings) }
    const startWeixinInstallQrcode = vi.fn(async () => ({
      ok: false as const,
      message: 'expected test response'
    }))
    const pollWeixinInstall = vi.fn(async () => ({ done: false as const }))

    registerAppIpcHandlers(registerOptions({
      store: store as never,
      startWeixinInstallQrcode,
      pollWeixinInstall
    }))

    await expect(
      handlers.get('claw:im-install:qrcode')?.({}, { provider: 'weixin' })
    ).resolves.toMatchObject({ ok: false })
    await expect(
      handlers.get('claw:im-install:poll')?.({}, { provider: 'weixin', deviceCode: 'device-1' })
    ).resolves.toEqual({ done: false })

    expect(startWeixinInstallQrcode).toHaveBeenCalledWith()
    expect(pollWeixinInstall).toHaveBeenCalledWith('device-1')
  })

  it('routes schedule task IPC calls to the Schedule runtime', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const scheduleRuntime = {
      status: vi.fn(async () => ({
        internalServerRunning: true,
        internalUrl: 'http://127.0.0.1:8788',
        runningTaskIds: ['task-1'],
        powerSaveBlockerActive: true
      })),
      runTask: vi.fn(async (taskId: string) => ({ ok: true as const, taskId, message: 'Started' })),
      createScheduledTaskFromText: vi.fn(async () => ({
        kind: 'created' as const,
        taskId: 'task-2',
        title: 'Reminder',
        scheduleAt: '2026-06-03T09:00:00.000+08:00',
        confirmationText: 'Scheduled.'
      }))
    }
    registerAppIpcHandlers(registerOptions({
      getScheduleRuntime: () => scheduleRuntime as never
    }))

    await expect(handlers.get('schedule:status')?.({})).resolves.toMatchObject({
      internalServerRunning: true,
      runningTaskIds: ['task-1'],
      powerSaveBlockerActive: true
    })
    await expect(handlers.get('schedule:task:run')?.({}, 'task-1')).resolves.toMatchObject({
      ok: true,
      taskId: 'task-1'
    })
    await expect(
      handlers.get('schedule:task:create-from-text')?.({}, {
        text: 'Remind me tomorrow.',
        workspaceRoot: '/tmp/schedule',
        modelHint: 'deepseek-v4-flash',
        mode: 'plan'
      })
    ).resolves.toMatchObject({
      kind: 'created',
      taskId: 'task-2'
    })

    expect(scheduleRuntime.runTask).toHaveBeenCalledWith('task-1')
    expect(scheduleRuntime.createScheduledTaskFromText).toHaveBeenCalledWith('Remind me tomorrow.', {
      workspaceRoot: '/tmp/schedule',
      modelHint: 'deepseek-v4-flash',
      mode: 'plan'
    })
  })

  it('routes desktop command IPC calls to the focused window and web contents', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const webContents = {
      undo: vi.fn(),
      redo: vi.fn(),
      cut: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
      selectAll: vi.fn(),
      reload: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
      setZoomLevel: vi.fn(),
      toggleDevTools: vi.fn()
    }
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents,
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    }

    registerAppIpcHandlers(registerOptions({
      getMainWindow: () => mainWindow as never
    }))

    const handler = handlers.get('desktop:command')
    await handler?.({ sender: webContents }, 'copy')
    await handler?.({ sender: webContents }, 'zoomIn')
    await handler?.({ sender: webContents }, 'toggleMaximize')
    await handler?.({ sender: webContents }, 'close')

    expect(webContents.copy).toHaveBeenCalledTimes(1)
    expect(webContents.setZoomLevel).toHaveBeenCalledWith(1)
    expect(mainWindow.maximize).toHaveBeenCalledTimes(1)
    expect(mainWindow.close).toHaveBeenCalledTimes(1)
  })
})
