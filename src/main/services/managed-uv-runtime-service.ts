import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import { readBoundedResponseBuffer } from './bounded-response'
import { isCanonicalPathContained } from './canonical-containment'
import { atomicWriteFile, runSerialized } from './durable-file'
import { systemFetch } from './system-network'

export const MANAGED_UV_VERSION = '0.12.3'
export const MANAGED_PYTHON_VERSION = '3.12.12'
const MAX_UV_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_UV_BINARY_BYTES = 64 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 90_000
const UV_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
])
const execFileAsync = promisify(execFile)

export type ManagedUvAssetV1 = {
  name: string
  sha256: string
  executable: 'uv' | 'uv.exe'
  archive: 'tar.gz' | 'zip'
  target: string
}

export type ManagedUvRuntimeV1 = {
  uvPath: string
  uvVersion: string
  pythonPath: string
  pythonVersion: string
  cacheDirectory: string
  pythonInstallDirectory: string
}

type CommandResult = { stdout: string; stderr?: string }
type CommandRunner = (
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
) => Promise<CommandResult>

export type ManagedUvRuntimeServiceOptions = {
  rootDirectory?: string
  platform?: NodeJS.Platform
  arch?: NodeJS.Architecture
  fetch?: typeof fetch
  run?: CommandRunner
  asset?: ManagedUvAssetV1
  uvVersion?: string
  pythonVersion?: string
}

type RuntimeManifestV1 = {
  schema: 'workwise.managed-uv-runtime'
  version: 1
  uvVersion: string
  pythonVersion: string
  target: string
  archiveSha256: string
  binarySha256: string
}

const UV_ASSETS: Record<string, ManagedUvAssetV1> = {
  'darwin-arm64': {
    name: 'uv-aarch64-apple-darwin.tar.gz',
    sha256: '546f7f8a6c70ff13a3a9d2bc958db3427298cebf3e0cb756f9177133b7068843',
    executable: 'uv',
    archive: 'tar.gz',
    target: 'aarch64-apple-darwin'
  },
  'darwin-x64': {
    name: 'uv-x86_64-apple-darwin.tar.gz',
    sha256: '4c9f52262a14da336e4a42ed24992d12d0c956acde87619e4611d321dffa602b',
    executable: 'uv',
    archive: 'tar.gz',
    target: 'x86_64-apple-darwin'
  },
  'win32-arm64': {
    name: 'uv-aarch64-pc-windows-msvc.zip',
    sha256: '4343217d668727b8a8eb5cad92389a1d2eeead93c89940d1b955ba1bb15462eb',
    executable: 'uv.exe',
    archive: 'zip',
    target: 'aarch64-pc-windows-msvc'
  },
  'win32-x64': {
    name: 'uv-x86_64-pc-windows-msvc.zip',
    sha256: 'b23350c79e8ad0192b8124af13a0f17e8d4e4549524785e1aef389ae5a06990e',
    executable: 'uv.exe',
    archive: 'zip',
    target: 'x86_64-pc-windows-msvc'
  },
  'linux-arm64': {
    name: 'uv-aarch64-unknown-linux-gnu.tar.gz',
    sha256: 'bb66cb52e7b1823aed1183630d8d8e5c958840d584a4c55ec10a4cfc168dcca2',
    executable: 'uv',
    archive: 'tar.gz',
    target: 'aarch64-unknown-linux-gnu'
  },
  'linux-x64': {
    name: 'uv-x86_64-unknown-linux-gnu.tar.gz',
    sha256: '600cf9a742aca00d292673b16b5acffaa7b8c269a364ad0c2e79498dcb1fe101',
    executable: 'uv',
    archive: 'tar.gz',
    target: 'x86_64-unknown-linux-gnu'
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function assertUvDownloadUrl(value: string, label: string): URL {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || !UV_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase()) ||
      parsed.username || parsed.password) {
    throw new Error(`${label} must remain on an approved GitHub HTTPS host.`)
  }
  return parsed
}

function safeArchivePath(value: string): boolean {
  const path = value.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
  return Boolean(path) && !path.startsWith('/') && !/^[A-Za-z]:\//.test(path) &&
    !path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
}

