import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  migrateLegacyHomeDataDirs,
  migrateLegacyUserDataDir,
  rewriteLegacyPathsInSettingsFile,
  runLegacyDataImport,
  USER_DATA_MIGRATION_MARKER
} from './legacy-data-migration'

const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-migration-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('legacy data import', () => {
  it('copies user data into WorkWise without moving or linking the source', async () => {
    const appData = await makeTempRoot()
    const source = join(appData, 'WorkGPT')
    const target = join(appData, 'WorkWise')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'workgpt-settings.json'), '{"version":1}', 'utf8')

    const result = migrateLegacyUserDataDir({ userDataPath: target })

    expect(result).toMatchObject({ userDataPath: target, migrated: true, usedLegacyFallback: false, sourcePath: source })
    expect(await readFile(join(target, 'workgpt-settings.json'), 'utf8')).toBe('{"version":1}')
    expect((await lstat(source)).isDirectory()).toBe(true)
    expect((await lstat(source)).isSymbolicLink()).toBe(false)
    const marker = JSON.parse(await readFile(join(target, USER_DATA_MIGRATION_MARKER), 'utf8'))
    expect(marker).toMatchObject({ schema: 'workwise.migration', version: 2, sourcePath: source })
  })

  it('does not overwrite an existing WorkWise user data directory', async () => {
    const appData = await makeTempRoot()
    const target = join(appData, 'WorkWise')
    const source = join(appData, 'WorkGPT')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'current.txt'), 'current', 'utf8')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'legacy.txt'), 'legacy', 'utf8')

    expect(migrateLegacyUserDataDir({ userDataPath: target }).migrated).toBe(false)
    expect(await readFile(join(target, 'current.txt'), 'utf8')).toBe('current')
  })

  it('copies known home data to WorkWise paths and preserves every source', async () => {
    const home = await makeTempRoot()
    await mkdir(join(home, '.kun', 'data'), { recursive: true })
    await writeFile(join(home, '.kun', 'data', 'db.sqlite'), 'db', 'utf8')
    await mkdir(join(home, '.deepseekgui', 'write_workspace'), { recursive: true })
    await writeFile(join(home, '.deepseekgui', 'write_workspace', 'draft.md'), 'draft', 'utf8')

    const results = migrateLegacyHomeDataDirs({ homeDir: home })

    expect(results.some((entry) => entry.outcome === 'imported')).toBe(true)
    expect(await readFile(join(home, '.workwise', 'runtime', 'db.sqlite'), 'utf8')).toBe('db')
    expect(await readFile(join(home, '.workwise', 'write_workspace', 'draft.md'), 'utf8')).toBe('draft')
    expect(await readFile(join(home, '.kun', 'data', 'db.sqlite'), 'utf8')).toBe('db')
    expect(results.every((entry) => entry.rewriteSafe === false)).toBe(true)
  })

  it('does not repeatedly import an intentionally empty home directory', async () => {
    const home = await makeTempRoot()
    await mkdir(join(home, '.kun', 'default_workspace'), { recursive: true })

    const first = migrateLegacyHomeDataDirs({ homeDir: home })
    const second = migrateLegacyHomeDataDirs({ homeDir: home })

    expect(first.find((entry) => entry.mapping.legacySegments.at(-1) === 'default_workspace')?.outcome).toBe('imported')
    expect(second.find((entry) => entry.mapping.legacySegments.at(-1) === 'default_workspace')?.outcome).toBe('target-exists')
  })

  it('never rewrites legacy settings files', async () => {
    const home = await makeTempRoot()
    const path = join(home, 'workgpt-settings.json')
    await writeFile(path, '{"workspaceRoot":"~/.kun/default_workspace"}', 'utf8')

    expect(rewriteLegacyPathsInSettingsFile()).toBe(false)
    expect(await readFile(path, 'utf8')).toBe('{"workspaceRoot":"~/.kun/default_workspace"}')
  })

  it('runs idempotently and never requests a legacy userData fallback', async () => {
    const root = await makeTempRoot()
    const home = join(root, 'home')
    const appData = join(root, 'appData')
    await mkdir(join(appData, 'WorkGPT'), { recursive: true })
    await writeFile(join(appData, 'WorkGPT', 'workgpt-settings.json'), '{"version":1}', 'utf8')
    await mkdir(join(home, '.kun', 'data'), { recursive: true })
    await writeFile(join(home, '.kun', 'data', 'db.sqlite'), 'db', 'utf8')

    const first = runLegacyDataImport({ userDataPath: join(appData, 'WorkWise'), homeDir: home })
    const second = runLegacyDataImport({ userDataPath: join(appData, 'WorkWise'), homeDir: home })

    expect(first.userData).toMatchObject({ migrated: true, usedLegacyFallback: false })
    expect(second.userData).toMatchObject({ migrated: false, usedLegacyFallback: false })
    expect(first.settingsRewritten).toBe(false)
    expect(await readFile(join(home, '.workwise', 'runtime', 'db.sqlite'), 'utf8')).toBe('db')
  })
})
