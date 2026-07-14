import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Read-only compatibility import for pre-V2 installations.
 *
 * This module is the only filesystem migration boundary allowed to know legacy
 * product paths. It never renames or deletes a source and never creates a
 * symlink/junction. New data is copied into WorkWise-owned paths once.
 */

export type MigrationLogger = (message: string, detail?: unknown) => void

export const LEGACY_USER_DATA_DIR_NAMES = ['WorkGPT', 'workgpt', 'Kun', 'DeepSeek GUI', 'deepseek-gui'] as const
export const LEGACY_HOME_DATA_ROOT = '.deepseekgui'
export const NEW_HOME_DATA_ROOT = '.workwise'

export type HomeDataMigrationMapping = {
  legacySegments: readonly string[]
  nextSegments: readonly string[]
}

export const HOME_DATA_MIGRATION_MAPPINGS: readonly HomeDataMigrationMapping[] = [
  { legacySegments: ['.kun', 'data'], nextSegments: [NEW_HOME_DATA_ROOT, 'runtime'] },
  { legacySegments: [LEGACY_HOME_DATA_ROOT, 'kun'], nextSegments: [NEW_HOME_DATA_ROOT, 'runtime'] },
  { legacySegments: ['.kun', 'default_workspace'], nextSegments: [NEW_HOME_DATA_ROOT, 'default_workspace'] },
  { legacySegments: [LEGACY_HOME_DATA_ROOT, 'default_workspace'], nextSegments: [NEW_HOME_DATA_ROOT, 'default_workspace'] },
  { legacySegments: ['.kun', 'claw'], nextSegments: [NEW_HOME_DATA_ROOT, 'claw'] },
  { legacySegments: [LEGACY_HOME_DATA_ROOT, 'claw'], nextSegments: [NEW_HOME_DATA_ROOT, 'claw'] },
  { legacySegments: ['.kun', 'write_workspace'], nextSegments: [NEW_HOME_DATA_ROOT, 'write_workspace'] },
  { legacySegments: [LEGACY_HOME_DATA_ROOT, 'write_workspace'], nextSegments: [NEW_HOME_DATA_ROOT, 'write_workspace'] }
] as const

export type HomeMappingOutcome = 'imported' | 'target-exists' | 'skipped-missing' | 'failed'

export type HomeDataMigrationResult = {
  mapping: HomeDataMigrationMapping
  legacyPath: string
  nextPath: string
  outcome: HomeMappingOutcome
  rewriteSafe: false
}

export type UserDataMigrationResult = {
  userDataPath: string
  migrated: boolean
  usedLegacyFallback: false
  sourcePath?: string
}

export type LegacyDataMigrationResult = {
  userData: UserDataMigrationResult
  home: HomeDataMigrationResult[]
  settingsRewritten: false
}

export const USER_DATA_MIGRATION_MARKER = '.workwise-migration-v2.json'

function noopLog(): void {}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return false
  }
}

function isEmptyDirectory(path: string): boolean {
  try {
    return isDirectory(path) && readdirSync(path).length === 0
  } catch {
    return false
  }
}

function copyDirectoryOnce(sourcePath: string, targetPath: string): boolean {
  if (!isDirectory(sourcePath)) return false
  if (existsSync(targetPath) && !isEmptyDirectory(targetPath)) return false
  mkdirSync(dirname(targetPath), { recursive: true })
  cpSync(sourcePath, targetPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: true,
    verbatimSymlinks: true
  })
  return true
}

export function migrateLegacyUserDataDir(input: {
  userDataPath: string
  legacyDirNames?: readonly string[]
  log?: MigrationLogger
}): UserDataMigrationResult {
  const log = input.log ?? noopLog
  const targetPath = input.userDataPath
  if (existsSync(targetPath) && !isEmptyDirectory(targetPath)) {
    return { userDataPath: targetPath, migrated: false, usedLegacyFallback: false }
  }

  const appDataDir = dirname(targetPath)
  const targetName = basename(targetPath)
  const legacyNames = (input.legacyDirNames ?? LEGACY_USER_DATA_DIR_NAMES)
    .filter((name) => name !== targetName)
  for (const legacyName of legacyNames) {
    const sourcePath = join(appDataDir, legacyName)
    if (!isDirectory(sourcePath)) continue
    try {
      if (!copyDirectoryOnce(sourcePath, targetPath)) continue
      writeFileSync(
        join(targetPath, USER_DATA_MIGRATION_MARKER),
        `${JSON.stringify({ schema: 'workwise.migration', version: 2, sourcePath, importedAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8'
      )
      log('legacy-import: copied user data into WorkWise', { sourcePath, targetPath })
      return { userDataPath: targetPath, migrated: true, usedLegacyFallback: false, sourcePath }
    } catch (error) {
      log('legacy-import: user data copy failed; source remains untouched', {
        sourcePath,
        targetPath,
        message: error instanceof Error ? error.message : String(error)
      })
      return { userDataPath: targetPath, migrated: false, usedLegacyFallback: false }
    }
  }
  return { userDataPath: targetPath, migrated: false, usedLegacyFallback: false }
}

export function migrateLegacyHomeDataDirs(input: {
  homeDir: string
  mappings?: readonly HomeDataMigrationMapping[]
  log?: MigrationLogger
}): HomeDataMigrationResult[] {
  const log = input.log ?? noopLog
  const results: HomeDataMigrationResult[] = []
  for (const mapping of input.mappings ?? HOME_DATA_MIGRATION_MAPPINGS) {
    const legacyPath = join(input.homeDir, ...mapping.legacySegments)
    const nextPath = join(input.homeDir, ...mapping.nextSegments)
    const base = { mapping, legacyPath, nextPath, rewriteSafe: false as const }
    if (!isDirectory(legacyPath)) {
      results.push({ ...base, outcome: 'skipped-missing' })
      continue
    }
    // Home targets are WorkWise-owned directories. Once one exists—even if it
    // is intentionally empty—it is authoritative and must not be re-imported.
    if (existsSync(nextPath)) {
      results.push({ ...base, outcome: 'target-exists' })
      continue
    }
    try {
      const imported = copyDirectoryOnce(legacyPath, nextPath)
      results.push({ ...base, outcome: imported ? 'imported' : 'target-exists' })
      if (imported) log('legacy-import: copied home data into WorkWise', { legacyPath, nextPath })
    } catch (error) {
      log('legacy-import: home data copy failed; source remains untouched', {
        legacyPath,
        nextPath,
        message: error instanceof Error ? error.message : String(error)
      })
      results.push({ ...base, outcome: 'failed' })
    }
  }
  return results
}

/** Legacy settings are imported by JsonSettingsStore and are never rewritten. */
export function rewriteLegacyPathsInSettingsFile(): false {
  return false
}

export function runLegacyDataImport(input: {
  userDataPath: string
  homeDir: string
  log?: MigrationLogger
}): LegacyDataMigrationResult {
  const log = input.log ?? noopLog
  let userData: UserDataMigrationResult = {
    userDataPath: input.userDataPath,
    migrated: false,
    usedLegacyFallback: false
  }
  try {
    userData = migrateLegacyUserDataDir({ userDataPath: input.userDataPath, log })
  } catch (error) {
    log('legacy-import: unexpected user data failure', error)
  }

  let home: HomeDataMigrationResult[] = []
  try {
    home = migrateLegacyHomeDataDirs({ homeDir: input.homeDir, log })
  } catch (error) {
    log('legacy-import: unexpected home data failure', error)
  }

  return { userData, home, settingsRewritten: false }
}
