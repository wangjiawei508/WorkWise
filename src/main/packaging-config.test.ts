import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const builderConfig = require('../../electron-builder.cjs')
const afterPack = require('../../scripts/after-pack.cjs')
const packagedAsar = require('../../scripts/verify-packaged-asar.cjs')
const asar = require('@electron/asar')
const macNotarize = require('../../scripts/mac-notarize.cjs')

const tempRoots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ds-gui-packaging-'))
  tempRoots.push(root)
  return root
}

function touch(path: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '{}\n', 'utf8')
}

function loadBuilderConfigWithEnv(env: Record<string, string | undefined>): typeof builderConfig {
  const configPath = require.resolve('../../electron-builder.cjs')
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  delete require.cache[configPath]
  try {
    return require(configPath)
  } finally {
    delete require.cache[configPath]
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    require(configPath)
  }
}

function createMacPackContext(root: string): {
  appOutDir: string
  electronPlatformName: string
  arch: string
  packager: { appInfo: { productFilename: string } }
} {
  return {
    appOutDir: join(root, 'mac-arm64'),
    electronPlatformName: 'darwin',
    arch: 'arm64',
    packager: {
      appInfo: {
        productFilename: 'WorkWise Runtime'
      }
    }
  }
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('electron-builder WorkWise packaging', () => {
  it('includes WorkWise Runtime runtime dependencies in the packaged app', () => {
    expect(builderConfig.asarUnpack).toEqual(expect.arrayContaining([
      'src/asset/skills/**/*'
    ]))
    expect(builderConfig.files).not.toEqual(expect.arrayContaining([
      'kun/dist/**/*',
      'kun/node_modules/**/*',
      'kun/node_modules/typescript/**/*',
      'kun/node_modules/vitest/**/*',
      'kun/node_modules/better-sqlite3/**/*'
    ]))
    expect(builderConfig.asarUnpack).not.toEqual(expect.arrayContaining([
      '**/kun/node_modules/**/*'
    ]))
    expect(builderConfig.asarUnpack).not.toEqual(expect.arrayContaining([
      '**/node_modules/node-bin-darwin-*/*',
      '**/node_modules/node-bin-linux-*/*',
      '**/node_modules/node-bin-win-*/*',
      '**/node_modules/openclaw/**/*',
      '**/node_modules/@tencent-weixin/openclaw-weixin/**/*'
    ]))
    // The openclaw shim (vendor/openclaw-shim) must ship: the WeChat bridge
    // imports the bundled plugin's dist at runtime to send media, and that
    // import chain resolves openclaw/plugin-sdk/*.
    expect(builderConfig.files).not.toEqual(expect.arrayContaining([
      '!**/node_modules/openclaw/**/*'
    ]))
    expect(builderConfig.extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'kun',
        to: 'app.asar.unpacked/kun',
        filter: expect.arrayContaining([
          'dist/**/*',
          'package.json',
          'package-lock.json'
        ])
      }),
      expect.objectContaining({
        from: 'kun/node_modules',
        to: 'app.asar.unpacked/kun/runtime-deps',
        filter: expect.arrayContaining([
          'zod/**/*',
          '@modelcontextprotocol/sdk/**/*'
        ])
      }),
      {
        from: 'src/asset/agent-packs',
        to: 'src/asset/agent-packs',
        filter: ['**/*']
      }
    ]))
  })

  it('uses the Windows ICO asset for NSIS installers', () => {
    expect(builderConfig.win.icon).toBe('./src/asset/img/workwise.ico')
    expect(builderConfig.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
  })

  it('uses GitHub Releases by default and keeps generic mirrors opt-in', () => {
    const githubConfig = loadBuilderConfigWithEnv({
      WORKWISE_UPDATE_PROVIDER: undefined,
      WORKWISE_UPDATE_URL: undefined,
      WORKWISE_PUBLIC_BASE_URL: undefined,
      WORKWISE_GITHUB_REPO: undefined
    })
    expect(githubConfig.publish).toEqual([
      {
        provider: 'github',
        owner: 'wangjiawei508',
        repo: 'WorkWise'
      }
    ])

    const genericConfig = loadBuilderConfigWithEnv({
      WORKWISE_UPDATE_PROVIDER: 'generic',
      WORKWISE_UPDATE_URL: 'https://downloads.example.test/{channel}/latest',
      WORKWISE_PUBLIC_BASE_URL: undefined
    })
    expect(genericConfig.publish).toEqual([
      {
        provider: 'generic',
        url: 'https://downloads.example.test/stable/latest/'
      }
    ])
  })

  it('validates the unpacked managed runtime before release artifacts are created', () => {
    const root = tempRoot()
    const context = createMacPackContext(root)
    const unpackedRoot = afterPack._internals.unpackedAppRoot(context)

    for (const relativePath of afterPack.MANAGED_RUNTIME_REQUIRED_PATHS) {
      touch(join(unpackedRoot, relativePath))
    }
    touch(join(unpackedRoot, 'node_modules/better-sqlite3/package.json'))

    expect(() => afterPack._internals.validateBundledKunRuntime(context)).not.toThrow()

    rmSync(join(unpackedRoot, 'kun/node_modules/zod'), { recursive: true, force: true })

    expect(() => afterPack._internals.validateBundledKunRuntime(context)).toThrow(
      /kun\/node_modules\/zod\/package\.json/
    )
  })

  it('detects missing unpacked ASAR entries after packaging hooks', async () => {
    const root = tempRoot()
    const source = join(root, 'source')
    const archive = join(root, 'app.asar')
    touch(join(source, 'out/main/index.js'))
    touch(join(source, 'native/addon.node'))
    await asar.createPackageWithOptions(source, archive, { unpack: '**/*.node' })

    expect(packagedAsar.verifyAsarArchive(archive, join(source, 'out'))).toMatchObject({
      compiledFiles: 1
    })

    rmSync(`${archive}.unpacked`, { recursive: true, force: true })
    expect(() => packagedAsar.verifyAsarArchive(archive, join(source, 'out'))).toThrow(
      /ASAR entry is unreadable/
    )
  })

  it('normalizes Windows separators returned by the ASAR listing API', () => {
    expect(packagedAsar._internals.normalizeArchiveEntry('\\node_modules\\better-sqlite3\\package.json'))
      .toBe('node_modules/better-sqlite3/package.json')
    expect(packagedAsar._internals.normalizeArchiveEntry('/out/main/index.js'))
      .toBe('out/main/index.js')
  })

  it('selects only the matching platform Markdown converter directory', () => {
    expect(afterPack._internals.converterDirNameForContext({
      electronPlatformName: 'darwin',
      arch: 'arm64'
    })).toBe('darwin-arm64')
    expect(afterPack._internals.converterDirNameForContext({
      electronPlatformName: 'darwin',
      arch: 0
    })).toBe('darwin-x64')
    expect(afterPack._internals.converterDirNameForContext({
      electronPlatformName: 'win',
      arch: 'x64'
    })).toBe('win32-x64')
    expect(afterPack._internals.converterDirNameForContext({
      electronPlatformName: 'linux',
      arch: 'x64'
    })).toBeNull()
  })

  it('requires Apple secure timestamps when Developer ID signing is enabled', () => {
    const signedConfig = loadBuilderConfigWithEnv({
      MAC_SIGN: '1'
    })

    expect(signedConfig.mac.identity).toBeUndefined()
    expect(signedConfig.mac.hardenedRuntime).toBe(true)
    expect(signedConfig.mac.forceCodeSigning).toBe(true)
    expect(signedConfig.mac.timestamp).toBe('http://timestamp.apple.com/ts01')
  })

  it('checks timestamp candidates across nested macOS signed code', () => {
    const root = tempRoot()
    const appBundle = join(root, 'WorkWise.app')
    const mainExecutable = join(appBundle, 'Contents/MacOS/WorkWise')
    const framework = join(appBundle, 'Contents/Frameworks/Electron Framework.framework')
    const nativeAddon = join(
      appBundle,
      'Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
    )
    const resourceScript = join(appBundle, 'Contents/Resources/postinstall.sh')

    touch(mainExecutable)
    touch(join(framework, 'Versions/A/Electron Framework'))
    touch(nativeAddon)
    touch(resourceScript)
    chmodSync(mainExecutable, 0o755)
    chmodSync(resourceScript, 0o755)

    expect(macNotarize._internals.collectSignedCodeCandidates(appBundle)).toEqual([
      appBundle,
      framework,
      mainExecutable,
      nativeAddon
    ])
  })
})
