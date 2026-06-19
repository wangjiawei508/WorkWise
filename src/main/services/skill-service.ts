import { existsSync, readdirSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { AppSettingsV1 } from '../../shared/app-settings'
import type {
  BundledSkillInstallResult,
  BundledSkillSource,
  GithubSkillInstallResult,
  GithubSkillSource,
  GithubSkillSyncResult,
  SkillListItem
} from '../../shared/workgpt-api'
import { expandHomePath, normalizeSkillFolderName } from './workspace-service'

export type GuiSkillScope = 'project' | 'global'
export type GuiSkillSource = NonNullable<SkillListItem['source']>

export type GuiSkillSummary = {
  id: string
  name: string
  description?: string
  root: string
  entryPath: string
  scope: GuiSkillScope
  legacy: boolean
  source?: GuiSkillSource
}

export type GuiSkillListResult =
  | { ok: true; skills: GuiSkillSummary[]; validationErrors: Array<{ root: string; message: string }> }
  | { ok: false; message: string }

export type GuiSkillRoot = {
  path: string
  scope: GuiSkillScope
}

type GithubSkillSourceMetadata = Extract<GuiSkillSource, { type: 'github' }> & {
  installedAt?: string
}

type BundledSkillSourceMetadata = Extract<GuiSkillSource, { type: 'bundled' }> & {
  installedAt?: string
}

type SkillSourceMetadata = GithubSkillSourceMetadata | BundledSkillSourceMetadata

type GithubContentEntry = {
  name?: string
  path?: string
  type?: string
  size?: number
  download_url?: string | null
}

type GithubCommitResponse = {
  sha?: string
}

const SKILL_SOURCE_METADATA_FILE = '.workgpt-skill-source.json'
const DEFAULT_GITHUB_REF = 'main'
const MAX_GITHUB_SKILL_FILES = 512
const MAX_GITHUB_SKILL_BYTES = 8 * 1024 * 1024

export async function guiSkillRootsForRuntime(
  settings: AppSettingsV1 | undefined,
  workspaceRootOverride?: string
): Promise<GuiSkillRoot[]> {
  if (!settings && !workspaceRootOverride) return []
  const workspaceRoots = uniqueStrings([
    workspaceRootOverride,
    settings?.workspaceRoot,
    settings?.claw.im.workspaceRoot,
    settings?.schedule.defaultWorkspaceRoot,
    ...(settings?.claw.channels.map((channel) => channel.workspaceRoot) ?? []),
    ...(settings?.claw.tasks.map((task) => task.workspaceRoot) ?? []),
    ...(settings?.schedule.tasks.map((task) => task.workspaceRoot) ?? [])
  ].map(normalizeSkillRootPath).filter(Boolean))
  const projectRoots = workspaceRoots.flatMap((workspaceRoot) => [
    join(workspaceRoot, '.codex', 'skills'),
    join(workspaceRoot, '.agents', 'skills'),
    join(workspaceRoot, 'skills')
  ])
  const globalRoots = [
    join(homedir(), '.codex', 'skills'),
    join(homedir(), '.agents', 'skills'),
    join(homedir(), '.kun', 'skills'),
    ...await discoverCodexPluginSkillRoots()
  ]
  const configuredExtraRoots = [
    ...(settings?.claw.skills.extraDirs ?? []),
    ...(settings?.schedule.skills.extraDirs ?? [])
  ].map(normalizeSkillRootPath)

  return uniqueSkillRoots([
    ...projectRoots
      .filter((root) => existsSync(root))
      .map((path) => ({ path, scope: 'project' as const })),
    ...globalRoots
      .filter((root) => existsSync(root))
      .map((path) => ({ path, scope: 'global' as const })),
    ...configuredExtraRoots
      .filter(Boolean)
      .map((path) => ({ path, scope: scopeForConfiguredRoot(path, workspaceRoots) }))
  ])
}

export async function listGuiSkills(
  settings: AppSettingsV1,
  workspaceRootOverride?: string
): Promise<GuiSkillListResult> {
  try {
    const roots = await guiSkillRootsForRuntime(settings, workspaceRootOverride)
    const skills: GuiSkillSummary[] = []
    const validationErrors: Array<{ root: string; message: string }> = []
    for (const root of roots) {
      const candidates = await packageCandidates(root.path).catch((error) => {
        validationErrors.push({ root: root.path, message: errorMessage(error) })
        return []
      })
      for (const candidate of candidates) {
        const loaded = await loadSkillSummary(candidate, root.scope).catch((error) => {
          validationErrors.push({ root: candidate, message: errorMessage(error) })
          return null
        })
        if (loaded) skills.push(loaded)
      }
    }
    return {
      ok: true,
      skills: dedupeSkills(skills),
      validationErrors
    }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

export function normalizeSkillRootPath(path: string | undefined): string {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return ''
  return resolve(expandHomePath(trimmed))
}

export async function installGithubSkill(
  rootPath: string,
  source: GithubSkillSource
): Promise<GithubSkillInstallResult> {
  try {
    const root = normalizeSkillRootPath(rootPath)
    if (!root) return { ok: false, message: 'Skill directory is required.' }
    const skillName = normalizeSkillFolderName(
      source.skillName || basename(normalizeGithubPath(source.path)) || source.repo
    )
    const ref = normalizeGithubRef(source.ref)
    const targetDir = join(root, skillName)
    const requestedSource: GithubSkillSourceMetadata = {
      type: 'github',
      owner: source.owner.trim(),
      repo: source.repo.trim(),
      path: normalizeGithubPath(source.path),
      ref,
      autoUpdate: source.autoUpdate !== false
    }

    await assertCanInstallIntoTarget(targetDir, requestedSource)

    const latestSha = await fetchGithubCommitSha(requestedSource)
    const existingSource = await readSkillSourceMetadata(targetDir).catch(() => undefined)
    const entryPath = join(targetDir, 'SKILL.md')
    if (
      existingSource?.type === 'github' &&
      existingSource.installedSha === latestSha &&
      existsSync(entryPath)
    ) {
      return { ok: true, path: entryPath, sha: latestSha, updated: false }
    }

    await mkdir(root, { recursive: true })
    const tempDir = await mkdtemp(join(root, `.workgpt-install-${skillName}-`))
    try {
      await downloadGithubSkillDirectory(requestedSource, tempDir)
      await writeSkillSourceMetadata(tempDir, {
        ...requestedSource,
        installedSha: latestSha,
        installedAt: new Date().toISOString()
      })
      await replaceSkillDirectory(targetDir, tempDir)
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }

    return { ok: true, path: join(targetDir, 'SKILL.md'), sha: latestSha, updated: true }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

export async function installBundledSkill(
  rootPath: string,
  source: BundledSkillSource
): Promise<BundledSkillInstallResult> {
  try {
    const root = normalizeSkillRootPath(rootPath)
    if (!root) return { ok: false, message: 'Skill directory is required.' }
    const bundleId = normalizeSkillFolderName(source.id)
    const skillName = normalizeSkillFolderName(source.skillName || bundleId)
    const sourceDir = resolveBundledSkillDirectory(bundleId)
    if (!sourceDir) {
      return { ok: false, message: `Bundled Skill is not available: ${bundleId}` }
    }

    const targetDir = join(root, skillName)
    const requestedSource: BundledSkillSourceMetadata = {
      type: 'bundled',
      id: bundleId,
      autoUpdate: false
    }
    await assertCanInstallIntoTarget(targetDir, requestedSource)

    await mkdir(root, { recursive: true })
    const tempDir = await mkdtemp(join(root, `.workgpt-install-${skillName}-`))
    try {
      await cp(sourceDir, tempDir, { recursive: true, force: true })
      await writeSkillSourceMetadata(tempDir, {
        ...requestedSource,
        installedAt: new Date().toISOString()
      })
      await replaceSkillDirectory(targetDir, tempDir)
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }

    return { ok: true, path: join(targetDir, 'SKILL.md'), updated: true }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

export async function syncGithubManagedSkills(
  settings: AppSettingsV1,
  workspaceRootOverride?: string
): Promise<GithubSkillSyncResult> {
  try {
    const roots = await guiSkillRootsForRuntime(settings, workspaceRootOverride)
    const seen = new Set<string>()
    let checked = 0
    let updated = 0
    const errors: Array<{ path: string; message: string }> = []

    for (const root of roots) {
      const candidates = await packageCandidates(root.path).catch((error) => {
        errors.push({ path: root.path, message: errorMessage(error) })
        return []
      })
      for (const candidate of candidates) {
        const candidateKey = comparablePath(candidate)
        if (seen.has(candidateKey)) continue
        seen.add(candidateKey)
        const source = await readSkillSourceMetadata(candidate).catch((error) => {
          errors.push({ path: candidate, message: errorMessage(error) })
          return undefined
        })
        if (source?.type !== 'github' || source.autoUpdate === false) continue
        checked += 1
        const result = await installGithubSkill(dirname(candidate), {
          owner: source.owner,
          repo: source.repo,
          path: source.path,
          ref: source.ref,
          skillName: basename(candidate),
          autoUpdate: source.autoUpdate
        })
        if (result.ok) {
          if (result.updated) updated += 1
        } else {
          errors.push({ path: candidate, message: result.message })
        }
      }
    }

    return { ok: true, checked, updated, errors }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  }
}

async function discoverCodexPluginSkillRoots(): Promise<string[]> {
  const roots: string[] = []
  await collectSkillRoots(join(homedir(), '.codex', 'plugins', 'cache'), roots, 0, 5)
  return roots
}

async function collectSkillRoots(root: string, roots: string[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth || !existsSync(root)) return
  if (basename(root) === 'skills' && skillRootHasPackages(root)) {
    roots.push(root)
    return
  }
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => collectSkillRoots(join(root, entry.name), roots, depth + 1, maxDepth)))
}

function skillRootHasPackages(root: string): boolean {
  if (existsSync(join(root, 'SKILL.md')) || existsSync(join(root, 'skill.json'))) return true
  try {
    return readdirSync(root, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() &&
      (existsSync(join(root, entry.name, 'SKILL.md')) || existsSync(join(root, entry.name, 'skill.json')))
    )
  } catch {
    return false
  }
}

async function packageCandidates(root: string): Promise<string[]> {
  const candidates = new Set<string>()
  if (existsSync(join(root, 'skill.json')) || existsSync(join(root, 'SKILL.md'))) {
    candidates.add(root)
  }
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    if (existsSync(join(dir, 'skill.json')) || existsSync(join(dir, 'SKILL.md'))) {
      candidates.add(dir)
    }
  }
  return [...candidates]
}

async function loadSkillSummary(root: string, scope: GuiSkillScope): Promise<GuiSkillSummary | null> {
  const source = sourceForList(await readSkillSourceMetadata(root).catch(() => undefined))
  const manifestPath = join(root, 'skill.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    const name = stringValue(manifest.name) || titleFromSlug(basename(root))
    const entry = stringValue(manifest.entry) || 'SKILL.md'
    return {
      id: slug(stringValue(manifest.id) || name || basename(root)),
      name,
      ...(stringValue(manifest.description) ? { description: stringValue(manifest.description) } : {}),
      root,
      entryPath: join(root, entry),
      scope,
      legacy: false,
      ...(source ? { source } : {})
    }
  }
  const entryPath = join(root, 'SKILL.md')
  if (!existsSync(entryPath)) return null
  const content = await readFile(entryPath, 'utf8')
  const frontmatter = readFrontmatter(content)
  const name = displaySkillName(frontmatter.name, basename(root))
  return {
    id: slug(frontmatter.id || basename(root)),
    name,
    ...(frontmatter.description ? { description: frontmatter.description } : {}),
    root,
    entryPath,
    scope,
    legacy: true,
    ...(source ? { source } : {})
  }
}

async function assertCanInstallIntoTarget(targetDir: string, source: SkillSourceMetadata): Promise<void> {
  if (!existsSync(targetDir)) return
  const existing = await readSkillSourceMetadata(targetDir).catch(() => undefined)
  if (skillSourceMatches(existing, source)) return
  throw new Error(`Skill "${basename(targetDir)}" already exists and is not managed by this source.`)
}

async function replaceSkillDirectory(targetDir: string, tempDir: string): Promise<void> {
  await rm(targetDir, { recursive: true, force: true })
  await rename(tempDir, targetDir)
}

async function writeSkillSourceMetadata(root: string, source: SkillSourceMetadata): Promise<void> {
  await writeFile(
    join(root, SKILL_SOURCE_METADATA_FILE),
    `${JSON.stringify(source, null, 2)}\n`,
    'utf8'
  )
}

async function readSkillSourceMetadata(root: string): Promise<SkillSourceMetadata | undefined> {
  const path = join(root, SKILL_SOURCE_METADATA_FILE)
  if (!existsSync(path)) return undefined
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
  const record = objectValue(raw)
  if (!record) return undefined
  if (record.type === 'github') {
    const owner = stringValue(record.owner)
    const repo = stringValue(record.repo)
    if (!owner || !repo) return undefined
    return {
      type: 'github',
      owner,
      repo,
      path: normalizeGithubPath(stringValue(record.path)),
      ref: normalizeGithubRef(stringValue(record.ref)),
      ...(stringValue(record.installedSha) ? { installedSha: stringValue(record.installedSha) } : {}),
      autoUpdate: record.autoUpdate !== false,
      ...(stringValue(record.installedAt) ? { installedAt: stringValue(record.installedAt) } : {})
    }
  }
  if (record.type === 'bundled') {
    const id = stringValue(record.id)
    if (!id) return undefined
    return {
      type: 'bundled',
      id,
      autoUpdate: false,
      ...(stringValue(record.installedAt) ? { installedAt: stringValue(record.installedAt) } : {})
    }
  }
  return undefined
}

function sourceForList(source: SkillSourceMetadata | undefined): GuiSkillSource | undefined {
  if (!source) return undefined
  if (source.type === 'github') {
    return {
      type: 'github',
      owner: source.owner,
      repo: source.repo,
      path: source.path,
      ref: source.ref,
      ...(source.installedSha ? { installedSha: source.installedSha } : {}),
      autoUpdate: source.autoUpdate
    }
  }
  return {
    type: 'bundled',
    id: source.id,
    autoUpdate: false
  }
}

function skillSourceMatches(left: SkillSourceMetadata | undefined, right: SkillSourceMetadata): boolean {
  if (!left || left.type !== right.type) return false
  if (left.type === 'bundled' && right.type === 'bundled') {
    return left.id === right.id
  }
  if (left.type === 'github' && right.type === 'github') {
    return left.owner.toLowerCase() === right.owner.toLowerCase() &&
      left.repo.toLowerCase() === right.repo.toLowerCase() &&
      normalizeGithubPath(left.path) === normalizeGithubPath(right.path) &&
      normalizeGithubRef(left.ref) === normalizeGithubRef(right.ref)
  }
  return false
}

async function fetchGithubCommitSha(source: GithubSkillSourceMetadata): Promise<string> {
  const url = `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/commits/${encodeURIComponent(source.ref)}`
  const commit = await fetchGithubJson<GithubCommitResponse>(url)
  const sha = stringValue(commit.sha)
  if (!sha) throw new Error(`GitHub commit was not found for ${source.owner}/${source.repo}@${source.ref}.`)
  return sha
}

async function downloadGithubSkillDirectory(
  source: GithubSkillSourceMetadata,
  destination: string
): Promise<void> {
  const state = { files: 0, bytes: 0 }
  await downloadGithubDirectory(source, source.path, destination, state)
  if (!existsSync(join(destination, 'SKILL.md')) && !existsSync(join(destination, 'skill.json'))) {
    throw new Error('GitHub Skill directory must contain SKILL.md or skill.json.')
  }
}

async function downloadGithubDirectory(
  source: GithubSkillSourceMetadata,
  githubPath: string,
  destination: string,
  state: { files: number; bytes: number }
): Promise<void> {
  const entries = await fetchGithubJson<GithubContentEntry[] | GithubContentEntry>(
    githubContentsUrl(source, githubPath)
  )
  if (!Array.isArray(entries)) {
    throw new Error(`GitHub path is not a directory: ${githubPath || '/'}`)
  }
  await mkdir(destination, { recursive: true })
  for (const entry of entries) {
    const entryName = normalizeGithubEntryName(entry.name)
    const entryPath = normalizeGithubPath(stringValue(entry.path))
    if (entry.type === 'dir') {
      await downloadGithubDirectory(source, entryPath, join(destination, entryName), state)
      continue
    }
    if (entry.type !== 'file') continue
    const downloadUrl = stringValue(entry.download_url)
    if (!downloadUrl) throw new Error(`GitHub file cannot be downloaded: ${entryPath}`)
    state.files += 1
    if (state.files > MAX_GITHUB_SKILL_FILES) {
      throw new Error(`GitHub Skill has too many files; limit is ${MAX_GITHUB_SKILL_FILES}.`)
    }
    const size = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : 0
    state.bytes += Math.max(0, size)
    if (state.bytes > MAX_GITHUB_SKILL_BYTES) {
      throw new Error(`GitHub Skill is too large; limit is ${Math.round(MAX_GITHUB_SKILL_BYTES / 1024 / 1024)}MB.`)
    }
    const bytes = await fetchGithubBytes(downloadUrl)
    state.bytes += Math.max(0, bytes.length - size)
    if (state.bytes > MAX_GITHUB_SKILL_BYTES) {
      throw new Error(`GitHub Skill is too large; limit is ${Math.round(MAX_GITHUB_SKILL_BYTES / 1024 / 1024)}MB.`)
    }
    await writeFile(join(destination, entryName), bytes)
  }
}

function githubContentsUrl(source: GithubSkillSourceMetadata, githubPath: string): string {
  const path = normalizeGithubPath(githubPath)
  const encodedPath = path ? `/${encodeGithubPath(path)}` : ''
  return `https://api.github.com/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/contents${encodedPath}?ref=${encodeURIComponent(source.ref)}`
}

async function fetchGithubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: githubHeaders() })
  if (!response.ok) throw await githubResponseError(response)
  return await response.json() as T
}

async function fetchGithubBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: githubHeaders() })
  if (!response.ok) throw await githubResponseError(response)
  return Buffer.from(await response.arrayBuffer())
}

