import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  ManagedToolId,
  ManagedToolListResult,
  ManagedToolResult,
  ManagedToolStatus
} from '../../shared/workgpt-api'
import { installGithubSkill } from './skill-service'

const execFileAsync = promisify(execFile)
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024
const EGO_URL = 'https://lite.ego.app/'
const RELEASE_CACHE_TTL_MS = 30 * 60 * 1_000

type ReleaseAsset = { name?: string; browser_download_url?: string; size?: number }
type GithubRelease = { tag_name?: string; assets?: ReleaseAsset[] }
type ToolManifest = Record<string, { version: string; executablePath: string; installedAt: string }>

const releaseVersionCache = new Map<string, { version: string; expiresAt: number }>()

const LARK_SKILLS = [
  'lark-approval', 'lark-apps', 'lark-attendance', 'lark-base', 'lark-calendar',
  'lark-contact', 'lark-doc', 'lark-drive', 'lark-event', 'lark-im', 'lark-mail',
  'lark-markdown', 'lark-minutes', 'lark-note', 'lark-okr', 'lark-openapi-explorer',
  'lark-shared', 'lark-sheets', 'lark-skill-maker', 'lark-slides', 'lark-task',
  'lark-vc-agent', 'lark-vc', 'lark-whiteboard', 'lark-wiki',
  'lark-workflow-meeting-summary', 'lark-workflow-standup-report'
]
const OFFICE_SKILLS = [
  'officecli', 'officecli-academic-paper', 'officecli-data-dashboard', 'officecli-docx',
  'officecli-financial-model', 'officecli-pitch-deck', 'officecli-pptx',
  'officecli-word-form', 'officecli-xlsx'
]

export function managedToolsRoot(): string {
  return resolve(process.env.WORKWISE_TOOLS_ROOT?.trim() || join(homedir(), '.workwise', 'tools'))
}

export function managedToolsBinDir(): string {
  return join(managedToolsRoot(), 'bin')
}

export function managedToolsSkillRoot(): string {
  return join(managedToolsRoot(), 'skills')
}

function manifestPath(): string {
  return join(managedToolsRoot(), 'manifest.json')
}

function toolExecutableName(id: ManagedToolId): string {
  const base = id === 'officecli' ? 'officecli' : id === 'lark-cli' ? 'lark-cli' : 'ego-browser'
  return process.platform === 'win32' && id !== 'ego-browser' ? `${base}.exe` : base
}

function platformAsset(id: Exclude<ManagedToolId, 'ego-browser'>, version: string): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (id === 'officecli') {
    if (process.platform === 'darwin') return `officecli-mac-${arch}`
    if (process.platform === 'win32') return `officecli-win-${arch}.exe`
  }
  if (id === 'lark-cli') {
    const larkArch = arch === 'x64' ? 'amd64' : arch
    if (process.platform === 'darwin') return `lark-cli-${version}-darwin-${larkArch}.tar.gz`
    if (process.platform === 'win32') return `lark-cli-${version}-windows-${larkArch}.zip`
  }
  throw new Error(`${id} is not supported on ${process.platform}/${process.arch}.`)
}

function repoFor(id: Exclude<ManagedToolId, 'ego-browser'>): string {
  return id === 'lark-cli' ? 'larksuite/cli' : 'iOfficeAI/OfficeCLI'
}

async function readManifest(): Promise<ToolManifest> {
  if (!existsSync(manifestPath())) return {}
  return JSON.parse(await readFile(manifestPath(), 'utf8')) as ToolManifest
}

async function writeManifest(manifest: ToolManifest): Promise<void> {
  await mkdir(managedToolsRoot(), { recursive: true })
  await writeFile(manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function fetchRelease(repo: string): Promise<GithubRelease> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'WorkWise' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`Unable to read ${repo} release (${response.status}).`)
  return await response.json() as GithubRelease
}

