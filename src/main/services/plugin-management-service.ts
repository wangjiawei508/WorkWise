import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type {
  InstalledPackagePermissionV1,
  InstalledPackageV1,
  PreparedPluginImportV1
} from '../../shared/marketplace'
import { isCanonicalPathContained } from './canonical-containment'
import {
  PackageInstallationService,
  stagePackageDirectory
} from './package-installation-service'
import { PLUGIN_ARCHIVE_LIMITS } from './plugin-archive-security'
import {
  installPreparedPluginPackage,
  parsePreparedPluginDirectory,
  preparePluginArchive,
  type PluginPackageFormatV1,
  type PreparedPluginPackageV1,
  type TrustedPluginSigningKeyV1
} from './plugin-package-formats'

const PREPARED_IMPORT_TTL_MS = 30 * 60_000
const UUID_DIRECTORY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PreparePluginImportRequestV1 = {
  sourcePath: string
  format?: PluginPackageFormatV1
  catalogSourceId?: string
}

export type InstallPluginImportRequestV1 = {
  preparedId: string
  reviewSha256: string
  expectedCurrentVersion: string | null
  scope: InstalledPackageV1['scope']
  permissions: InstalledPackagePermissionV1[]
  idempotencyKey: string
}

type PreparedRecord = {
  value: PreparedPluginPackageV1
  publicValue: PreparedPluginImportV1
  expiresAtMs: number
}

export type PluginManagementServiceOptions = {
  rootDirectory?: string
  installationService?: PackageInstallationService
  trustedSigningKeys?: TrustedPluginSigningKeyV1[]
  now?: () => Date
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error(label + ' is required.')
  }
  return value.trim()
}

export class PluginManagementService {
  private readonly rootDirectory: string
  private readonly stagingDirectory: string
  private readonly installationService: PackageInstallationService
  private readonly trustedSigningKeys: TrustedPluginSigningKeyV1[]
  private readonly now: () => Date
  private readonly prepared = new Map<string, PreparedRecord>()
  private stagingInitialized = false

  constructor(options: PluginManagementServiceOptions = {}) {
    this.rootDirectory = resolve(options.rootDirectory ?? join(homedir(), '.workwise', 'marketplace', 'imports'))
    this.stagingDirectory = join(this.rootDirectory, 'staging')
    this.installationService = options.installationService ?? new PackageInstallationService()
    this.trustedSigningKeys = options.trustedSigningKeys ?? []
    this.now = options.now ?? (() => new Date())
  }

  listInstalled(): Promise<InstalledPackageV1[]> {
    return this.installationService.list()
  }

  async prepareImport(request: PreparePluginImportRequestV1): Promise<PreparedPluginImportV1> {
    await this.cleanupExpired()
    const sourcePath = resolve(requiredString(request.sourcePath, 'Plugin import source path'))
    const stagingRoot = await this.ensureStagingRoot()
    const lexical = await lstat(sourcePath)
    if (lexical.isSymbolicLink() || (!lexical.isFile() && !lexical.isDirectory())) {
      throw new Error('Plugin import source must be a regular file or directory, not a link.')
    }
    const canonicalSource = await realpath(sourcePath)
    if (isCanonicalPathContained(stagingRoot, canonicalSource)) {
      throw new Error('Plugin import source cannot be inside the private staging directory.')
    }
    const targetDirectory = join(stagingRoot, randomUUID())
    const catalogSourceId = request.catalogSourceId?.trim() || 'workwise-imports'
    let value: PreparedPluginPackageV1
    if (lexical.isDirectory()) {
      await stagePackageDirectory(canonicalSource, targetDirectory)
      try {
        value = await parsePreparedPluginDirectory({
          directory: targetDirectory,
          format: request.format,
          catalogSourceId,
          sourceLocation: canonicalSource,
          sourceKind: 'local',
          trustedSigningKeys: this.trustedSigningKeys
        })
      } catch (error) {
        await rm(targetDirectory, { recursive: true, force: true }).catch(() => undefined)
        throw error
      }
    } else {
      value = await preparePluginArchive({
        archive: await this.readArchive(canonicalSource, lexical),
        targetDirectory,
        format: request.format,
        catalogSourceId,
        sourceLocation: canonicalSource,
        sourceKind: 'local',
        trustedSigningKeys: this.trustedSigningKeys
      })
    }
    const id = randomUUID()
    const createdAt = this.now()
    const expiresAtMs = createdAt.getTime() + PREPARED_IMPORT_TTL_MS
    const publicValue: PreparedPluginImportV1 = {
      schemaVersion: 1,
      id,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      format: value.format,
      package: clone(value.package),
      ...(value.archiveSha256 ? { archiveSha256: value.archiveSha256 } : {}),
      contentSha256: value.contentSha256,
      reviewSha256: value.reviewSha256,
      warnings: [...value.warnings],
      compatibility: clone(value.compatibility)
    }
    this.prepared.set(id, { value, publicValue, expiresAtMs })
    return clone(publicValue)
  }