function githubHeaders(): Record<string, string> {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim()
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'WORKGPT',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function githubResponseError(response: Response): Promise<Error> {
  let detail = ''
  try {
    const body = await response.text()
    if (body) detail = ` ${body.slice(0, 300)}`
  } catch {
    /* ignore body read failures */
  }
  const privateHint = response.status === 401 || response.status === 403 || response.status === 404
    ? ' If this is a private repository, set GITHUB_TOKEN or GH_TOKEN before launching WORKGPT.'
    : ''
  return new Error(`GitHub request failed (${response.status} ${response.statusText}).${privateHint}${detail}`)
}

function normalizeGithubPath(path: string | undefined): string {
  return (path ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function normalizeGithubRef(ref: string | undefined): string {
  return ref?.trim() || DEFAULT_GITHUB_REF
}

function normalizeGithubEntryName(name: string | undefined): string {
  const value = name?.trim() ?? ''
  if (!value || value === '.' || value === '..' || /[\\/]/.test(value)) {
    throw new Error(`Unsafe GitHub entry name: ${name ?? ''}`)
  }
  return value
}

function encodeGithubPath(path: string): string {
  return normalizeGithubPath(path).split('/').map(encodeURIComponent).join('/')
}

function bundledSkillRootCandidates(): string[] {
  const resourcesPath = stringValue((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath)
  return uniqueStrings([
    resourcesPath ? join(resourcesPath, 'app.asar.unpacked', 'src', 'asset', 'skills') : '',
    resourcesPath ? join(resourcesPath, 'src', 'asset', 'skills') : '',
    resolve(process.cwd(), 'src', 'asset', 'skills')
  ])
}

function resolveBundledSkillDirectory(bundleId: string): string | null {
  for (const root of bundledSkillRootCandidates()) {
    const candidate = join(root, bundleId)
    if (existsSync(join(candidate, 'SKILL.md')) || existsSync(join(candidate, 'skill.json'))) {
      return candidate
    }
  }
  return null
}

function readFrontmatter(content: string): { id?: string; name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return { description: firstMarkdownParagraph(content) }
  const yaml = match[1] ?? ''
  return {
    id: frontmatterString(yaml, 'id'),
    name: frontmatterString(yaml, 'name'),
    description: frontmatterString(yaml, 'description') || firstMarkdownParagraph(content.slice(match[0].length))
  }
}

function frontmatterString(yaml: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm').exec(yaml)
  return match ? stripQuotes(match[1] ?? '').trim() || undefined : undefined
}

function firstMarkdownParagraph(markdown: string): string | undefined {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.replace(/^#+\s*/, '').trim())
    .find(Boolean)
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function titleFromSlug(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function displaySkillName(frontmatterName: string | undefined, folderName: string): string {
  const value = frontmatterName?.trim() ?? ''
  if (!value) return titleFromSlug(folderName)
  return /^[a-z0-9][a-z0-9_-]*$/i.test(value) ? titleFromSlug(value) : value
}

function slug(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'skill'
}

function dedupeSkills(skills: GuiSkillSummary[]): GuiSkillSummary[] {
  const unique = new Map<string, GuiSkillSummary>()
  for (const skill of skills.sort(compareSkillSummary)) {
    if (!unique.has(skill.id)) unique.set(skill.id, skill)
  }
  return [...unique.values()]
}

function compareSkillSummary(a: GuiSkillSummary, b: GuiSkillSummary): number {
  if (a.scope !== b.scope) return a.scope === 'project' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function scopeForConfiguredRoot(path: string, workspaceRoots: string[]): GuiSkillScope {
  const comparable = comparablePath(path)
  return workspaceRoots.some((workspaceRoot) => {
    const workspace = comparablePath(workspaceRoot)
    return comparable === workspace || comparable.startsWith(`${workspace}/`)
  }) ? 'project' : 'global'
}

function uniqueSkillRoots(roots: GuiSkillRoot[]): GuiSkillRoot[] {
  const seen = new Set<string>()
  const out: GuiSkillRoot[] = []
  for (const root of roots) {
    const key = comparablePath(root.path)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(root)
  }
  return out
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