async function latestVersionFor(id: Exclude<ManagedToolId, 'ego-browser'>): Promise<string> {
  const cached = releaseVersionCache.get(id)
  if (cached && cached.expiresAt > Date.now()) return cached.version
  const version = releaseVersion(await fetchRelease(repoFor(id)))
  releaseVersionCache.set(id, { version, expiresAt: Date.now() + RELEASE_CACHE_TTL_MS })
  return version
}

function releaseVersion(release: GithubRelease): string {
  const version = release.tag_name?.trim().replace(/^v/, '') ?? ''
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error('Release version is invalid.')
  return version
}

function findAsset(release: GithubRelease, name: string): ReleaseAsset {
  const asset = release.assets?.find((candidate) => candidate.name === name)
  if (!asset?.browser_download_url) throw new Error(`Release asset is missing: ${name}`)
  if ((asset.size ?? 0) > MAX_DOWNLOAD_BYTES) throw new Error(`Release asset is too large: ${name}`)
  return asset
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}).`)
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_DOWNLOAD_BYTES) throw new Error('Download exceeds the managed tool size limit.')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error('Download exceeds the managed tool size limit.')
  return bytes
}

function checksumFor(text: string, assetName: string): string {
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (match && basename(match[2] ?? '') === assetName) return (match[1] ?? '').toLowerCase()
  }
  throw new Error(`Checksum is missing for ${assetName}.`)
}

function archiveEntryIsSafe(entry: string): boolean {
  const normalized = entry.trim().replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

function assertSafeArchiveListing(listing: string): void {
  const entries = listing.split(/\r?\n/).filter(Boolean)
  if (entries.length === 0) throw new Error('Downloaded archive is empty.')
  const unsafe = entries.find((entry) => !archiveEntryIsSafe(entry))
  if (unsafe) throw new Error(`Downloaded archive contains an unsafe path: ${unsafe}`)
}

async function findFile(root: string, name: string): Promise<string | null> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isFile() && entry.name === name) return path
    if (entry.isDirectory()) {
      const nested = await findFile(path, name)
      if (nested) return nested
    }
  }
  return null
}

async function extractAsset(id: Exclude<ManagedToolId, 'ego-browser'>, assetName: string, bytes: Buffer, target: string): Promise<string> {
  await mkdir(target, { recursive: true })
  const executableName = toolExecutableName(id)
  if (id === 'officecli') {
    const path = join(target, executableName)
    await writeFile(path, bytes)
    if (process.platform !== 'win32') await chmod(path, 0o755)
    return path
  }
  const archivePath = join(target, assetName)
  await writeFile(archivePath, bytes)
  if (assetName.endsWith('.tar.gz')) {
    const listing = await execFileAsync('tar', ['-tzf', archivePath], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })
    assertSafeArchiveListing(listing.stdout)
    await execFileAsync('tar', ['-xzf', archivePath, '-C', target], { timeout: 30_000 })
  } else if (assetName.endsWith('.zip') && process.platform === 'win32') {
    const listing = await execFileAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($args[0]); try { $z.Entries | ForEach-Object { $_.FullName } } finally { $z.Dispose() }',
      archivePath
    ], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })
    assertSafeArchiveListing(listing.stdout)
    await execFileAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', archivePath, target
    ], { timeout: 30_000 })
  } else {
    throw new Error(`Unsupported archive: ${assetName}`)
  }
  await rm(archivePath, { force: true })
  const executable = await findFile(target, executableName)
  if (!executable) throw new Error(`Installed archive does not contain ${executableName}.`)
  if (process.platform !== 'win32') await chmod(executable, 0o755)
  return executable
}

async function activateExecutable(id: Exclude<ManagedToolId, 'ego-browser'>, executable: string): Promise<string> {
  await mkdir(managedToolsBinDir(), { recursive: true })
  const active = join(managedToolsBinDir(), toolExecutableName(id))
  const next = `${active}.next-${randomUUID()}`
  if (process.platform === 'win32') {
    await copyFile(executable, next)
    await rm(active, { force: true })
  } else {
    await symlink(executable, next)
  }
  await rename(next, active)
  return active
}

async function installCompanionSkills(id: ManagedToolId): Promise<void> {
  await mkdir(managedToolsSkillRoot(), { recursive: true })
  if (id === 'lark-cli') {
    for (const name of LARK_SKILLS) {
      const result = await installGithubSkill(managedToolsSkillRoot(), {
        owner: 'larksuite', repo: 'cli', path: `skills/${name}`, skillName: name, autoUpdate: true
      })
      if (!result.ok) throw new Error(result.message)
    }
  } else if (id === 'officecli') {
    for (const name of OFFICE_SKILLS) {
      const result = await installGithubSkill(managedToolsSkillRoot(), {
        owner: 'iOfficeAI', repo: 'OfficeCLI', path: `skills/${name}`, skillName: name, autoUpdate: true
      })
      if (!result.ok) throw new Error(result.message)
    }
  } else {
    const result = await installGithubSkill(managedToolsSkillRoot(), {
      owner: 'citrolabs', repo: 'ego-lite', path: 'skills/ego-browser', skillName: 'ego-browser', autoUpdate: true
    })
    if (!result.ok) throw new Error(result.message)
  }
}

async function runTool(path: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await execFileAsync(path, args, { timeout: 10_000, maxBuffer: 512 * 1024 })
    return { ok: true, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
  } catch (error) {
    const value = error as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, output: `${value.stdout || ''}${value.stderr || value.message || ''}`.trim() }
  }
}

export async function diagnoseManagedTool(id: ManagedToolId): Promise<ManagedToolResult> {
  try {
    if (id === 'ego-browser') {
      const candidates = [join(managedToolsBinDir(), 'ego-browser'), join(homedir(), '.local', 'bin', 'ego-browser')]
      const executablePath = candidates.find(existsSync)
      if (!executablePath) {
        return { ok: true, status: { id, state: 'needs_external_app', externalUrl: EGO_URL, message: 'Install ego lite and finish onboarding.' } }
      }
      const check = await runTool(executablePath, ['--help'])
      return { ok: true, status: { id, state: check.ok ? 'installed' : 'error', executablePath, message: check.ok ? 'ego-browser is ready.' : check.output } }
    }
    const manifest = await readManifest()
    const record = manifest[id]
    if (!record || !existsSync(record.executablePath)) return { ok: true, status: { id, state: 'not_installed' } }
    const versionCheck = await runTool(record.executablePath, ['--version'])
    if (!versionCheck.ok) return { ok: true, status: { id, state: 'error', installedVersion: record.version, executablePath: record.executablePath, message: versionCheck.output } }
    if (id === 'lark-cli') {
      const auth = await runTool(record.executablePath, ['auth', 'status'])
      return { ok: true, status: { id, state: auth.ok ? 'installed' : 'needs_login', installedVersion: record.version, executablePath: record.executablePath, message: auth.ok ? auth.output : 'Run Lark OAuth setup before using account data.' } }
    }
    return { ok: true, status: { id, state: 'installed', installedVersion: record.version, executablePath: record.executablePath, message: versionCheck.output } }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function installManagedTool(id: ManagedToolId): Promise<ManagedToolResult> {
  try {
    if (id === 'ego-browser') {
      await installCompanionSkills(id)
      return diagnoseManagedTool(id)
    }
    const release = await fetchRelease(repoFor(id))
    const version = releaseVersion(release)
    const assetName = platformAsset(id, version)
    const checksumName = id === 'lark-cli' ? 'checksums.txt' : 'SHA256SUMS'
    const [assetBytes, checksumBytes] = await Promise.all([
      download(findAsset(release, assetName).browser_download_url as string),
      download(findAsset(release, checksumName).browser_download_url as string)
    ])
    const expected = checksumFor(checksumBytes.toString('utf8'), assetName)
    const actual = createHash('sha256').update(assetBytes).digest('hex')
    if (actual !== expected) throw new Error(`Checksum verification failed for ${assetName}.`)

    const toolRoot = join(managedToolsRoot(), id)
    await mkdir(toolRoot, { recursive: true })
    const temp = await mkdtemp(join(toolRoot, '.install-'))
    const transactionId = randomUUID()
    const finalDir = join(toolRoot, version)
    const previousDir = join(toolRoot, `.previous-${transactionId}`)
    const activePath = join(managedToolsBinDir(), toolExecutableName(id))
    const activeBackup = join(toolRoot, `.active-${transactionId}`)
    let movedPrevious = false
    let movedNew = false
    try {
      const executable = await extractAsset(id, assetName, assetBytes, temp)
      await installCompanionSkills(id)
      if (existsSync(activePath)) await copyFile(activePath, activeBackup)
      if (existsSync(finalDir)) {
        await rename(finalDir, previousDir)
        movedPrevious = true
      }
      await rename(temp, finalDir)
      movedNew = true
      const finalExecutable = join(finalDir, executable.slice(temp.length + 1))
      const active = await activateExecutable(id, finalExecutable)
      const manifest = await readManifest()
      manifest[id] = { version, executablePath: active, installedAt: new Date().toISOString() }
      await writeManifest(manifest)
      await rm(previousDir, { recursive: true, force: true }).catch(() => undefined)
      await rm(activeBackup, { force: true }).catch(() => undefined)
    } catch (error) {
      await rm(temp, { recursive: true, force: true }).catch(() => undefined)
      if (movedNew) await rm(finalDir, { recursive: true, force: true }).catch(() => undefined)
      if (movedPrevious) await rename(previousDir, finalDir).catch(() => undefined)
      if (existsSync(activeBackup)) {
        await rm(activePath, { force: true }).catch(() => undefined)
        await mkdir(managedToolsBinDir(), { recursive: true }).catch(() => undefined)
        await copyFile(activeBackup, activePath).catch(() => undefined)
        if (process.platform !== 'win32') await chmod(activePath, 0o755).catch(() => undefined)
        await rm(activeBackup, { force: true }).catch(() => undefined)
      }
      throw error
    }
    return diagnoseManagedTool(id)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function updateManagedTool(id: ManagedToolId): Promise<ManagedToolResult> {
  return installManagedTool(id)
}

export async function removeManagedTool(id: ManagedToolId): Promise<ManagedToolResult> {
  try {
    if (id === 'ego-browser') {
      await rm(join(managedToolsSkillRoot(), 'ego-browser'), { recursive: true, force: true })
      return { ok: true, status: { id, state: 'needs_external_app', externalUrl: EGO_URL } }
    }
    const manifest = await readManifest()
    await rm(join(managedToolsRoot(), id), { recursive: true, force: true })
    await rm(join(managedToolsBinDir(), toolExecutableName(id)), { force: true })
    delete manifest[id]
    await writeManifest(manifest)
    const skills = id === 'lark-cli' ? LARK_SKILLS : OFFICE_SKILLS
    await Promise.all(skills.map((name) => rm(join(managedToolsSkillRoot(), name), { recursive: true, force: true })))
    return { ok: true, status: { id, state: 'not_installed' } }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function listManagedTools(): Promise<ManagedToolListResult> {
  try {
    const ids = ['lark-cli', 'officecli', 'ego-browser'] as ManagedToolId[]
    const results = await Promise.all(ids.map(diagnoseManagedTool))
    const tools = results.map((result, index) => result.ok
      ? result.status
      : ({ id: ids[index], state: 'error', message: result.message } as ManagedToolStatus))
    await Promise.all(tools.map(async (status) => {
      if (status.id === 'ego-browser' || !status.installedVersion) return
      try {
        const latestVersion = await latestVersionFor(status.id)
        status.latestVersion = latestVersion
        if (latestVersion !== status.installedVersion && status.state === 'installed') {
          status.state = 'update_available'
        }
      } catch {
        // Diagnostics remain useful offline; update checks must not hide installed tools.
      }
    }))
    return {
      ok: true,
      tools
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export const _internals = { platformAsset, checksumFor, archiveEntryIsSafe, assertSafeArchiveListing }
