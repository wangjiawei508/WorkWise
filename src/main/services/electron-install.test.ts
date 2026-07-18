import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  expectedPlatformPath,
  inspectElectronInstall
}: {
  expectedPlatformPath(platform?: NodeJS.Platform): string
  inspectElectronInstall(
    electronDir: string,
    expectedVersion: string,
    platform?: NodeJS.Platform
  ): { ready: boolean; reason?: string; executable?: string; installedVersion?: string }
} = require('../../../scripts/ensure-electron-install.cjs')

const temporaryDirectories: string[] = []

function createElectronFixture(options: { version?: string; configuredPath?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'workwise-electron-install-'))
  temporaryDirectories.push(root)
  const dist = join(root, 'dist')
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(root, 'path.txt'), options.configuredPath ?? 'electron')
  writeFileSync(join(dist, 'version'), options.version ?? '43.1.1')
  writeFileSync(join(dist, 'electron'), 'fixture')
  return root
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Electron runtime preparation', () => {
  it('uses the expected executable path for every supported platform', () => {
    expect(expectedPlatformPath('darwin')).toBe('Electron.app/Contents/MacOS/Electron')
    expect(expectedPlatformPath('linux')).toBe('electron')
    expect(expectedPlatformPath('win32')).toBe('electron.exe')
  })

  it('accepts a complete runtime matching the installed npm package', () => {
    const result = inspectElectronInstall(createElectronFixture(), '43.1.1', 'linux')

    expect(result).toMatchObject({ ready: true, installedVersion: '43.1.1' })
    expect(result.executable).toMatch(/dist[/\\]electron$/)
  })

  it('rejects stale or cross-platform runtime metadata', () => {
    expect(
      inspectElectronInstall(createElectronFixture({ version: '42.0.0' }), '43.1.1', 'linux')
    ).toMatchObject({ ready: false, reason: expect.stringContaining('version mismatch') })
    expect(
      inspectElectronInstall(
        createElectronFixture({ configuredPath: 'electron.exe' }),
        '43.1.1',
        'linux'
      )
    ).toMatchObject({ ready: false, reason: expect.stringContaining('another platform') })
  })
})