async function defaultRun(
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<CommandResult> {
  const result = await execFileAsync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: options.timeoutMs ?? 10 * 60_000,
    windowsHide: true
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false
    throw error
  })
}

async function findRegularFile(root: string, name: string, depth = 0): Promise<string | null> {
  if (depth > 4) return null
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw new Error('Managed uv archive contains a symbolic link.')
    if (entry.isFile() && entry.name === name) return path
    if (entry.isDirectory()) {
      const nested = await findRegularFile(path, name, depth + 1)
      if (nested) return nested
    }
  }
  return null
}

async function readBoundedFile(path: string, maxBytes: number, label: string): Promise<Buffer> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile() || info.size > maxBytes) {
    throw new Error(`${label} is missing, linked, or exceeds its size limit.`)
  }
  return readFile(path)
}

export function managedUvAsset(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): ManagedUvAssetV1 {
  const asset = UV_ASSETS[`${platform}-${arch}`]
  if (!asset) throw new Error(`Managed uv is not supported on ${platform}/${arch}.`)
  return { ...asset }
}

export class ManagedUvRuntimeService {
  private readonly rootDirectory: string
  private readonly asset: ManagedUvAssetV1
  private readonly fetchImpl: typeof fetch
  private readonly run: CommandRunner
  private readonly uvVersion: string
  private readonly pythonVersion: string
  private readonly platform: NodeJS.Platform

  constructor(options: ManagedUvRuntimeServiceOptions = {}) {
    this.rootDirectory = resolve(options.rootDirectory ?? join(homedir(), '.workwise', 'runtimes', 'uv'))
    this.platform = options.platform ?? process.platform
    this.asset = options.asset ?? managedUvAsset(this.platform, options.arch ?? process.arch)
    this.fetchImpl = options.fetch ?? ((input, init) => systemFetch(input, init))
    this.run = options.run ?? defaultRun
    this.uvVersion = options.uvVersion ?? MANAGED_UV_VERSION
    this.pythonVersion = options.pythonVersion ?? MANAGED_PYTHON_VERSION
  }

