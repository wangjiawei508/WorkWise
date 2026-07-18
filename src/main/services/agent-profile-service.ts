import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'
import type {
  AgentProfileDiagnosticV1,
  AgentProfileSnapshotV1,
  AgentProfileV1,
  WorkspaceTrustLevel
} from '../../shared/agent-workbench'
import { atomicWriteFile } from './durable-file'
import { resolveContainedPath } from './canonical-containment'

const MAX_PROFILE_BYTES = 256 * 1024
const PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/
const TRUST_LEVELS = new Set<WorkspaceTrustLevel>([
  'read-only',
  'workspace-write',
  'trusted',
  'full-access'
])

const BUILT_IN_PROFILES: AgentProfileV1[] = [
  {
    id: 'general',
    name: 'General',
    role: '通用执行',
    color: '#1688ff',
    systemPrompt: '可靠地完成用户目标。持续推进，验证结果，并交付可操作的最终成果。',
    toolAllowlist: ['*'],
    mcpAllowlist: ['*'],
    trustLevel: 'workspace-write',
    budget: { maxAttempts: 8, maxDurationMs: 30 * 60 * 1000 },
    builtIn: true,
    source: 'built-in',
    revision: 1
  },
  {
    id: 'explore',
    name: 'Explore',
    role: '只读探索',
    color: '#14b8a6',
    systemPrompt: '只读调查工作区，建立事实和证据，不修改文件或外部状态。',
    toolAllowlist: ['read', 'grep', 'find', 'ls', 'web_search', 'web_fetch'],
    mcpAllowlist: [],
    trustLevel: 'read-only',
    budget: { maxAttempts: 5, maxDurationMs: 20 * 60 * 1000 },
    builtIn: true,
    source: 'built-in',
    revision: 1
  },
  {
    id: 'review',
    name: 'Review',
    role: '审查',
    color: '#f59e0b',
    systemPrompt: '审查代码和成果，优先发现缺陷、回归、风险和缺失验证。不要直接修改。',
    toolAllowlist: ['read', 'grep', 'find', 'ls', 'git_status', 'git_diff'],
    mcpAllowlist: [],
    trustLevel: 'read-only',
    budget: { maxAttempts: 5, maxDurationMs: 20 * 60 * 1000 },
    builtIn: true,
    source: 'built-in',
    revision: 1
  },
  {
    id: 'research',
    name: 'Research',
    role: '调研',
    color: '#8b5cf6',
    systemPrompt: '通过网页、知识库和授权 MCP 调研，区分事实与推断，并保留来源。',
    toolAllowlist: ['read', 'grep', 'find', 'ls', 'web_search', 'web_fetch'],
    mcpAllowlist: ['*'],
    trustLevel: 'read-only',
    budget: { maxAttempts: 6, maxDurationMs: 30 * 60 * 1000 },
    builtIn: true,
    source: 'built-in',
    revision: 1
  }
]

type ProfileScope = 'global' | 'workspace'

export type SaveAgentProfileRequest = {
  scope: ProfileScope
  workspaceRoot?: string
  profile: Omit<AgentProfileV1, 'builtIn' | 'source' | 'path' | 'revision'> & { revision?: number }
  expectedRevision?: number
  idempotencyKey?: string
}

function mutationKeyFromProfile(content: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) return undefined
  try {
    const raw = parse(match[1] ?? '') as Record<string, unknown> | null
    return typeof raw?.mutationKey === 'string' && raw.mutationKey.trim()
      ? raw.mutationKey.trim()
      : undefined
  } catch {
    return undefined
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))]
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function parseProfile(
  content: string,
  path: string,
  source: Exclude<AgentProfileV1['source'], 'built-in'>
): AgentProfileV1 {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!match) throw Object.assign(new Error('Agent profile requires YAML frontmatter.'), { code: 'invalid_frontmatter' })
  let raw: Record<string, unknown>
  try {
    const parsed = parse(match[1] ?? '')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Frontmatter must be an object.')
    raw = parsed as Record<string, unknown>
  } catch (error) {
    throw Object.assign(new Error(`Invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`), {
      code: 'invalid_frontmatter'
    })
  }
  const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : ''
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const role = typeof raw.role === 'string' ? raw.role.trim() : ''
  const color = typeof raw.color === 'string' ? raw.color.trim() : '#1688ff'
  const trustLevel = typeof raw.trustLevel === 'string' && TRUST_LEVELS.has(raw.trustLevel as WorkspaceTrustLevel)
    ? raw.trustLevel as WorkspaceTrustLevel
    : null
  const body = content.slice(match[0].length).trim()
  if (!PROFILE_ID.test(id) || !name || !role || !trustLevel || !body) {
    throw Object.assign(new Error('Agent profile requires a safe id, name, role, trustLevel, and prompt body.'), {
      code: 'invalid_profile'
    })
  }
  const budget = raw.budget && typeof raw.budget === 'object' && !Array.isArray(raw.budget)
    ? raw.budget as Record<string, unknown>
    : {}
  const maxCostUsd = typeof budget.maxCostUsd === 'number' && budget.maxCostUsd > 0
    ? budget.maxCostUsd
    : undefined
  return {
    id,
    name,
    role,
    color,
    systemPrompt: body,
    ...(typeof raw.model === 'string' && raw.model.trim() ? { model: raw.model.trim() } : {}),
    toolAllowlist: stringArray(raw.tools),
    mcpAllowlist: stringArray(raw.mcp),
    trustLevel,
    budget: {
      maxAttempts: positiveInt(budget.maxAttempts, 8),
      maxDurationMs: positiveInt(budget.maxDurationMs, 30 * 60 * 1000),
      ...(maxCostUsd ? { maxCostUsd } : {})
    },
    builtIn: false,
    source,
    path,
    revision: positiveInt(raw.revision, 1)
  }
}

