import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type {
  BundledAgentPackInstallResult,
  BundledAgentPackSource
} from '../../shared/workgpt-api'
import { expandHomePath, normalizeSkillFolderName } from './workspace-service'

type AgentAssetKind = 'agent' | 'skill' | 'command' | 'tool' | 'lib' | 'template' | 'theme'
type AgentAssetTargetKind = 'file' | 'directory'

type AgentPackAsset = {
  kind: AgentAssetKind
  name: string
  dir: string
  target: string
  profile?: string
}

type AgentPackManifest = {
  name?: string
  version?: string
  agentAssets?: unknown[]
}

type AgentPackAssetSourceMetadata = {
  type: 'bundled-agent-pack'
  id: string
  kind: AgentAssetKind
  name: string
  version?: string
  installedAt?: string
}

const AGENT_PACK_SOURCE_METADATA_FILE = '.workgpt-agent-pack-source.json'
const AGENT_PACK_MANIFEST_DIR = '.workgpt-agent-packs'
const MAX_AGENT_PACK_ASSETS = 256
export const METRO_MONITORING_AGENT_PACK_ID = 'metro-monitoring-agent-pack'
const CODEX_AGENT_PACK_LAYOUT: Record<AgentAssetKind, string> = {
  agent: 'agents',
  skill: 'skills',
  command: 'prompts',
  tool: 'tools',
  lib: 'lib',
  template: 'templates',
  theme: 'themes'
}

const AGENT_ASSET_KINDS = new Set<AgentAssetKind>([
  'agent',
  'skill',
  'command',
  'tool',
  'lib',
  'template',
  'theme'
])