  async ensure(): Promise<ManagedUvRuntimeV1> {
    return runSerialized(`managed-uv-runtime:${this.rootDirectory}`, async () => {
      await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 })
      const archivePath = await this.ensureArchive()
      const uvPath = await this.ensureUvExecutable(archivePath)
      const version = await this.run(uvPath, ['--version'], {
        env: this.runtimeEnvironment(),
        timeoutMs: 30_000
      })
      if (!version.stdout.trim().startsWith(`uv ${this.uvVersion} `) && version.stdout.trim() !== `uv ${this.uvVersion}`) {
        throw new Error(`Managed uv version mismatch: expected ${this.uvVersion}.`)
      }
      const pythonPath = await this.ensurePython(uvPath)
      return {
        uvPath,
        uvVersion: this.uvVersion,
        pythonPath,
        pythonVersion: this.pythonVersion,
        cacheDirectory: join(this.rootDirectory, 'cache'),
        pythonInstallDirectory: join(this.rootDirectory, 'python')
      }
    })
  }

  private runtimeDirectory(): string {
    return join(this.rootDirectory, 'versions', this.uvVersion, this.asset.target)
  }

  private runtimeEnvironment(): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      UV_CACHE_DIR: join(this.rootDirectory, 'cache'),
      UV_PYTHON_INSTALL_DIR: join(this.rootDirectory, 'python'),
      UV_NO_CONFIG: '1',
      UV_NO_PROGRESS: '1',
      UV_PYTHON_DOWNLOADS: 'never'
    }
    for (const key of [
      'UV_CONFIG_FILE',
      'UV_INSECURE_HOST',
      'UV_NATIVE_TLS',
      'UV_PYTHON_INSTALL_MIRROR',
      'UV_PYTHON_CPYTHON_BUILD_STANDALONE_MIRROR',
      'UV_PYPY_INSTALL_MIRROR'
    ]) {
      delete environment[key]
    }
    return environment
  }

  private async ensureArchive(): Promise<string> {
    const archiveDirectory = join(this.rootDirectory, 'archives', this.uvVersion)
    const archivePath = join(archiveDirectory, this.asset.name)
    await mkdir(archiveDirectory, { recursive: true, mode: 0o700 })
    if (await pathExists(archivePath)) {
      const bytes = await readBoundedFile(archivePath, MAX_UV_ARCHIVE_BYTES, 'Managed uv archive')
      if (sha256(bytes) === this.asset.sha256) return archivePath
      await rm(archivePath, { force: true })
    }
    const url = `https://github.com/astral-sh/uv/releases/download/${encodeURIComponent(this.uvVersion)}/${encodeURIComponent(this.asset.name)}`
    assertUvDownloadUrl(url, 'Managed uv download URL')
    const response = await this.fetchImpl(url, {
      headers: { 'User-Agent': 'WorkWise' },
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`Managed uv download failed (${response.status}).`)
    assertUvDownloadUrl(response.url || url, 'Managed uv download response URL')
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > MAX_UV_ARCHIVE_BYTES) throw new Error('Managed uv archive exceeds 64 MiB.')
    const bytes = await readBoundedResponseBuffer(response, MAX_UV_ARCHIVE_BYTES, 'Managed uv archive')
    if (sha256(bytes) !== this.asset.sha256) throw new Error('Managed uv archive SHA-256 verification failed.')
    const temporary = `${archivePath}.next-${randomUUID()}`
    try {
      const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      try {
        await handle.writeFile(bytes)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporary, archivePath)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
    return archivePath
  }

  private async ensureUvExecutable(archivePath: string): Promise<string> {
    const runtimeDirectory = this.runtimeDirectory()
    const executable = join(runtimeDirectory, this.asset.executable)
    const manifestPath = join(runtimeDirectory, 'runtime.json')
    if (await pathExists(executable) && await pathExists(manifestPath)) {
      try {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as RuntimeManifestV1
        const binary = await readBoundedFile(executable, MAX_UV_BINARY_BYTES, 'Managed uv executable')
        if (manifest.schema === 'workwise.managed-uv-runtime' && manifest.version === 1 &&
            manifest.uvVersion === this.uvVersion && manifest.pythonVersion === this.pythonVersion &&
            manifest.target === this.asset.target && manifest.archiveSha256 === this.asset.sha256 &&
            manifest.binarySha256 === sha256(binary)) {
          return executable
        }
      } catch {
        // Rebuild the runtime from the pinned archive below.
      }
    }

    const scratch = join(this.rootDirectory, `.uv-staging-${randomUUID()}`)
    const extractDirectory = join(scratch, 'extract')
    const stagedRuntime = join(scratch, 'runtime')
    await mkdir(extractDirectory, { recursive: true, mode: 0o700 })
    await mkdir(stagedRuntime, { recursive: true, mode: 0o700 })
    try {
      if (this.asset.archive === 'zip') await this.extractZip(archivePath, extractDirectory)
      else await this.extractTar(archivePath, extractDirectory)
      const extracted = await findRegularFile(extractDirectory, this.asset.executable)
      if (!extracted) throw new Error(`Managed uv archive does not contain ${this.asset.executable}.`)
      const binary = await readBoundedFile(extracted, MAX_UV_BINARY_BYTES, 'Managed uv executable')
      const stagedExecutable = join(stagedRuntime, this.asset.executable)
      await copyFile(extracted, stagedExecutable, constants.COPYFILE_EXCL)
      if (this.platform !== 'win32') await chmod(stagedExecutable, 0o700)
      const manifest: RuntimeManifestV1 = {
        schema: 'workwise.managed-uv-runtime',
        version: 1,
        uvVersion: this.uvVersion,
        pythonVersion: this.pythonVersion,
        target: this.asset.target,
        archiveSha256: this.asset.sha256,
        binarySha256: sha256(binary)
      }
      await atomicWriteFile(join(stagedRuntime, 'runtime.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      await mkdir(dirname(runtimeDirectory), { recursive: true, mode: 0o700 })
      const backup = `${runtimeDirectory}.previous-${randomUUID()}`
      const hadRuntime = await pathExists(runtimeDirectory)
      if (hadRuntime) await rename(runtimeDirectory, backup)
      try {
        await rename(stagedRuntime, runtimeDirectory)
      } catch (error) {
        if (hadRuntime) await rename(backup, runtimeDirectory).catch(() => undefined)
        throw error
      }
      if (hadRuntime) await rm(backup, { recursive: true, force: true })
      return executable
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async extractZip(archivePath: string, target: string): Promise<void> {
    const zip = await JSZip.loadAsync(await readBoundedFile(
      archivePath,
      MAX_UV_ARCHIVE_BYTES,
      'Managed uv archive'
    ), { checkCRC32: true })
    const entries = Object.values(zip.files)
    if (entries.length === 0 || entries.length > 32) throw new Error('Managed uv ZIP has an invalid entry count.')
    for (const entry of entries) {
      const original = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name
      if (!safeArchivePath(original)) throw new Error(`Managed uv ZIP contains an unsafe path: ${original}`)
      if (entry.dir) continue
      if (typeof entry.unixPermissions === 'number' && (entry.unixPermissions & 0o170000) === 0o120000) {
        throw new Error(`Managed uv ZIP contains a symbolic link: ${entry.name}`)
      }
      const bytes = await entry.async('nodebuffer')
      if (bytes.byteLength > MAX_UV_BINARY_BYTES) throw new Error('Managed uv ZIP entry exceeds 64 MiB.')
      const destination = join(target, ...entry.name.replaceAll('\\', '/').split('/'))
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      await open(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
        .then(async (handle) => {
          try {
            await handle.writeFile(bytes)
          } finally {
            await handle.close()
          }
        })
    }
  }

  private async extractTar(archivePath: string, target: string): Promise<void> {
    const listing = await this.run('tar', ['-tzf', archivePath], { timeoutMs: 30_000 })
    const entries = listing.stdout.split(/\r?\n/).filter(Boolean)
    if (entries.length === 0 || entries.length > 32 || entries.some((entry) => !safeArchivePath(entry))) {
      throw new Error('Managed uv TAR contains an unsafe or invalid path listing.')
    }
    await this.run('tar', ['-xzf', archivePath, '-C', target], { timeoutMs: 30_000 })
  }

  private async ensurePython(uvPath: string): Promise<string> {
    const pythonInstallDirectory = join(this.rootDirectory, 'python')
    await mkdir(pythonInstallDirectory, { recursive: true, mode: 0o700 })
    const environment = {
      ...this.runtimeEnvironment(),
      UV_PYTHON_DOWNLOADS: 'automatic'
    }
    await this.run(uvPath, [
      'python',
      'install',
      this.pythonVersion,
      '--install-dir',
      pythonInstallDirectory,
      '--no-bin',
      ...(this.platform === 'win32' ? ['--no-registry'] : []),
      '--managed-python',
      '--no-progress',
      '--no-config'
    ], { env: environment, timeoutMs: 15 * 60_000 })
    const found = await this.run(uvPath, [
      'python',
      'find',
      this.pythonVersion,
      '--managed-python',
      '--no-python-downloads',
      '--no-config'
    ], { env: this.runtimeEnvironment(), timeoutMs: 30_000 })
    const candidate = resolve(found.stdout.trim())
    const canonicalRoot = await realpath(pythonInstallDirectory)
    const canonical = await realpath(candidate)
    if (!isCanonicalPathContained(canonicalRoot, canonical)) {
      throw new Error('Managed Python executable escapes its runtime directory.')
    }
    const info = await lstat(canonical)
    if (!info.isFile() || info.size === 0) throw new Error('Managed Python executable is invalid.')
    const version = await this.run(canonical, ['--version'], {
      env: this.runtimeEnvironment(),
      timeoutMs: 30_000
    })
    const reported = `${version.stdout}\n${version.stderr ?? ''}`.trim()
    if (reported !== `Python ${this.pythonVersion}`) {
      throw new Error(`Managed Python version mismatch: expected ${this.pythonVersion}.`)
    }
    return canonical
  }
}