function diagnostic(path: string, error: unknown): AgentProfileDiagnosticV1 {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'invalid_profile'
  return {
    path,
    code: code === 'invalid_frontmatter' || code === 'unsafe_path' ? code : 'invalid_profile',
    message: error instanceof Error ? error.message : String(error)
  }
}

export class AgentProfileService {
  private generation = 0
  private readonly globalRoot: string

  constructor(globalRoot = join(homedir(), '.workwise', 'agents')) {
    this.globalRoot = resolve(globalRoot)
  }

  async list(workspaceRoot?: string): Promise<AgentProfileSnapshotV1> {
    const diagnostics: AgentProfileDiagnosticV1[] = []
    const globalProfiles = await this.readDirectory(this.globalRoot, 'global', diagnostics)
    const workspaceProfiles = workspaceRoot?.trim()
      ? await this.readWorkspaceDirectory(workspaceRoot, diagnostics)
      : []
    const profiles = new Map(BUILT_IN_PROFILES.map((profile) => [profile.id, { ...profile }]))
    for (const profile of globalProfiles) profiles.set(profile.id, profile)
    for (const profile of workspaceProfiles) profiles.set(profile.id, profile)
    this.generation += 1
    return { generation: this.generation, profiles: [...profiles.values()], diagnostics }
  }

  async save(request: SaveAgentProfileRequest): Promise<AgentProfileV1> {
    const id = request.profile.id.trim().toLowerCase()
    if (!PROFILE_ID.test(id) || BUILT_IN_PROFILES.some((profile) => profile.id === id)) {
      throw new Error('Built-in Agent profiles are read-only; clone with a new safe id.')
    }
    const root = request.scope === 'workspace'
      ? await this.workspaceDirectory(request.workspaceRoot)
      : this.globalRoot
    await mkdir(root, { recursive: true })
    const target = await resolveContainedPath({ root, target: `${id}.md`, rejectFinalLink: true })
    let currentRevision = 0
    try {
      const contents = await readFile(target, 'utf8')
      const current = parseProfile(contents, target, request.scope)
      currentRevision = current.revision
      if (request.idempotencyKey && mutationKeyFromProfile(contents) === request.idempotencyKey) {
        return current
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
    if (request.expectedRevision !== undefined && request.expectedRevision !== currentRevision) {
      throw Object.assign(new Error('Agent profile revision conflict.'), { code: 'stale_request' })
    }
    const nextRevision = currentRevision + 1
    const frontmatter = stringify({
      id,
      name: request.profile.name,
      role: request.profile.role,
      color: request.profile.color,
      ...(request.profile.model ? { model: request.profile.model } : {}),
      tools: request.profile.toolAllowlist,
      mcp: request.profile.mcpAllowlist,
      trustLevel: request.profile.trustLevel,
      budget: request.profile.budget,
      revision: nextRevision,
      ...(request.idempotencyKey ? { mutationKey: request.idempotencyKey } : {})
    }).trim()
    await atomicWriteFile(target, `---\n${frontmatter}\n---\n\n${request.profile.systemPrompt.trim()}\n`)
    return parseProfile(await readFile(target, 'utf8'), target, request.scope)
  }

  private async workspaceDirectory(workspaceRoot?: string): Promise<string> {
    if (!workspaceRoot?.trim()) throw new Error('Workspace root is required.')
    const canonicalRoot = await realpath(workspaceRoot)
    return resolveContainedPath({ root: canonicalRoot, target: '.workwise/agents' })
  }

  private async readWorkspaceDirectory(
    workspaceRoot: string,
    diagnostics: AgentProfileDiagnosticV1[]
  ): Promise<AgentProfileV1[]> {
    try {
      return this.readDirectory(await this.workspaceDirectory(workspaceRoot), 'workspace', diagnostics)
    } catch (error) {
      diagnostics.push(diagnostic(join(workspaceRoot, '.workwise/agents'), error))
      return []
    }
  }

  private async readDirectory(
    root: string,
    source: Exclude<AgentProfileV1['source'], 'built-in'>,
    diagnostics: AgentProfileDiagnosticV1[]
  ): Promise<AgentProfileV1[]> {
    let names: string[]
    try {
      names = await readdir(root)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      diagnostics.push(diagnostic(root, error))
      return []
    }
    const profiles: AgentProfileV1[] = []
    const seen = new Set<string>()
    for (const name of names.sort()) {
      if (!name.toLowerCase().endsWith('.md')) continue
      const path = join(root, basename(name))
      try {
        const info = await lstat(path)
        if (!info.isFile() || info.isSymbolicLink()) {
          throw Object.assign(new Error('Agent profile must be a regular file, not a link.'), { code: 'unsafe_path' })
        }
        if (info.size > MAX_PROFILE_BYTES) throw new Error('Agent profile exceeds 256 KiB.')
        const profile = parseProfile(await readFile(path, 'utf8'), path, source)
        if (seen.has(profile.id)) {
          diagnostics.push({ path, code: 'duplicate_id', message: `Duplicate Agent id: ${profile.id}` })
          continue
        }
        seen.add(profile.id)
        profiles.push(profile)
      } catch (error) {
        diagnostics.push(diagnostic(path, error))
      }
    }
    return profiles
  }
}

export function builtInAgentProfiles(): AgentProfileV1[] {
  return BUILT_IN_PROFILES.map((profile) => ({ ...profile }))
}
