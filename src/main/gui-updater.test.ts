import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockUpdater = EventEmitter & {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  forceDevUpdateConfig: boolean
  logger: unknown
  setFeedURL: ReturnType<typeof vi.fn>
  checkForUpdates: ReturnType<typeof vi.fn>
  downloadUpdate: ReturnType<typeof vi.fn>
  quitAndInstall: ReturnType<typeof vi.fn>
}

let updater: MockUpdater
let nativeUpdater: EventEmitter

function createUpdater(): MockUpdater {
  return Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    forceDevUpdateConfig: false,
    logger: null,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  updater = createUpdater()
  nativeUpdater = new EventEmitter()
  vi.doMock('electron', () => ({
    app: {
      isPackaged: true,
      getAppPath: () => '/tmp/workwise-updater-test-app',
      getPath: () => '/tmp/workwise-updater-test-user-data',
      getVersion: () => '0.1.0'
    },
    autoUpdater: nativeUpdater,
    BrowserWindow: class {}
  }))
  vi.doMock('electron-updater', () => ({
    default: { autoUpdater: updater },
    autoUpdater: updater
  }))
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.doUnmock('electron')
  vi.doUnmock('electron-updater')
  vi.resetModules()
})

describe('installGuiUpdate', () => {
  it('waits for managed runtime cleanup before asking the updater to quit and install', async () => {
    const module = await import('./gui-updater')
    let finishCleanup = (): void => {
      throw new Error('cleanup resolver was not set')
    }
    const beforeInstall = vi.fn(() => new Promise<void>((resolve) => {
      finishCleanup = resolve
    }))

    module.initializeGuiUpdater(() => null, () => 'stable', beforeInstall)
    updater.emit('update-downloaded', { version: '0.2.0', releaseDate: '2026-06-06T00:00:00.000Z' })

    const installing = module.installGuiUpdate()
    await Promise.resolve()

    expect(beforeInstall).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    finishCleanup()
    await expect(installing).resolves.toEqual({ ok: true })
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('reuses the same cleanup when the native updater emits before-quit-for-update', async () => {
    const module = await import('./gui-updater')
    let finishCleanup = (): void => {
      throw new Error('cleanup resolver was not set')
    }
    const beforeInstall = vi.fn(() => new Promise<void>((resolve) => {
      finishCleanup = resolve
    }))

    module.initializeGuiUpdater(() => null, () => 'stable', beforeInstall)
    updater.emit('update-downloaded', { version: '0.2.0', releaseDate: '2026-06-06T00:00:00.000Z' })

    nativeUpdater.emit('before-quit-for-update')
    const installing = module.installGuiUpdate()
    await Promise.resolve()

    expect(beforeInstall).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()

    finishCleanup()
    await expect(installing).resolves.toEqual({ ok: true })
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
})

describe('gui updater source helpers', () => {
  it('normalizes common GitHub repository URL forms', async () => {
    const module = await import('./gui-updater')

    expect(module._internals.normalizeGithubOwnerRepo('wangjiawei508/WorkWise')).toBe(
      'wangjiawei508/WorkWise'
    )
    expect(module._internals.normalizeGithubOwnerRepo('https://github.com/wangjiawei508/WorkWise.git')).toBe(
      'wangjiawei508/WorkWise'
    )
    expect(module._internals.normalizeGithubOwnerRepo('git@github.com:wangjiawei508/WorkWise.git')).toBe(
      'wangjiawei508/WorkWise'
    )
  })

  it('selects the newest usable release for stable and frontier channels', async () => {
    const module = await import('./gui-updater')
    const releases = [
      {
        tag_name: 'v0.3.0-beta.1',
        html_url: 'https://github.com/wangjiawei508/WorkWise/releases/tag/v0.3.0-beta.1',
        prerelease: true
      },
      {
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/wangjiawei508/WorkWise/releases/tag/v0.2.0'
      },
      {
        tag_name: 'draft',
        html_url: 'https://github.com/wangjiawei508/WorkWise/releases/tag/draft',
        draft: true
      }
    ]

    expect(module._internals.selectGithubRelease(releases, 'stable')?.version).toBe('0.2.0')
    expect(module._internals.selectGithubRelease(releases, 'frontier')?.version).toBe('0.3.0-beta.1')
  })

  it('does not assume an official feed and keeps configured feed overrides', async () => {
    const previous = {
      WORKWISE_UPDATE_PROVIDER: process.env.WORKWISE_UPDATE_PROVIDER,
      WORKWISE_ENABLE_GITHUB_UPDATE_FALLBACK: process.env.WORKWISE_ENABLE_GITHUB_UPDATE_FALLBACK,
      WORKWISE_UPDATE_URL: process.env.WORKWISE_UPDATE_URL,
      WORKWISE_UPDATE_URL_STABLE: process.env.WORKWISE_UPDATE_URL_STABLE,
      WORKWISE_UPDATE_BASE_URL: process.env.WORKWISE_UPDATE_BASE_URL,
      WORKWISE_PUBLIC_BASE_URL: process.env.WORKWISE_PUBLIC_BASE_URL,
      WORKWISE_RELEASE_PREFIX: process.env.WORKWISE_RELEASE_PREFIX,
      WORKWISE_DOWNLOAD_URL: process.env.WORKWISE_DOWNLOAD_URL,
      WORKWISE_DOWNLOAD_BASE_URL: process.env.WORKWISE_DOWNLOAD_BASE_URL,
      R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
      R2_RELEASE_PREFIX: process.env.R2_RELEASE_PREFIX,
      PUBLIC_DOWNLOAD_BASE_URL: process.env.PUBLIC_DOWNLOAD_BASE_URL,
      PUBLIC_DOWNLOAD_PAGE_URL: process.env.PUBLIC_DOWNLOAD_PAGE_URL
    }
    delete process.env.WORKWISE_UPDATE_PROVIDER
    delete process.env.WORKWISE_ENABLE_GITHUB_UPDATE_FALLBACK
    delete process.env.WORKWISE_UPDATE_URL
    delete process.env.WORKWISE_UPDATE_URL_STABLE
    delete process.env.WORKWISE_UPDATE_BASE_URL
    delete process.env.WORKWISE_PUBLIC_BASE_URL
    delete process.env.WORKWISE_RELEASE_PREFIX
    delete process.env.WORKWISE_DOWNLOAD_URL
    delete process.env.WORKWISE_DOWNLOAD_BASE_URL
    delete process.env.R2_PUBLIC_BASE_URL
    delete process.env.R2_RELEASE_PREFIX
    delete process.env.PUBLIC_DOWNLOAD_BASE_URL
    delete process.env.PUBLIC_DOWNLOAD_PAGE_URL

    try {
      const module = await import('./gui-updater')
      expect(module._internals.resolveUpdateFeedConfig('stable')).toEqual({
        kind: 'none'
      })
      expect(module._internals.downloadPageUrl()).toBe('https://www.railwise.cn/products/workwise/')

      process.env.WORKWISE_PUBLIC_BASE_URL = 'https://downloads.example.test/workwise'
      process.env.WORKWISE_RELEASE_PREFIX = 'desktop'
      expect(module._internals.resolveUpdateFeedConfig('stable')).toEqual({
        kind: 'generic',
        url: 'https://downloads.example.test/workwise/desktop/channels/stable/latest/'
      })
      expect(module._internals.downloadPageUrl()).toBe('https://www.railwise.cn/products/workwise/')

      process.env.WORKWISE_UPDATE_URL_STABLE = 'https://mirror.example.test/{channel}/latest'
      expect(module._internals.resolveUpdateFeedConfig('stable')).toEqual({
        kind: 'generic',
        url: 'https://mirror.example.test/stable/latest/'
      })
      process.env.WORKWISE_DOWNLOAD_URL = 'https://www.example.test/products/workwise/'
      expect(module._internals.downloadPageUrl()).toBe('https://www.example.test/products/workwise/')
      delete process.env.WORKWISE_DOWNLOAD_URL

      delete process.env.WORKWISE_UPDATE_URL_STABLE
      process.env.WORKWISE_UPDATE_PROVIDER = 'github'
      expect(module._internals.resolveUpdateFeedConfig('stable')).toMatchObject({
        kind: 'github',
        owner: 'wangjiawei508',
        repo: 'WorkWise'
      })
      expect(module._internals.downloadPageUrl()).toBe('https://github.com/wangjiawei508/WorkWise/releases')
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })
})