  async installPrepared(request: InstallPluginImportRequestV1): Promise<InstalledPackageV1> {
    await this.cleanupExpired()
    const preparedId = requiredString(request.preparedId, 'Prepared plugin ID')
    const current = this.prepared.get(preparedId)
    if (!current) throw new Error('Prepared plugin import was not found or has expired.')
    if (request.reviewSha256.toLowerCase() !== current.value.reviewSha256) {
      throw new Error('Prepared plugin review changed; review the package again before installation.')
    }
    const installed = await installPreparedPluginPackage(
      this.installationService,
      current.value,
      {
        expectedCurrentVersion: request.expectedCurrentVersion,
        scope: request.scope,
        permissions: request.permissions,
        idempotencyKey: request.idempotencyKey
      }
    )
    this.prepared.delete(preparedId)
    await rm(current.value.preparedDirectory, { recursive: true, force: true }).catch(() => undefined)
    return installed
  }

  async cancelPrepared(preparedId: string): Promise<boolean> {
    const id = requiredString(preparedId, 'Prepared plugin ID')
    const current = this.prepared.get(id)
    if (!current) return false
    this.prepared.delete(id)
    await rm(current.value.preparedDirectory, { recursive: true, force: true }).catch(() => undefined)
    return true
  }

  rollback(request: {
    packageId: string
    expectedCurrentVersion: string
    idempotencyKey: string
  }): Promise<InstalledPackageV1> {
    return this.installationService.rollback(request)
  }

  private async readArchive(path: string, initial: Awaited<ReturnType<typeof lstat>>): Promise<Buffer> {
    if (initial.size > PLUGIN_ARCHIVE_LIMITS.maxArchiveBytes) {
      throw new Error('Plugin archive exceeds the 64 MiB download limit.')
    }
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.dev !== initial.dev || before.ino !== initial.ino ||
          before.size !== initial.size) {
        throw new Error('Plugin archive changed before it could be read.')
      }
      const bytes = await handle.readFile()
      const after = await handle.stat()
      const current = await lstat(path)
      if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino ||
          after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
          current.isSymbolicLink() || current.dev !== after.dev || current.ino !== after.ino) {
        throw new Error('Plugin archive changed while it was read.')
      }
      return bytes
    } finally {
      await handle.close()
    }
  }

  private async cleanupExpired(): Promise<void> {
    const now = this.now().getTime()
    const expired = [...this.prepared.entries()].filter(([, value]) => value.expiresAtMs <= now)
    for (const [id, value] of expired) {
      this.prepared.delete(id)
      await rm(value.value.preparedDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async ensureStagingRoot(): Promise<string> {
    await mkdir(this.stagingDirectory, { recursive: true, mode: 0o700 })
    const lexical = await lstat(this.stagingDirectory)
    if (lexical.isSymbolicLink() || !lexical.isDirectory()) {
      throw new Error('Plugin staging root must be a real directory.')
    }
    const canonical = await realpath(this.stagingDirectory)
    if (!this.stagingInitialized) {
      const cutoff = this.now().getTime() - PREPARED_IMPORT_TTL_MS
      for (const entry of await readdir(canonical, { withFileTypes: true })) {
        if (!UUID_DIRECTORY.test(entry.name)) continue
        const path = join(canonical, entry.name)
        const info = await lstat(path)
        if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || info.mtimeMs <= cutoff) {
          await rm(path, { recursive: info.isDirectory() && !info.isSymbolicLink(), force: true })
        }
      }
      this.stagingInitialized = true
    }
    return canonical
  }
}
