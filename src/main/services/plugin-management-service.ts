import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  InstalledPackagePermissionV1,
  InstalledPackageV1,
  MarketplacePackageV1,
  PreparedPluginImportV1
} from '../../shared/marketplace'
import { isCanonicalPathContained } from './canonical-containment'
import {
  PackageInstallationService,
  inspectPackageDirectory,
  marketplacePackageReviewSha256,
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
const execFileAsync = promisify(execFile)
const EXEC_MAX_BUFFER = 8 * 1024 * 1024

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
  workspaceRoot?: string
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
  catalogMaterializer?: (item: MarketplacePackageV1, targetDirectory: string) => Promise<void>
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
  private readonly catalogMaterializer: (
    item: MarketplacePackageV1,
    targetDirectory: string
  ) => Promise<void>
  private readonly now: () => Date
  private readonly prepared = new Map<string, PreparedRecord>()
  private stagingInitialized = false

  constructor(options: PluginManagementServiceOptions = {}) {
    this.rootDirectory = resolve(options.rootDirectory ?? join(homedir(), '.workwise', 'marketplace', 'imports'))
    this.stagingDirectory = join(this.rootDirectory, 'staging')
    this.installationService = options.installationService ?? new PackageInstallationService()
    this.trustedSigningKeys = options.trustedSigningKeys ?? []
    this.catalogMaterializer = options.catalogMaterializer ?? materializeCatalogPackage
    this.now = options.now ?? (() => new Date())
  }

  listInstalled(): Promise<InstalledPackageV1[]> {
    return this.installationService.list()
  }

  async prepareCatalogPackage(item: MarketplacePackageV1): Promise<PreparedPluginImportV1> {
    await this.cleanupExpired()
    if (item.availability.status !== 'available' || item.installation.mode !== 'direct-mirror') {
      throw new Error('Catalog package is not eligible for direct installation.')
    }
    const targetDirectory = join(await this.ensureStagingRoot(), randomUUID())
    try {
      await this.catalogMaterializer(clone(item), targetDirectory)
      await writeFile(
        join(targetDirectory, 'workwise.catalog.json'),
        `${JSON.stringify(item, null, 2)}\n`,
        { mode: 0o600 }
      )
      const inspection = await inspectPackageDirectory(targetDirectory)
      const value: PreparedPluginPackageV1 = {
        schemaVersion: 1,
        format: 'catalog',
        package: clone(item),
        preparedDirectory: targetDirectory,
        contentSha256: inspection.sha256,
        reviewSha256: marketplacePackageReviewSha256(item),
        warnings: [],
        compatibility: {
          workwiseCompatible:
            item.compatibility.platforms.includes(process.platform as 'darwin' | 'win32' | 'linux') &&
            item.compatibility.architectures.includes(process.arch as 'arm64' | 'x64'),
          reasons: []
        }
      }
      if (!value.compatibility.workwiseCompatible) {
        value.compatibility.reasons.push('This package does not support the current platform or architecture.')
      }
      return this.registerPrepared(value)
    } catch (error) {
      await rm(targetDirectory, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
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
    return this.registerPrepared(value)
  }

  async installPrepared(
    request: InstallPluginImportRequestV1,
    afterInstall?: (installed: InstalledPackageV1, item: MarketplacePackageV1) => Promise<void>
  ): Promise<InstalledPackageV1> {
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
    await afterInstall?.(installed, clone(current.value.package))
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

  private registerPrepared(value: PreparedPluginPackageV1): PreparedPluginImportV1 {
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

async function command(
  executable: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<string> {
  const result = await execFileAsync(executable, args, {
    ...options,
    encoding: 'utf8',
    maxBuffer: EXEC_MAX_BUFFER,
    timeout: 10 * 60_000,
    windowsHide: true
  })
  return result.stdout
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT')
  }
}

async function copyLicense(sourceDirectory: string, targetDirectory: string): Promise<void> {
  const names = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'NOTICE', 'NOTICE.md', 'COPYING']
  if (await Promise.all(names.map((name) => exists(join(targetDirectory, name)))).then((values) => values.some(Boolean))) {
    return
  }
  for (const name of names) {
    const source = join(sourceDirectory, name)
    if (!await exists(source)) continue
    await copyFile(source, join(targetDirectory, name))
    return
  }
  throw new Error('Catalog package does not preserve a LICENSE, NOTICE, or COPYING file.')
}

function packageDirectory(root: string, packageName: string): string {
  const segments = packageName.split('/').filter(Boolean)
  return join(root, 'node_modules', ...segments)
}

async function materializeNpmPackage(
  item: MarketplacePackageV1,
  targetDirectory: string
): Promise<void> {
  const source = item.source
  if (source.kind !== 'npm' || source.digest.algorithm !== 'sha512-sri') {
    throw new Error('Catalog npm package metadata is incomplete.')
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const spec = `${source.packageName}@${source.version}`
  const integrityOutput = await command(npm, ['view', spec, 'dist.integrity', '--json'])
  let integrity = integrityOutput.trim()
  try {
    const parsed = JSON.parse(integrity) as unknown
    if (typeof parsed === 'string') integrity = parsed
  } catch {
    // npm may return the bare integrity value depending on its version.
  }
  if (integrity !== source.digest.value) {
    throw new Error('npm registry integrity does not match the trusted catalog snapshot.')
  }

  await mkdir(targetDirectory, { recursive: true, mode: 0o700 })
  await writeFile(join(targetDirectory, 'package.json'), `${JSON.stringify({
    name: `workwise-managed-${item.id}`,
    version: '1.0.0',
    private: true
  }, null, 2)}\n`, { mode: 0o600 })
  await command(npm, [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--save-exact',
    '--package-lock=true',
    spec
  ], { cwd: targetDirectory })
  await rm(join(targetDirectory, 'node_modules', '.bin'), { recursive: true, force: true })
  const installedPackageRoot = packageDirectory(targetDirectory, source.packageName)
  if (item.components.some((component) => component.type === 'skill')) {
    const skillSource = join(installedPackageRoot, 'skills')
    if (!await exists(skillSource)) {
      throw new Error('Catalog npm package declares Skills but does not contain a skills directory.')
    }
    await stagePackageDirectory(skillSource, join(targetDirectory, 'skills'))
  }
  await copyLicense(installedPackageRoot, targetDirectory)
}

async function materializeGithubPackage(
  item: MarketplacePackageV1,
  targetDirectory: string
): Promise<void> {
  const source = item.source
  if (source.kind !== 'github' || !/^[0-9a-f]{40}$/i.test(source.resolvedRef)) {
    throw new Error('Catalog GitHub package must use an immutable commit.')
  }
  const repository = `https://github.com/${source.owner}/${source.repository}.git`
  await command('git', ['clone', '--filter=blob:none', '--no-checkout', repository, targetDirectory])
  try {
    await command('git', ['fetch', '--depth=1', 'origin', source.resolvedRef], { cwd: targetDirectory })
    await command('git', ['checkout', '--detach', source.resolvedRef], { cwd: targetDirectory })
    const head = (await command('git', ['rev-parse', 'HEAD'], { cwd: targetDirectory })).trim()
    if (head.toLowerCase() !== source.resolvedRef.toLowerCase()) {
      throw new Error('GitHub checkout does not match the trusted catalog commit.')
    }
    await rm(join(targetDirectory, '.git'), { recursive: true, force: true })
    if (source.subpath) {
      const payload = `${targetDirectory}.payload`
      const selected = resolve(targetDirectory, source.subpath)
      if (!isCanonicalPathContained(targetDirectory, selected)) {
        throw new Error('Catalog package subpath escapes its repository.')
      }
      await stagePackageDirectory(selected, payload)
      await copyLicense(targetDirectory, payload)
      await rm(targetDirectory, { recursive: true, force: true })
      await rename(payload, targetDirectory)
    } else {
      await copyLicense(targetDirectory, targetDirectory)
    }
  } catch (error) {
    await rm(`${targetDirectory}.payload`, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function materializeCatalogPackage(
  item: MarketplacePackageV1,
  targetDirectory: string
): Promise<void> {
  if (await exists(targetDirectory)) throw new Error('Catalog package staging directory already exists.')
  if (item.source.kind === 'npm') {
    await materializeNpmPackage(item, targetDirectory)
    return
  }
  if (item.source.kind === 'github') {
    await materializeGithubPackage(item, targetDirectory)
    return
  }
  if (item.source.kind === 'pypi') {
    throw new Error('Python catalog installation requires a complete managed uv lock and is not available yet.')
  }
  throw new Error(`Catalog source kind is not directly installable: ${item.source.kind}.`)
}
