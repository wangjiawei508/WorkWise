import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  prepareGuiUpdaterAcceptance,
  runGuiUpdaterAcceptance,
  type ActiveGuiUpdaterAcceptance,
  type GuiUpdaterAcceptanceReport
} from './gui-updater-acceptance'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'workwise-updater-acceptance-'))
  roots.push(root)
  const userDataPath = join(root, 'user-data')
  const reportPath = join(root, 'evidence.json')
  const configPath = join(root, 'config.json')
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    baseVersion: '0.3.3',
    targetVersion: '0.3.4',
    channel: 'frontier',
    feedUrl: 'https://updates.example.test/workwise/frontier/latest',
    reportPath,
    ...overrides
  }), 'utf8')
  return { root, userDataPath, reportPath, configPath }
}

async function readReport(path: string): Promise<GuiUpdaterAcceptanceReport> {
  return JSON.parse(await readFile(path, 'utf8')) as GuiUpdaterAcceptanceReport
}

describe('GUI updater native acceptance probe', () => {
  it('rejects an insecure test feed before arming the packaged app', async () => {
    const files = await fixture({ feedUrl: 'http://updates.example.test/latest/' })
    await expect(prepareGuiUpdaterAcceptance({
      argv: [`--workwise-updater-acceptance=${files.configPath}`],
      userDataPath: files.userDataPath,
      currentVersion: '0.3.3'
    })).rejects.toThrow('feedUrl must use HTTPS')
  })

  it('ignores and removes malformed stale acceptance state during a normal launch', async () => {
    const files = await fixture()
    const staleState = join(files.userDataPath, 'updater-acceptance-state.json')
    await mkdir(files.userDataPath, { recursive: true })
    await writeFile(staleState, '{"schemaVersion":1,"phase":"installing"}', 'utf8')
    await expect(prepareGuiUpdaterAcceptance({
      argv: [],
      userDataPath: files.userDataPath,
      currentVersion: '0.3.3'
    })).resolves.toBeNull()
    await expect(readFile(staleState, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('records check, download, install, and target relaunch as one acceptance report', async () => {
    const files = await fixture()
    const prepared = await prepareGuiUpdaterAcceptance({
      argv: [`--workwise-updater-acceptance=${files.configPath}`],
      userDataPath: files.userDataPath,
      currentVersion: '0.3.3',
      platform: 'darwin',
      arch: 'arm64',
      now: () => '2026-08-01T01:00:00.000Z'
    })
    expect(prepared?.kind).toBe('active')

    const updater = {
      checkGuiUpdate: vi.fn(async () => ({
        ok: true as const,
        currentVersion: '0.3.3',
        latestVersion: '0.3.4',
        hasUpdate: true,
        releaseUrl: 'https://updates.example.test/release',
        channel: 'frontier' as const,
        manualOnly: false,
        downloaded: false
      })),
      downloadGuiUpdate: vi.fn(async () => ({ ok: true as const, paths: ['/cache/WorkWise.zip'] })),
      installGuiUpdate: vi.fn(async () => ({ ok: true as const }))
    }
    await runGuiUpdaterAcceptance(prepared as ActiveGuiUpdaterAcceptance, updater, () => '2026-08-01T01:01:00.000Z')
    expect(updater.installGuiUpdate).toHaveBeenCalledOnce()

    const relaunched = await prepareGuiUpdaterAcceptance({
      argv: [],
      userDataPath: files.userDataPath,
      currentVersion: '0.3.4',
      platform: 'darwin',
      arch: 'arm64',
      now: () => '2026-08-01T01:02:00.000Z'
    })
    expect(relaunched?.kind).toBe('terminal')
    const report = await readReport(files.reportPath)
    expect(report).toMatchObject({
      status: 'passed',
      baseVersion: '0.3.3',
      targetVersion: '0.3.4',
      platform: 'darwin',
      arch: 'arm64',
      browserOpened: false
    })
    expect(report.stages.map((item) => item.name)).toEqual([
      'base_started',
      'update_available',
      'download_completed',
      'install_requested',
      'target_relaunched'
    ])
  })

  it('fails closed when the feed reports a different target version', async () => {
    const files = await fixture()
    const prepared = await prepareGuiUpdaterAcceptance({
      argv: [`--workwise-updater-acceptance=${files.configPath}`],
      userDataPath: files.userDataPath,
      currentVersion: '0.3.3'
    }) as ActiveGuiUpdaterAcceptance
    await runGuiUpdaterAcceptance(prepared, {
      checkGuiUpdate: async () => ({
        ok: true,
        currentVersion: '0.3.3',
        latestVersion: '0.3.5',
        hasUpdate: true,
        releaseUrl: 'https://updates.example.test/release',
        channel: 'frontier',
        manualOnly: false,
        downloaded: false
      }),
      downloadGuiUpdate: vi.fn(),
      installGuiUpdate: vi.fn()
    })
    const report = await readReport(files.reportPath)
    expect(report.status).toBe('failed')
    expect(report.failure).toContain('expected 0.3.4')
  })
})