export async function installBundledAgentPack(
  source: BundledAgentPackSource
): Promise<BundledAgentPackInstallResult> {
  try {
    const packId = normalizeSkillFolderName(source.id)
    const sourceDir = resolveBundledAgentPackDirectory(packId)
    if (!sourceDir) {
      return { ok: false, message: `Bundled agent pack is not available: ${packId}` }
    }

    const codexRoot = normalizeCodexRootPath(source.rootPath)
    const manifest = await readAgentPackManifest(sourceDir)
    const assets = normalizeAgentPackAssets(manifest.agentAssets)
    const installedAt = new Date().toISOString()
    const sourceMetadataBase = {
      type: 'bundled-agent-pack' as const,
      id: packId,
      ...(manifest.version ? { version: manifest.version } : {})
    }

    for (const asset of assets) {
      const targetPath = agentAssetTargetPath(codexRoot, asset)
      await assertCanInstallAgentPackAsset(targetPath, {
        ...sourceMetadataBase,
        kind: asset.kind,
        name: asset.name
      })
    }

    await mkdir(codexRoot, { recursive: true })
    const installedAssets: Array<{
      kind: AgentAssetKind
      name: string
      destination: string
      targetKind: AgentAssetTargetKind
    }> = []
    const currentDestinations = new Set<string>()
    const counts: Record<string, number> = {}
    for (const asset of assets) {
      const assetSourcePath = join(sourceDir, asset.dir)
      if (!existsSync(assetSourcePath)) {
        throw new Error(`Bundled agent pack asset is missing: ${asset.dir}`)
      }
      const sourceStats = await stat(assetSourcePath)
      const targetKind: AgentAssetTargetKind = sourceStats.isDirectory() ? 'directory' : 'file'
      const targetPath = agentAssetTargetPath(codexRoot, asset)
      await installAgentPackAsset(assetSourcePath, targetPath, targetKind, {
        ...sourceMetadataBase,
        kind: asset.kind,
        name: asset.name,
        installedAt
      })
      installedAssets.push({
        kind: asset.kind,
        name: asset.name,
        destination: targetPath,
        targetKind
      })
      currentDestinations.add(comparablePath(targetPath))
      counts[asset.kind] = (counts[asset.kind] ?? 0) + 1
    }

    await removeObsoleteAgentPackAssets(codexRoot, packId, currentDestinations)

    const manifestPath = await writeAgentPackInstallManifest(codexRoot, {
      type: 'bundled-agent-pack',
      id: packId,
      target: 'codex',
      rootPath: codexRoot,
      version: manifest.version ?? '',
      installedAt,
      counts,
      assets: installedAssets
    })

    return {
      ok: true,
      rootPath: codexRoot,
      manifestPath,
      installedAssets: installedAssets.length,
      counts
    }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

function bundledAgentPackRootCandidates(): string[] {
  const resourcesPath = stringValue((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath)
  return uniqueStrings([
    resourcesPath ? join(resourcesPath, 'app.asar.unpacked', 'src', 'asset', 'agent-packs') : '',
    resourcesPath ? join(resourcesPath, 'src', 'asset', 'agent-packs') : '',
    resolve(process.cwd(), 'src', 'asset', 'agent-packs')
  ])
}

function resolveBundledAgentPackDirectory(packId: string): string | null {
  for (const root of bundledAgentPackRootCandidates()) {
    const candidate = join(root, packId)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return null
}

function normalizeCodexRootPath(path: string | undefined): string {
  const raw = path?.trim() || process.env.CODEX_HOME || join(homedir(), '.codex')
  return resolve(expandHomePath(raw))
}

async function readAgentPackManifest(sourceDir: string): Promise<AgentPackManifest> {
  const raw = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8')) as unknown
  const record = objectValue(raw)
  if (!record) throw new Error('Bundled agent pack manifest must be a JSON object.')
  return {
    ...(stringValue(record.name) ? { name: stringValue(record.name) } : {}),
    ...(stringValue(record.version) ? { version: stringValue(record.version) } : {}),
    ...(Array.isArray(record.agentAssets) ? { agentAssets: record.agentAssets } : {})
  }
}

function normalizeAgentPackAssets(rawAssets: unknown[] | undefined): AgentPackAsset[] {
  if (!rawAssets || rawAssets.length === 0) {
    throw new Error('Bundled agent pack has no assets.')
  }
  if (rawAssets.length > MAX_AGENT_PACK_ASSETS) {
    throw new Error(`Bundled agent pack has too many assets; limit is ${MAX_AGENT_PACK_ASSETS}.`)
  }
  return rawAssets.map((rawAsset) => {
    const record = objectValue(rawAsset)
    if (!record) throw new Error('Bundled agent pack asset must be a JSON object.')
    const kind = normalizeAgentAssetKind(stringValue(record.kind))
    const name = normalizeSkillFolderName(stringValue(record.name))
    const dir = normalizeAgentAssetPath(stringValue(record.dir), 'directory')
    const target = normalizeAgentAssetPath(stringValue(record.target) || name, 'target')
    const profile = stringValue(record.profile)
    return {
      kind,
      name,
      dir,
      target,
      ...(profile ? { profile } : {})
    }
  })
}

function normalizeAgentAssetKind(kind: string): AgentAssetKind {
  if (AGENT_ASSET_KINDS.has(kind as AgentAssetKind)) return kind as AgentAssetKind
  throw new Error(`Unsupported agent pack asset kind: ${kind}`)
}

function normalizeAgentAssetPath(raw: string, label: string): string {
  const value = raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const parts = value.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`Unsafe agent pack asset ${label}: ${raw}`)
  }
  return parts.join('/')
}

function agentAssetTargetPath(codexRoot: string, asset: AgentPackAsset): string {
  return join(codexRoot, CODEX_AGENT_PACK_LAYOUT[asset.kind], asset.target)
}

async function assertCanInstallAgentPackAsset(
  targetPath: string,
  source: AgentPackAssetSourceMetadata
): Promise<void> {
  if (!existsSync(targetPath)) return
  const existing = await readAgentPackAssetSourceMetadata(targetPath).catch(() => undefined)
  if (agentPackAssetSourceMatches(existing, source)) return
  const legacySkill = await readLegacyBundledSkillSourceMetadata(targetPath, source).catch(() => false)
  if (legacySkill) return
  throw new Error(
    `Agent pack asset "${source.kind}/${source.name}" already exists and is not managed by this pack.`
  )
}

async function installAgentPackAsset(
  sourcePath: string,
  targetPath: string,
  targetKind: AgentAssetTargetKind,
  metadata: AgentPackAssetSourceMetadata
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  const tempDir = await mkdtemp(join(dirname(targetPath), `.workgpt-install-${safeTempName(metadata.name)}-`))
  try {
    if (targetKind === 'directory') {
      await cp(sourcePath, tempDir, { recursive: true, force: true })
      await writeAgentPackAssetSourceMetadata(tempDir, 'directory', metadata)
      await replaceDirectory(targetPath, tempDir)
      return
    }

    const tempTarget = join(tempDir, basename(targetPath))
    const tempMetadataPath = metadataPathForKnownTarget(tempTarget, 'file')
    await cp(sourcePath, tempTarget, { force: true })
    await writeFile(tempMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    await rm(targetPath, { recursive: true, force: true })
    await rm(metadataPathForKnownTarget(targetPath, 'file'), { force: true })
    await rename(tempTarget, targetPath)
    await rename(tempMetadataPath, metadataPathForKnownTarget(targetPath, 'file'))
    await rm(tempDir, { recursive: true, force: true })
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function replaceDirectory(targetPath: string, tempDir: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true })
  await rename(tempDir, targetPath)
}

async function writeAgentPackAssetSourceMetadata(
  root: string,
  targetKind: AgentAssetTargetKind,
  source: AgentPackAssetSourceMetadata
): Promise<void> {
  await writeFile(
    metadataPathForKnownTarget(root, targetKind),
    `${JSON.stringify(source, null, 2)}\n`,
    'utf8'
  )
}

async function readAgentPackAssetSourceMetadata(
  targetPath: string
): Promise<AgentPackAssetSourceMetadata | undefined> {
  const targetKind = await existingTargetKind(targetPath)
  if (!targetKind) return undefined
  const path = metadataPathForKnownTarget(targetPath, targetKind)
  if (!existsSync(path)) return undefined
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
  const record = objectValue(raw)
  if (!record || record.type !== 'bundled-agent-pack') return undefined
  const id = stringValue(record.id)
  const kind = normalizeAgentAssetKind(stringValue(record.kind))
  const name = stringValue(record.name)
  if (!id || !name) return undefined
  return {
    type: 'bundled-agent-pack',
    id,
    kind,
    name,
    ...(stringValue(record.version) ? { version: stringValue(record.version) } : {}),
    ...(stringValue(record.installedAt) ? { installedAt: stringValue(record.installedAt) } : {})
  }
}

async function readLegacyBundledSkillSourceMetadata(
  targetPath: string,
  source: AgentPackAssetSourceMetadata
): Promise<boolean> {
  if (source.kind !== 'skill') return false
  const targetKind = await existingTargetKind(targetPath)
  if (targetKind !== 'directory') return false
  const path = join(targetPath, '.workgpt-skill-source.json')
  if (!existsSync(path)) return false
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
  const record = objectValue(raw)
  return record?.type === 'bundled' && stringValue(record.id) === source.name
}

function metadataPathForKnownTarget(targetPath: string, targetKind: AgentAssetTargetKind): string {
  return targetKind === 'directory'
    ? join(targetPath, AGENT_PACK_SOURCE_METADATA_FILE)
    : `${targetPath}${AGENT_PACK_SOURCE_METADATA_FILE}`
}

async function existingTargetKind(targetPath: string): Promise<AgentAssetTargetKind | null> {
  try {
    const targetStats = await stat(targetPath)
    return targetStats.isDirectory() ? 'directory' : 'file'
  } catch {
    return null
  }
}

function agentPackAssetSourceMatches(
  left: AgentPackAssetSourceMetadata | undefined,
  right: AgentPackAssetSourceMetadata
): boolean {
  return !!left &&
    left.type === right.type &&
    left.id === right.id &&
    left.kind === right.kind &&
    left.name === right.name
}

async function removeObsoleteAgentPackAssets(
  codexRoot: string,
  packId: string,
  currentDestinations: Set<string>
): Promise<void> {
  const manifestPath = agentPackInstallManifestPath(codexRoot, packId)
  if (!existsSync(manifestPath)) return
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown
  const record = objectValue(raw)
  const assets = Array.isArray(record?.assets) ? record.assets : []
  for (const rawAsset of assets) {
    const asset = objectValue(rawAsset)
    const destination = stringValue(asset?.destination)
    if (!destination) continue
    const targetPath = resolve(destination)
    if (!isPathInside(codexRoot, targetPath)) continue
    if (currentDestinations.has(comparablePath(targetPath))) continue
    const existing = await readAgentPackAssetSourceMetadata(targetPath).catch(() => undefined)
    if (!existing || existing.id !== packId) continue
    const targetKind = await existingTargetKind(targetPath)
    await rm(targetPath, { recursive: true, force: true })
    if (targetKind === 'file') {
      await rm(metadataPathForKnownTarget(targetPath, 'file'), { force: true })
    }
  }
}

async function writeAgentPackInstallManifest(
  codexRoot: string,
  manifest: Record<string, unknown>
): Promise<string> {
  const manifestDir = join(codexRoot, AGENT_PACK_MANIFEST_DIR)
  await mkdir(manifestDir, { recursive: true })
  const manifestPath = agentPackInstallManifestPath(codexRoot, stringValue(manifest.id))
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifestPath
}

function agentPackInstallManifestPath(codexRoot: string, packId: string): string {
  return join(codexRoot, AGENT_PACK_MANIFEST_DIR, `${packId}.json`)
}

function safeTempName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset'
}

function comparablePath(path: string): string {
  return resolve(path)
}

function isPathInside(root: string, targetPath: string): boolean {
  const relativePath = relative(resolve(root), resolve(targetPath))
  return !!relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
