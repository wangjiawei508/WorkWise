import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X
} from 'lucide-react'
import {
  joinFsPath,
  loadPreferredSkillRootId,
  savePreferredSkillRootId,
  type SkillRootId
} from '../lib/skill-root-preference'
import { readBrowserStorageItem, writeBrowserStorageItem } from '../lib/browser-storage'
import { normalizeWorkspaceRoot } from '../lib/workspace-path'
import { getProvider } from '../agent/registry'
import type { SkillListItem } from '@shared/kun-gui-api'
import type {
  CoreRuntimeInfoJson,
  CoreRuntimeToolDiagnosticsJson
} from '../agent/kun-contract'
import { useChatStore } from '../store/chat-store'
import { NoticeView, TabButton, type MarketplaceNotice } from './PluginMarketplaceParts'
import {
  buildMcpMarketplaceOverlay,
  type McpMarketplaceOverlay,
  type McpMarketplaceOverlayStatus
} from './plugin-marketplace-runtime'

type PluginKind = 'mcp' | 'skill'
type PluginFilter = 'all' | 'recommended' | 'installed'
type NoticeTone = 'success' | 'error' | 'info'

type Notice = MarketplaceNotice

type MarketplaceItem = {
  id: string
  kind: PluginKind
  titleKey?: string
  descriptionKey?: string
  title?: string
  description?: string
  group: 'recommended' | 'personal'
  sourceLabelKey?: string
  sourceLabel?: string
  detailKey?: string
  detail?: string
  sourceUrl?: string
  statusTone?: 'default' | 'success' | 'warning' | 'error'
  systemManaged?: boolean
  mcpConfig?: (workspaceRoot: string) => JsonRecord
  skillInstructions?: string
  githubSkill?: GithubSkillSource
  bundledSkill?: BundledSkillSource
  bundledAgentPack?: BundledAgentPackSource
  bundledAgentPackSkillIds?: string[]
}

type JsonRecord = Record<string, unknown>

type SkillRootOption = {
  id: SkillRootId
  label: string
  path: string
  available: boolean
}

const INSTALLED_STORAGE_KEY = 'kun.installedPlugins'
const GUI_SCHEDULE_MCP_SERVER_ID = 'gui_schedule'

function loadInstalledPlugins(): string[] {
  try {
    const raw = readBrowserStorageItem(INSTALLED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function saveInstalledPlugins(ids: string[]): void {
  writeBrowserStorageItem(INSTALLED_STORAGE_KEY, JSON.stringify([...new Set(ids)]))
}

function storageKey(kind: PluginKind, id: string): string {
  return `${kind}:${id}`
}

function normalizePluginId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMcpJsonConfig(content: string): JsonRecord {
  const trimmed = content.trim()
  if (!trimmed) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`MCP config must be JSON: ${message}`)
  }
  if (!isJsonRecord(parsed)) {
    throw new Error('MCP config must be a JSON object.')
  }
  return parsed
}

function buildStdioMcpServer(
  command: string,
  args: string[],
  options: {
    trustScope?: 'workspace' | 'user'
    trustedWorkspaceRoots?: string[]
    env?: JsonRecord
  } = {}
): JsonRecord {
  const trustScope = options.trustScope ?? 'user'
  return {
    enabled: true,
    transport: 'stdio',
    command,
    args,
    env: options.env ?? {},
    trustScope,
    ...(trustScope === 'workspace'
      ? {
          trustedWorkspaceRoots: options.trustedWorkspaceRoots?.length
            ? options.trustedWorkspaceRoots
            : ['/path/to/workspace']
        }
      : {}),
    timeoutMs: 30_000
  }
}

export function buildMcpConfig(
  id: string,
  command: string,
  args: string[],
  options?: Parameters<typeof buildStdioMcpServer>[2]
): JsonRecord {
  return {
    servers: {
      [id]: buildStdioMcpServer(command, args, options)
    }
  }
}

function mcpServersFromConfig(config: JsonRecord): JsonRecord {
  if (isJsonRecord(config.servers)) return config.servers
  const capabilities = isJsonRecord(config.capabilities) ? config.capabilities : undefined
  const mcp = isJsonRecord(capabilities?.mcp) ? capabilities.mcp : undefined
  return isJsonRecord(mcp?.servers) ? mcp.servers : {}
}

function mcpServerDescription(server: JsonRecord | undefined, fallback: string): string {
  if (!server) return fallback
  const transport = typeof server.transport === 'string' ? server.transport : ''
  const command = typeof server.command === 'string' ? server.command : ''
  const url = typeof server.url === 'string' ? server.url : ''
  const status = typeof server.status === 'string' ? server.status : ''
  const lastError = typeof server.lastError === 'string' ? server.lastError : ''
  const toolCount = typeof server.toolCount === 'number' && Number.isFinite(server.toolCount)
    ? server.toolCount
    : undefined
  const parts = [
    status ? `status: ${status}` : '',
    transport,
    command || url,
    toolCount != null ? `${toolCount} tools` : '',
    lastError ? `error: ${lastError}` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : fallback
}

function mcpServerStatus(diagnostic: JsonRecord | undefined, config: JsonRecord | undefined): string {
  const diagnosticStatus = typeof diagnostic?.status === 'string' ? diagnostic.status : ''
  if (diagnosticStatus) return diagnosticStatus
  if (config?.enabled === false || config?.disabled === true) return 'disabled'
  return ''
}

function mcpStatusTone(status: string): MarketplaceItem['statusTone'] {
  if (status === 'connected' || status === 'available') return 'success'
  if (status === 'error' || status === 'unavailable') return 'error'
  if (status === 'disabled') return 'warning'
  return 'default'
}

export function mcpConfigHasServer(content: string, id: string): boolean {
  try {
    return Object.prototype.hasOwnProperty.call(mcpServersFromConfig(parseMcpJsonConfig(content)), id)
  } catch {
    return false
  }
}

export function customMcpConfigFragment(id: string, raw: string, fallback: JsonRecord): JsonRecord {
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  const parsed = parseMcpJsonConfig(trimmed)
  if (isJsonRecord(parsed.servers)) return parsed
  if (isJsonRecord(parsed.capabilities)) {
    const mcp = isJsonRecord(parsed.capabilities.mcp) ? parsed.capabilities.mcp : undefined
    if (isJsonRecord(mcp?.servers)) return { servers: mcp.servers }
  }
  if (parsed.command !== undefined || parsed.url !== undefined || parsed.transport !== undefined) {
    return { servers: { [id]: parsed } }
  }
  throw new Error('MCP JSON config must include a servers object or a single server object.')
}

export function mergeMcpJsonConfig(content: string, fragment: JsonRecord): { alreadyExists: boolean; text: string } {
  const current = parseMcpJsonConfig(content)
  const currentServers = mcpServersFromConfig(current)
  const fragmentServers = mcpServersFromConfig(fragment)
  const fragmentServerIds = Object.keys(fragmentServers)
  if (fragmentServerIds.length === 0) {
    throw new Error('MCP JSON config must include at least one server.')
  }
  const alreadyExists = fragmentServerIds.some((id) =>
    Object.prototype.hasOwnProperty.call(currentServers, id)
  )
  if (alreadyExists) {
    return { alreadyExists: true, text: `${JSON.stringify(current, null, 2)}\n` }
  }

  const fragmentRest = { ...fragment }
  delete fragmentRest.servers
  const next = {
    ...current,
    ...fragmentRest,
    servers: {
      ...currentServers,
      ...fragmentServers
    }
  }
  return { alreadyExists: false, text: `${JSON.stringify(next, null, 2)}\n` }
}

function buildSkillContent(id: string, title: string, description: string, instructions: string): string {
  return [
    '---',
    `name: ${id}`,
    `description: ${description}`,
    '---',
    '',
    `# ${title}`,
    '',
    instructions
  ].join('\n')
}

function itemTitle(item: MarketplaceItem, t: (key: string) => string): string {
  return item.title ?? (item.titleKey ? t(item.titleKey) : item.id)
}

function itemDescription(item: MarketplaceItem, t: (key: string) => string): string {
  return item.description ?? (item.descriptionKey ? t(item.descriptionKey) : '')
}

function itemDetail(item: MarketplaceItem, t: (key: string) => string): string {
  return item.detail ?? (item.detailKey ? t(item.detailKey) : itemDescription(item, t))
}

function itemSourceLabel(item: MarketplaceItem, t: (key: string) => string): string {
  return item.sourceLabel ?? (item.sourceLabelKey ? t(item.sourceLabelKey) : '')
}

function itemSourceUrl(item: MarketplaceItem): string {
  if (item.sourceUrl) return item.sourceUrl
  if (item.githubSkill) return githubSkillUrl(item.githubSkill)
  return ''
}

function githubSkillUrl(source: GithubSkillSource): string {
  const ref = source.ref?.trim() || 'main'
  const path = normalizeGithubSourcePath(source.path)
  const base = `https://github.com/${source.owner.trim()}/${source.repo.trim()}`
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return path ? `${base}/tree/${encodeURIComponent(ref)}/${encodedPath}` : base
}

function normalizeGithubSourcePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function githubSkillSourceKey(source: GithubSkillSource): string {
  return [
    'github',
    source.owner.trim().toLowerCase(),
    source.repo.trim().toLowerCase(),
    normalizeGithubSourcePath(source.path),
    source.ref?.trim() || 'main'
  ].join(':')
}

function bundledSkillSourceKey(source: BundledSkillSource): string {
  return `bundled:${source.id.trim()}`
}

function bundledAgentPackSourceKey(source: BundledAgentPackSource): string {
  return `bundled-agent-pack:${source.id.trim()}`
}

function discoveredSkillSourceKey(skill: SkillListItem): string {
  if (skill.source?.type === 'github') return githubSkillSourceKey(skill.source)
  if (skill.source?.type === 'bundled') return bundledSkillSourceKey(skill.source)
  return ''
}

export function skillMarketplaceItemsFromDiscoveredSkills(
  skills: SkillListItem[],
  labels: { project: string; global: string; github: string; bundled: string }
): MarketplaceItem[] {
  return skills.map((skill) => ({
    id: skill.id,
    kind: 'skill' as const,
    title: skill.name,
    description: skill.description ?? skill.root,
    group: 'personal' as const,
    sourceLabel:
      skill.source?.type === 'github' ? labels.github :
      skill.source?.type === 'bundled' ? labels.bundled :
      skill.scope === 'project' ? labels.project : labels.global,
    ...(skill.source?.type === 'github' ? { sourceUrl: githubSkillUrl(skill.source) } : {}),
    statusTone: skill.source ? 'success' as const : 'default' as const
  }))
}

export function mcpMarketplaceItemsFromConfigAndDiagnostics(
  configText: string,
  diagnostics: CoreRuntimeToolDiagnosticsJson | null,
  labels: {
    configured: string
    connected: string
    error: string
    disabled: string
  }
): MarketplaceItem[] {
  const servers = new Map<string, {
    id: string
    config?: JsonRecord
    diagnostic?: JsonRecord
  }>()
  try {
    const configServers = mcpServersFromConfig(parseMcpJsonConfig(configText))
    for (const [id, value] of Object.entries(configServers)) {
      if (!id.trim()) continue
      servers.set(id, {
        id,
        config: isJsonRecord(value) ? value : {}
      })
    }
  } catch {
    /* Invalid config is surfaced elsewhere; keep the marketplace render resilient. */
  }
  for (const diagnostic of diagnostics?.mcpServers ?? []) {
    const id = typeof diagnostic.id === 'string' ? diagnostic.id.trim() : ''
    if (!id) continue
    const existing = servers.get(id)
    servers.set(id, {
      id,
      config: existing?.config,
      diagnostic
    })
  }
  return [...servers.values()].map(({ id, config, diagnostic }) => {
    const status = mcpServerStatus(diagnostic, config)
    const details = { ...(config ?? {}), ...(diagnostic ?? {}) }
    const sourceLabel =
      status === 'connected' || status === 'available' ? labels.connected :
      status === 'error' || status === 'unavailable' ? labels.error :
      status === 'disabled' ? labels.disabled :
      labels.configured
    return {
      id,
      kind: 'mcp' as const,
      title: id,
      description: mcpServerDescription(details, labels.configured),
      group: 'personal' as const,
      sourceLabel,
      statusTone: mcpStatusTone(status)
    }
  }).sort((left, right) => left.title.localeCompare(right.title))
}

function skillNameLooksValid(raw: string): boolean {
  const value = raw.trim()
  return !!value && value !== '.' && value !== '..' && !/[\\/]/.test(value)
}

const RECOMMENDED_ITEMS: MarketplaceItem[] = [
  {
    id: GUI_SCHEDULE_MCP_SERVER_ID,
    kind: 'mcp',
    titleKey: 'pluginMcpGuiScheduleTitle',
    descriptionKey: 'pluginMcpGuiScheduleDesc',
    detailKey: 'pluginMcpGuiScheduleDetail',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    systemManaged: true
  },
  {
    id: 'filesystem',
    kind: 'mcp',
    titleKey: 'pluginMcpFilesystemTitle',
    descriptionKey: 'pluginMcpFilesystemDesc',
    detailKey: 'pluginMcpFilesystemDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    group: 'recommended',
    mcpConfig: (workspaceRoot) =>
      buildMcpConfig(
        'filesystem',
        'npx',
        ['-y', '@modelcontextprotocol/server-filesystem', workspaceRoot || '/path/to/project'],
        {
          trustScope: 'workspace',
          trustedWorkspaceRoots: [workspaceRoot || '/path/to/project']
        }
      )
  },
  {
    id: 'playwright',
    kind: 'mcp',
    titleKey: 'pluginMcpPlaywrightTitle',
    descriptionKey: 'pluginMcpPlaywrightDesc',
    detailKey: 'pluginMcpPlaywrightDetail',
    sourceUrl: 'https://github.com/microsoft/playwright-mcp',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'playwright',
        'npx',
        ['-y', '@playwright/mcp@latest']
      )
  },
  {
    id: 'github',
    kind: 'mcp',
    titleKey: 'pluginMcpGithubTitle',
    descriptionKey: 'pluginMcpGithubDesc',
    detailKey: 'pluginMcpGithubDetail',
    sourceUrl: 'https://github.com/github/github-mcp-server',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'github',
        'npx',
        ['-y', '@modelcontextprotocol/server-github'],
        {
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}'
          }
        }
      )
  },
  {
    id: 'context7',
    kind: 'mcp',
    titleKey: 'pluginMcpContext7Title',
    descriptionKey: 'pluginMcpContext7Desc',
    detailKey: 'pluginMcpContext7Detail',
    sourceUrl: 'https://github.com/upstash/context7',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'context7',
        'npx',
        ['-y', '@upstash/context7-mcp@latest']
      )
  },
  {
    id: 'memory',
    kind: 'mcp',
    titleKey: 'pluginMcpMemoryTitle',
    descriptionKey: 'pluginMcpMemoryDesc',
    detailKey: 'pluginMcpMemoryDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'memory',
        'npx',
        ['-y', '@modelcontextprotocol/server-memory']
      )
  },
  {
    id: 'sequential-thinking',
    kind: 'mcp',
    titleKey: 'pluginMcpSequentialThinkingTitle',
    descriptionKey: 'pluginMcpSequentialThinkingDesc',
    detailKey: 'pluginMcpSequentialThinkingDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'sequential-thinking',
        'npx',
        ['-y', '@modelcontextprotocol/server-sequential-thinking']
      )
  },
  {
    id: 'brave-search',
    kind: 'mcp',
    titleKey: 'pluginMcpBraveSearchTitle',
    descriptionKey: 'pluginMcpBraveSearchDesc',
    detailKey: 'pluginMcpBraveSearchDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'brave-search',
        'npx',
        ['-y', '@modelcontextprotocol/server-brave-search'],
        {
          env: {
            BRAVE_API_KEY: '${BRAVE_API_KEY}'
          }
        }
      )
  },
  {
    id: 'postgres',
    kind: 'mcp',
    titleKey: 'pluginMcpPostgresTitle',
    descriptionKey: 'pluginMcpPostgresDesc',
    detailKey: 'pluginMcpPostgresDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'postgres',
        'npx',
        ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://user:password@localhost:5432/db']
      )
  },
  {
    id: 'puppeteer',
    kind: 'mcp',
    titleKey: 'pluginMcpPuppeteerTitle',
    descriptionKey: 'pluginMcpPuppeteerDesc',
    detailKey: 'pluginMcpPuppeteerDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'puppeteer',
        'npx',
        ['-y', '@modelcontextprotocol/server-puppeteer']
      )
  },
  {
    id: 'slack',
    kind: 'mcp',
    titleKey: 'pluginMcpSlackTitle',
    descriptionKey: 'pluginMcpSlackDesc',
    detailKey: 'pluginMcpSlackDetail',
    sourceUrl: 'https://github.com/modelcontextprotocol/servers',
    group: 'recommended',
    mcpConfig: () =>
      buildMcpConfig(
        'slack',
        'npx',
        ['-y', '@modelcontextprotocol/server-slack'],
        {
          env: {
            SLACK_BOT_TOKEN: '${SLACK_BOT_TOKEN}',
            SLACK_TEAM_ID: '${SLACK_TEAM_ID}'
          }
        }
      )
  },
  {
    id: 'metro-monitoring-agent-pack',
    kind: 'skill',
    titleKey: 'pluginSkillMetroMonitoringPackTitle',
    descriptionKey: 'pluginSkillMetroMonitoringPackDesc',
    detailKey: 'pluginSkillMetroMonitoringPackDetail',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundled',
    statusTone: 'success',
    bundledAgentPack: {
      id: 'metro-monitoring-agent-pack'
    },
    bundledAgentPackSkillIds: [
      'adjustment-report',
      'approval-flow-intelligence',
      'bidding-knowledge',
      'bun-file-io',
      'business-finance',
      'business-operations-analytics',
      'cad-bim-review',
      'canvas-design',
      'construction-monitoring',
      'customer-portal-brief',
      'data-analysis',
      'di-bao-monitoring',
      'docx-generation',
      'excel-operations',
      'frontend-design',
      'humanizer',
      'monitoring-design',
      'operational-monitoring',
      'ops-monitoring',
      'railwise-knowledge-curation',
      'report-dibao',
      'report-writing',
      'resource-dispatch-intelligence',
      'standard-reference',
      'weekly-work-intelligence'
    ]
  },
  {
    id: 'di-bao-monitoring',
    kind: 'skill',
    titleKey: 'pluginSkillDibaoMonitoringTitle',
    descriptionKey: 'pluginSkillDibaoMonitoringDesc',
    detailKey: 'pluginSkillDibaoMonitoringDetail',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundled',
    statusTone: 'success',
    bundledSkill: {
      id: 'di-bao-monitoring',
      skillName: 'di-bao-monitoring'
    }
  },
  {
    id: 'operational-monitoring',
    kind: 'skill',
    titleKey: 'pluginSkillOperationalMonitoringTitle',
    descriptionKey: 'pluginSkillOperationalMonitoringDesc',
    detailKey: 'pluginSkillOperationalMonitoringDetail',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundled',
    statusTone: 'success',
    bundledSkill: {
      id: 'operational-monitoring',
      skillName: 'operational-monitoring'
    }
  },
  {
    id: 'writing-humanizer',
    kind: 'skill',
    titleKey: 'pluginSkillWritingHumanizerTitle',
    descriptionKey: 'pluginSkillWritingHumanizerDesc',
    detailKey: 'pluginSkillWritingHumanizerDetail',
    sourceUrl: 'https://github.com/blader/humanizer',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'humanizer',
      skillName: 'writing-humanizer'
    }
  },
  {
    id: 'humanizer-zh',
    kind: 'skill',
    titleKey: 'pluginSkillWritingHumanizerZhTitle',
    descriptionKey: 'pluginSkillWritingHumanizerZhDesc',
    detailKey: 'pluginSkillWritingHumanizerZhDetail',
    sourceUrl: 'https://github.com/op7418/Humanizer-zh',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'humanizer-zh',
      skillName: 'humanizer-zh'
    }
  },
  {
    id: 'stop-slop',
    kind: 'skill',
    titleKey: 'pluginSkillWritingStopSlopTitle',
    descriptionKey: 'pluginSkillWritingStopSlopDesc',
    detailKey: 'pluginSkillWritingStopSlopDetail',
    sourceUrl: 'https://github.com/hardikpandya/stop-slop',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'stop-slop',
      skillName: 'stop-slop'
    }
  },
  {
    id: 'taste-skill',
    kind: 'skill',
    titleKey: 'pluginSkillWritingTasteTitle',
    descriptionKey: 'pluginSkillWritingTasteDesc',
    detailKey: 'pluginSkillWritingTasteDetail',
    sourceUrl: 'https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'taste-skill',
      skillName: 'taste-skill'
    }
  },
  {
    id: 'ai-flavor-remover',
    kind: 'skill',
    titleKey: 'pluginSkillWritingAiFlavorTitle',
    descriptionKey: 'pluginSkillWritingAiFlavorDesc',
    detailKey: 'pluginSkillWritingAiFlavorDetail',
    sourceUrl: 'https://github.com/hylarucoder/ai-flavor-remover',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'ai-flavor-remover',
      skillName: 'ai-flavor-remover'
    }
  },
  {
    id: 'shuorenhua',
    kind: 'skill',
    titleKey: 'pluginSkillWritingShuorenhuaTitle',
    descriptionKey: 'pluginSkillWritingShuorenhuaDesc',
    detailKey: 'pluginSkillWritingShuorenhuaDetail',
    sourceUrl: 'https://github.com/MrGeDiao/shuorenhua',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'shuorenhua',
      skillName: 'shuorenhua'
    }
  },
  {
    id: 'nuwa-skill',
    kind: 'skill',
    titleKey: 'pluginSkillWritingNuwaTitle',
    descriptionKey: 'pluginSkillWritingNuwaDesc',
    detailKey: 'pluginSkillWritingNuwaDetail',
    sourceUrl: 'https://github.com/alchaincyf/nuwa-skill',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'nuwa-skill',
      skillName: 'nuwa-skill'
    }
  },
  {
    id: 'writing-agent',
    kind: 'skill',
    titleKey: 'pluginSkillWritingAgentTitle',
    descriptionKey: 'pluginSkillWritingAgentDesc',
    detailKey: 'pluginSkillWritingAgentDetail',
    sourceUrl: 'https://github.com/dongbeixiaohuo/writing-agent',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'writing-agent',
      skillName: 'writing-agent'
    }
  },
  {
    id: 'chatgpt-comparison-detection',
    kind: 'skill',
    titleKey: 'pluginSkillWritingDetectionTitle',
    descriptionKey: 'pluginSkillWritingDetectionDesc',
    detailKey: 'pluginSkillWritingDetectionDetail',
    sourceUrl: 'https://github.com/Hello-SimpleAI/chatgpt-comparison-detection',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'chatgpt-comparison-detection',
      skillName: 'chatgpt-comparison-detection'
    }
  },
  {
    id: 'de-ai-prompt-enhancer',
    kind: 'skill',
    titleKey: 'pluginSkillWritingDeAiTitle',
    descriptionKey: 'pluginSkillWritingDeAiDesc',
    detailKey: 'pluginSkillWritingDeAiDetail',
    sourceUrl: 'https://github.com/OUBIGFA/De-AI-Prompt-Enhancer-Writer-Booster-SKILL/tree/main/de-AI-writing',
    group: 'recommended',
    sourceLabelKey: 'pluginSkillSourceBundledGitHub',
    statusTone: 'success',
    bundledSkill: {
      id: 'de-ai-prompt-enhancer',
      skillName: 'de-ai-prompt-enhancer'
    }
  },
  {
    id: 'code-review',
    kind: 'skill',
    titleKey: 'pluginSkillReviewTitle',
    descriptionKey: 'pluginSkillReviewDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when reviewing a code change. Prioritize correctness, regressions, security, performance, and missing tests. Lead with concrete findings and file references.'
  },
  {
    id: 'frontend-polish',
    kind: 'skill',
    titleKey: 'pluginSkillFrontendTitle',
    descriptionKey: 'pluginSkillFrontendDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when improving UI. Preserve the product style, check responsive states, avoid generic layouts, and verify the result visually before handing it back.'
  },
  {
    id: 'bug-hunt',
    kind: 'skill',
    titleKey: 'pluginSkillBugTitle',
    descriptionKey: 'pluginSkillBugDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when investigating bugs. Reproduce or narrow the symptom, trace the data flow, identify the smallest fix, and add focused verification where possible.'
  },
  {
    id: 'release-notes',
    kind: 'skill',
    titleKey: 'pluginSkillReleaseTitle',
    descriptionKey: 'pluginSkillReleaseDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when preparing release notes. Group user-facing changes by outcome, call out migrations or risks, and keep wording concise and scannable.'
  },
  {
    id: 'doc-brief',
    kind: 'skill',
    titleKey: 'pluginSkillDocBriefTitle',
    descriptionKey: 'pluginSkillDocBriefDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when turning rough notes, files, or meeting context into a structured document brief. Clarify audience, purpose, source material, constraints, outline, and acceptance criteria before drafting.'
  },
  {
    id: 'test-plan',
    kind: 'skill',
    titleKey: 'pluginSkillTestPlanTitle',
    descriptionKey: 'pluginSkillTestPlanDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when planning verification. Cover happy paths, edge cases, regression risks, fixtures, automation targets, manual checks, and release blockers.'
  },
  {
    id: 'sql-analysis',
    kind: 'skill',
    titleKey: 'pluginSkillSqlAnalysisTitle',
    descriptionKey: 'pluginSkillSqlAnalysisDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when inspecting relational data or writing SQL. Identify tables, joins, filters, aggregation grain, null handling, indexes, and validation queries before presenting conclusions.'
  },
  {
    id: 'meeting-notes',
    kind: 'skill',
    titleKey: 'pluginSkillMeetingNotesTitle',
    descriptionKey: 'pluginSkillMeetingNotesDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when cleaning up meeting notes. Extract decisions, owners, dates, blockers, open questions, and follow-ups, then keep the final note concise and action-oriented.'
  },
  {
    id: 'incident-response',
    kind: 'skill',
    titleKey: 'pluginSkillIncidentResponseTitle',
    descriptionKey: 'pluginSkillIncidentResponseDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill during incidents. Stabilize first, preserve facts, build a timeline, separate confirmed signals from guesses, propose rollback or mitigation, and capture postmortem actions.'
  },
  {
    id: 'data-cleaning',
    kind: 'skill',
    titleKey: 'pluginSkillDataCleaningTitle',
    descriptionKey: 'pluginSkillDataCleaningDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when cleaning spreadsheet, CSV, or database exports. Profile missing values, duplicates, units, encodings, date formats, outliers, and reconciliation totals before transforming data.'
  },
  {
    id: 'product-requirements',
    kind: 'skill',
    titleKey: 'pluginSkillProductRequirementsTitle',
    descriptionKey: 'pluginSkillProductRequirementsDesc',
    sourceUrl: 'https://github.com/wangjiawei508/WorkWise',
    group: 'recommended',
    skillInstructions:
      'Use this skill when shaping product requirements. Define users, jobs-to-be-done, non-goals, workflows, edge cases, metrics, rollout, and acceptance criteria in implementation-ready language.'
  }
]

export function PluginMarketplaceView(): ReactElement {
  const { t } = useTranslation('common')
  const workspaceRoot = normalizeWorkspaceRoot(useChatStore((s) => s.workspaceRoot))
  const [activeKind, setActiveKind] = useState<PluginKind>('mcp')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PluginFilter>('all')
  const [installed, setInstalled] = useState<string[]>(() => loadInstalledPlugins())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [detailItem, setDetailItem] = useState<MarketplaceItem | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [customCommand, setCustomCommand] = useState('')
  const [customArgs, setCustomArgs] = useState('')
  const [customConfig, setCustomConfig] = useState('')
  const [customSkillBody, setCustomSkillBody] = useState('')
  const [skillRootId, setSkillRootId] = useState<SkillRootId>(() => loadPreferredSkillRootId())
  const [mcpConfigText, setMcpConfigText] = useState('')
  const [mcpLoaded, setMcpLoaded] = useState(false)
  const [runtimeInfo, setRuntimeInfo] = useState<CoreRuntimeInfoJson | null>(null)
  const [toolDiagnostics, setToolDiagnostics] = useState<CoreRuntimeToolDiagnosticsJson | null>(null)
  const [runtimeOverlayLoading, setRuntimeOverlayLoading] = useState(false)
  const [runtimeOverlayError, setRuntimeOverlayError] = useState('')
  const [discoveredSkills, setDiscoveredSkills] = useState<SkillListItem[]>([])
  const [skillListLoading, setSkillListLoading] = useState(false)
  const [skillListError, setSkillListError] = useState('')

  const skillRootOptions = useMemo<SkillRootOption[]>(() => {
    const hasWorkspace = !!workspaceRoot
    return [
      {
        id: 'workspace-agents',
        label: t('pluginSkillRootWorkspaceAgents'),
        path: workspaceRoot ? joinFsPath(workspaceRoot, '.agents/skills') : '',
        available: hasWorkspace
      },
      {
        id: 'workspace-skills',
        label: t('pluginSkillRootWorkspaceSkills'),
        path: workspaceRoot ? joinFsPath(workspaceRoot, 'skills') : '',
        available: hasWorkspace
      },
      {
        id: 'global-codex',
        label: t('pluginSkillRootGlobalCodex'),
        path: '~/.codex/skills',
        available: true
      },
      {
        id: 'global-agents',
        label: t('pluginSkillRootGlobalAgents'),
        path: '~/.agents/skills',
        available: true
      },
      {
        id: 'global-deepseek',
        label: t('pluginSkillRootGlobalDeepseek'),
        path: '~/.kun/skills',
        available: true
      }
    ]
  }, [t, workspaceRoot])

  const selectedSkillRoot =
    skillRootOptions.find((option) => option.id === skillRootId && option.available) ??
    skillRootOptions.find((option) => option.available)

  useEffect(() => {
    const selectedOption = skillRootOptions.find((option) => option.id === skillRootId && option.available)
    if (selectedOption) {
      savePreferredSkillRootId(skillRootId)
      return
    }
    const fallback = skillRootOptions.find((option) => option.available)
    if (fallback && fallback.id !== skillRootId) {
      setSkillRootId(fallback.id)
    }
  }, [skillRootId, skillRootOptions])

  const readMcpConfig = useCallback(async (): Promise<string> => {
    if (typeof window.kunGui?.getKunConfigFile !== 'function') return mcpConfigText
    const file = await window.kunGui.getKunConfigFile()
    setMcpConfigText(file.content)
    setMcpLoaded(true)
    return file.content
  }, [mcpConfigText])

  useEffect(() => {
    if (activeKind !== 'mcp' || mcpLoaded) return
    void readMcpConfig().catch((e) => {
      setNotice({ tone: 'error', message: e instanceof Error ? e.message : String(e) })
    })
  }, [activeKind, mcpLoaded, readMcpConfig])

  const refreshMcpRuntimeOverlay = useCallback(async (): Promise<void> => {
    if (typeof window.kunGui?.runtimeRequest !== 'function') {
      setRuntimeInfo(null)
      setToolDiagnostics(null)
      setRuntimeOverlayError(t('pluginMcpRuntimeUnavailable'))
      return
    }
    const provider = getProvider()
    if (!provider.getRuntimeInfo && !provider.getToolDiagnostics) {
      setRuntimeOverlayError(t('pluginMcpRuntimeUnavailable'))
      return
    }
    setRuntimeOverlayLoading(true)
    setRuntimeOverlayError('')
    try {
      const [runtimeResult, diagnosticsResult] = await Promise.allSettled([
        provider.getRuntimeInfo?.(),
        provider.getToolDiagnostics?.()
      ])
      if (runtimeResult.status === 'fulfilled' && runtimeResult.value) {
        setRuntimeInfo(runtimeResult.value)
      }
      if (diagnosticsResult.status === 'fulfilled' && diagnosticsResult.value) {
        setToolDiagnostics(diagnosticsResult.value)
      }
      const errors = [runtimeResult, diagnosticsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => runtimeOverlayErrorMessage(result.reason, t('pluginMcpRuntimeUnavailable')))
      if (errors.length > 0) setRuntimeOverlayError(errors[0] ?? t('pluginActionFailed'))
    } finally {
      setRuntimeOverlayLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (activeKind !== 'mcp') return
    void refreshMcpRuntimeOverlay()
  }, [activeKind, refreshMcpRuntimeOverlay])

  const refreshSkillList = useCallback(async (): Promise<void> => {
    if (typeof window.kunGui?.listSkills !== 'function') {
      setDiscoveredSkills([])
      setSkillListError(t('pluginSkillScanUnavailable'))
      return
    }
    setSkillListLoading(true)
    setSkillListError('')
    try {
      const result = await window.kunGui.listSkills(workspaceRoot || undefined)
      if (!result.ok) {
        setDiscoveredSkills([])
        setSkillListError(result.message)
        return
      }
      setDiscoveredSkills(result.skills)
      if (result.validationErrors.length > 0) {
        setSkillListError(result.validationErrors[0]?.message ?? t('pluginSkillScanPartial'))
      } else if (syncError) {
        setSkillListError(syncError)
      }
    } catch (error) {
      setDiscoveredSkills([])
      setSkillListError(error instanceof Error ? error.message : String(error))
    } finally {
      setSkillListLoading(false)
    }
  }, [t, workspaceRoot])

  useEffect(() => {
    if (activeKind !== 'skill') return
    void refreshSkillList()
  }, [activeKind, refreshSkillList])

  useEffect(() => {
    setNotice(null)
    setCustomOpen(false)
    setDetailItem(null)
  }, [activeKind])

  const markInstalled = (key: string): void => {
    setInstalled((prev) => {
      const next = [...new Set([...prev, key])]
      saveInstalledPlugins(next)
      return next
    })
  }

  const discoveredSkillIds = useMemo(
    () => new Set(discoveredSkills.map((skill) => skill.id)),
    [discoveredSkills]
  )
  const discoveredSkillSourceKeys = useMemo(
    () => new Set(discoveredSkills.map(discoveredSkillSourceKey).filter(Boolean)),
    [discoveredSkills]
  )
  const discoveredSkillItems = useMemo(
    () => skillMarketplaceItemsFromDiscoveredSkills(discoveredSkills, {
      project: t('pluginSkillSourceProject'),
      global: t('pluginSkillSourceGlobal'),
      github: t('pluginSkillSourceGitHub'),
      bundled: t('pluginSkillSourceBundled')
    }),
    [discoveredSkills, t]
  )
  const discoveredMcpItems = useMemo(
    () => mcpMarketplaceItemsFromConfigAndDiagnostics(mcpConfigText, toolDiagnostics, {
      configured: t('pluginMcpSourceConfigured'),
      connected: t('pluginMcpSourceConnected'),
      error: t('pluginMcpSourceError'),
      disabled: t('pluginMcpSourceDisabled')
    }).filter((item) => item.id !== GUI_SCHEDULE_MCP_SERVER_ID),
    [mcpConfigText, t, toolDiagnostics]
  )
  const discoveredMcpIds = useMemo(
    () => new Set(discoveredMcpItems.map((item) => item.id)),
    [discoveredMcpItems]
  )
  const marketplaceItems = useMemo(
    () => activeKind === 'skill'
      ? [...RECOMMENDED_ITEMS, ...discoveredSkillItems]
      : [...RECOMMENDED_ITEMS, ...discoveredMcpItems],
    [activeKind, discoveredMcpItems, discoveredSkillItems]
  )

  const isInstalled = useCallback((item: MarketplaceItem): boolean => {
    if (item.group === 'personal') return true
    const catalogItem = RECOMMENDED_ITEMS.find((candidate) => candidate.kind === item.kind && candidate.id === item.id)
    if (catalogItem?.systemManaged) return true
    if (item.githubSkill && discoveredSkillSourceKeys.has(githubSkillSourceKey(item.githubSkill))) {
      return true
    }
    if (item.bundledSkill && discoveredSkillSourceKeys.has(bundledSkillSourceKey(item.bundledSkill))) {
      return true
    }
    if (
      item.bundledAgentPack &&
      item.bundledAgentPackSkillIds?.length &&
      item.bundledAgentPackSkillIds.every((id) => discoveredSkillIds.has(id))
    ) {
      return true
    }
    if (item.kind === 'skill' && discoveredSkillIds.has(item.id)) return true
    if (item.kind === 'mcp' && discoveredMcpIds.has(item.id)) return true
    const key = storageKey(item.kind, item.id)
    if (installed.includes(key)) return true
    return item.kind === 'mcp' && mcpConfigHasServer(mcpConfigText, item.id)
  }, [discoveredMcpIds, discoveredSkillIds, discoveredSkillSourceKeys, installed, mcpConfigText])

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return marketplaceItems.filter((item) => item.kind === activeKind)
      .filter((item) => {
        const title = itemTitle(item, t).toLowerCase()
        const description = itemDescription(item, t).toLowerCase()
        const detail = itemDetail(item, t).toLowerCase()
        const source = itemSourceLabel(item, t).toLowerCase()
        return !normalizedQuery ||
          title.includes(normalizedQuery) ||
          description.includes(normalizedQuery) ||
          detail.includes(normalizedQuery) ||
          source.includes(normalizedQuery) ||
          item.id.includes(normalizedQuery)
      })
      .filter((item) => {
        if (filter === 'recommended') return item.group === 'recommended'
        if (filter === 'installed') return isInstalled(item)
        return true
      })
  }, [activeKind, filter, isInstalled, marketplaceItems, query, t])

  const builtInItems = visibleItems.filter((item) => item.systemManaged)
  const recommendedItems = visibleItems.filter((item) => !item.systemManaged && !isInstalled(item))
  const personalItems = visibleItems.filter((item) =>
    item.group === 'personal' ||
    (!item.systemManaged && isInstalled(item) && !discoveredSkillIds.has(item.id) && !discoveredMcpIds.has(item.id))
  )
  const mcpRuntimeOverlay = useMemo(
    () => buildMcpMarketplaceOverlay({
      runtimeInfo,
      toolDiagnostics,
      managedServers: [{ id: GUI_SCHEDULE_MCP_SERVER_ID, toolCount: 4 }]
    }),
    [runtimeInfo, toolDiagnostics]
  )

  const appendMcpConfig = async (id: string, config: JsonRecord): Promise<void> => {
    const content = mcpLoaded ? mcpConfigText : await readMcpConfig()
    const merged = mergeMcpJsonConfig(content, config)
    if (merged.alreadyExists) {
      markInstalled(storageKey('mcp', id))
      setNotice({ tone: 'info', message: t('pluginAlreadyAdded') })
      return
    }
    const result = await window.kunGui.setKunConfigFile(merged.text)
    setMcpConfigText(merged.text)
    setMcpLoaded(true)
    markInstalled(storageKey('mcp', id))
    setNotice({ tone: 'success', message: t('pluginMcpAdded', { path: result.path }) })
  }

  const addItem = async (item: MarketplaceItem): Promise<void> => {
    setBusyId(storageKey(item.kind, item.id))
    setNotice(null)
    try {
      if (item.kind === 'mcp') {
        if (!item.mcpConfig) return
        await appendMcpConfig(item.id, item.mcpConfig(workspaceRoot))
        return
      }

      if (item.bundledAgentPack) {
        if (typeof window.workgpt?.installBundledAgentPack !== 'function') {
          setNotice({ tone: 'error', message: t('pluginSkillScanUnavailable') })
          return
        }
        const result = await window.workgpt.installBundledAgentPack(item.bundledAgentPack)
        if (!result.ok) {
          setNotice({ tone: 'error', message: result.message })
          return
        }
        markInstalled(storageKey('skill', item.id))
        await refreshSkillList()
        setNotice({
          tone: 'success',
          message: t('pluginAgentPackAdded', {
            path: result.rootPath,
            count: result.installedAssets
          })
        })
        return
      }

      if (!selectedSkillRoot?.path) {
        setNotice({ tone: 'error', message: t('pluginSkillRootMissing') })
        return
      }
      if (item.group === 'personal') return
      if (item.githubSkill) {
        if (typeof window.workgpt?.installGithubSkill !== 'function') {
          setNotice({ tone: 'error', message: t('pluginSkillScanUnavailable') })
          return
        }
        const result = await window.workgpt.installGithubSkill(selectedSkillRoot.path, item.githubSkill)
        if (!result.ok) {
          setNotice({ tone: 'error', message: result.message })
          return
        }
        markInstalled(storageKey('skill', item.id))
        await refreshSkillList()
        setNotice({ tone: 'success', message: t('pluginSkillAdded', { path: result.path }) })
        return
      }
      if (item.bundledSkill) {
        if (typeof window.workgpt?.installBundledSkill !== 'function') {
          setNotice({ tone: 'error', message: t('pluginSkillScanUnavailable') })
          return
        }
        const result = await window.workgpt.installBundledSkill(selectedSkillRoot.path, item.bundledSkill)
        if (!result.ok) {
          setNotice({ tone: 'error', message: result.message })
          return
        }
        markInstalled(storageKey('skill', item.id))
        await refreshSkillList()
        setNotice({ tone: 'success', message: t('pluginSkillAdded', { path: result.path }) })
        return
      }
      const title = itemTitle(item, t)
      const description = itemDescription(item, t)
      const content = buildSkillContent(
        item.id,
        title,
        description,
        item.skillInstructions ?? description
      )
      const result = await window.kunGui.saveSkillFile(selectedSkillRoot.path, item.id, content)
      if (!result.ok) {
        setNotice({ tone: 'error', message: result.message })
        return
      }
      markInstalled(storageKey('skill', item.id))
      await refreshSkillList()
      setNotice({ tone: 'success', message: t('pluginSkillAdded', { path: result.path }) })
    } catch (e) {
      setNotice({ tone: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusyId(null)
    }
  }

  const addCustom = async (): Promise<void> => {
    const id = normalizePluginId(customName)
    if (!id) {
      setNotice({ tone: 'error', message: t('pluginCustomNameRequired') })
      return
    }
    const description = customDescription.trim() || t('pluginCustomFallbackDesc')
    setBusyId(`custom:${activeKind}`)
    setNotice(null)
    try {
      if (activeKind === 'mcp') {
        const fallback = buildMcpConfig(
          id,
          customCommand.trim() || 'npx',
          customArgs
            .split('\n')
            .map((arg) => arg.trim())
            .filter(Boolean)
        )
        await appendMcpConfig(id, customMcpConfigFragment(id, customConfig, fallback))
      } else {
        if (!selectedSkillRoot?.path) {
          setNotice({ tone: 'error', message: t('pluginSkillRootMissing') })
          return
        }
        const body = customSkillBody.trim() || t('pluginCustomSkillFallbackBody')
        const content = buildSkillContent(id, customName.trim() || id, description, body)
        const result = await window.kunGui.saveSkillFile(selectedSkillRoot.path, id, content)
        if (!result.ok) {
          setNotice({ tone: 'error', message: result.message })
          return
        }
        markInstalled(storageKey('skill', id))
        await refreshSkillList()
        setNotice({ tone: 'success', message: t('pluginSkillAdded', { path: result.path }) })
      }
      setCustomName('')
      setCustomDescription('')
      setCustomCommand('')
      setCustomArgs('')
      setCustomConfig('')
      setCustomSkillBody('')
      setCustomOpen(false)
    } catch (e) {
      setNotice({ tone: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusyId(null)
    }
  }

  const openManageTarget = async (): Promise<void> => {
    try {
      if (activeKind === 'mcp') {
        const result = await window.kunGui.openKunConfigDir()
        if (!result.ok) setNotice({ tone: 'error', message: result.message ?? t('pluginActionFailed') })
        return
      }
      if (!selectedSkillRoot?.path) {
        setNotice({ tone: 'error', message: t('pluginSkillRootMissing') })
        return
      }
      const result = await window.kunGui.openSkillRoot(selectedSkillRoot.path)
      if (!result.ok) setNotice({ tone: 'error', message: result.message ?? t('pluginActionFailed') })
    } catch (e) {
      setNotice({ tone: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="ds-no-drag h-full min-h-0 overflow-y-auto px-6 py-7 md:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-ds-subtle p-1">
            <TabButton active={activeKind === 'mcp'} onClick={() => setActiveKind('mcp')}>
              {t('pluginTabMcp')}
            </TabButton>
            <TabButton active={activeKind === 'skill'} tone="skill" onClick={() => setActiveKind('skill')}>
              {t('pluginTabSkill')}
            </TabButton>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void openManageTarget()}
              className="inline-flex items-center gap-2 rounded-xl bg-ds-subtle px-3 py-2 text-[13px] font-semibold text-ds-ink transition hover:bg-ds-hover"
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} />
              {t('pluginManage')}
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl bg-ds-userbubble px-3 py-2 text-[13px] font-semibold text-ds-userbubbleFg shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={1.9} />
              {t('pluginCreate')}
            </button>
          </div>
        </div>

        <div className="mt-9 flex flex-col items-center text-center">
          <h1 className="text-[32px] font-semibold text-ds-ink md:text-[40px]">
            {activeKind === 'mcp' ? t('pluginMcpTitle') : t('pluginSkillTitle')}
          </h1>
        </div>

        <div className="mt-9 flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-2xl border border-ds-border bg-ds-card pl-11 pr-4 text-[15px] text-ds-ink shadow-sm outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
              placeholder={activeKind === 'mcp' ? t('pluginSearchMcp') : t('pluginSearchSkill')}
            />
          </label>
          <label className="relative w-full md:w-[168px]">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as PluginFilter)}
              className="h-11 w-full appearance-none rounded-2xl border border-ds-border bg-ds-card px-4 pr-9 text-[15px] font-medium text-ds-ink shadow-sm outline-none transition focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
            >
              <option value="all">{t('pluginFilterAll')}</option>
              <option value="recommended">{t('pluginFilterRecommended')}</option>
              <option value="installed">{t('pluginFilterInstalled')}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-faint" />
          </label>
        </div>

        {activeKind === 'skill' ? (
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <select
              value={selectedSkillRoot?.id ?? ''}
              onChange={(event) => setSkillRootId(event.target.value as SkillRootId)}
              className="h-10 rounded-xl border border-ds-border bg-ds-card px-3 text-[13px] text-ds-ink shadow-sm outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
            >
              {skillRootOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.available}>
                  {option.available ? option.label : `${option.label} · ${t('pluginSkillRootNeedsWorkspace')}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void openManageTarget()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-ds-border bg-ds-card px-3 text-[13px] font-medium text-ds-ink shadow-sm transition hover:bg-ds-hover"
            >
              <FolderOpen className="h-4 w-4" />
              {t('pluginOpenLocation')}
            </button>
            <button
              type="button"
              onClick={() => void refreshSkillList()}
              disabled={skillListLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-ds-border bg-ds-card px-3 text-[13px] font-medium text-ds-ink shadow-sm transition hover:bg-ds-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {skillListLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('pluginSkillRefresh')}
            </button>
            {skillListError ? (
              <span className="text-[12px] text-red-700 dark:text-red-300">
                {skillListError}
              </span>
            ) : (
              <span className="text-[12px] text-ds-faint">
                {t('pluginSkillDiscoveredCount', { count: discoveredSkills.length })}
              </span>
            )}
          </div>
        ) : null}

        {activeKind === 'mcp' ? (
          <McpRuntimeOverlayPanel
            overlay={mcpRuntimeOverlay}
            loading={runtimeOverlayLoading}
            error={runtimeOverlayError}
            onRefresh={() => void refreshMcpRuntimeOverlay()}
            t={t}
          />
        ) : null}

        {customOpen ? (
          <CustomPluginPanel
            activeKind={activeKind}
            customName={customName}
            customDescription={customDescription}
            customCommand={customCommand}
            customArgs={customArgs}
            customConfig={customConfig}
            customSkillBody={customSkillBody}
            busy={busyId === `custom:${activeKind}`}
            onNameChange={setCustomName}
            onDescriptionChange={setCustomDescription}
            onCommandChange={setCustomCommand}
            onArgsChange={setCustomArgs}
            onConfigChange={setCustomConfig}
            onSkillBodyChange={setCustomSkillBody}
            onAdd={() => void addCustom()}
          />
        ) : null}

        {notice ? <NoticeView notice={notice} /> : null}

        {activeKind === 'mcp' ? (
          <PluginSection
            title={t('pluginBuiltIn')}
            emptyText={t('pluginNoResults')}
            items={builtInItems}
            busyId={busyId}
            isInstalled={isInstalled}
            onAdd={addItem}
            onDetails={setDetailItem}
            t={t}
          />
        ) : null}

        <PluginSection
          title={t('pluginRecommended')}
          emptyText={t('pluginNoResults')}
          items={recommendedItems}
          busyId={busyId}
          isInstalled={isInstalled}
          onAdd={addItem}
          onDetails={setDetailItem}
          t={t}
        />

        <PluginSection
          title={t('pluginPersonal')}
          emptyText={t('pluginPersonalEmpty')}
          items={personalItems}
          busyId={busyId}
          isInstalled={isInstalled}
          onAdd={addItem}
          onDetails={setDetailItem}
          t={t}
        />

        {detailItem ? (
          <PluginDetailDialog
            item={detailItem}
            installed={isInstalled(detailItem)}
            onClose={() => setDetailItem(null)}
            onAdd={() => void addItem(detailItem)}
            busy={busyId === storageKey(detailItem.kind, detailItem.id)}
            t={t}
          />
        ) : null}

        {activeKind === 'mcp' ? (
          <div className="mt-8 flex items-center gap-2 text-[12px] text-ds-faint">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t('pluginMcpRestartHint')}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function McpRuntimeOverlayPanel({
  overlay,
  loading,
  error,
  onRefresh,
  t
}: {
  overlay: McpMarketplaceOverlay
  loading: boolean
  error: string
  onRefresh: () => void
  t: (key: string, values?: Record<string, unknown>) => string
}): ReactElement {
  const status = mcpRuntimeStatusLabel(overlay.status, t)
  return (
    <section className="mt-4 rounded-lg border border-ds-border bg-ds-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.8} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-ds-ink">{t('pluginMcpRuntimeOverlay')}</span>
              <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${mcpRuntimeStatusTone(overlay.status)}`}>
                {status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ds-muted">
              <span>{t('pluginMcpRuntimeServers', {
                connected: overlay.connectedServers,
                configured: overlay.configuredServers
              })}</span>
              <span>{t('pluginMcpRuntimeTools', { count: overlay.toolCount })}</span>
              <span>{t('pluginMcpRuntimeSearch', {
                mode: overlay.searchMode,
                status: overlay.searchActive ? t('pluginMcpRuntimeSearchActive') : t('pluginMcpRuntimeSearchInactive'),
                indexed: overlay.indexedToolCount,
                advertised: overlay.advertisedToolCount
              })}</span>
              {overlay.driftCount > 0 ? <span>{t('pluginMcpRuntimeDrift', { count: overlay.driftCount })}</span> : null}
            </div>
            {overlay.serverIds.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {overlay.serverIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-ds-border-muted bg-ds-subtle px-2 py-0.5 font-mono text-[11px] text-ds-muted"
                  >
                    {id}
                  </span>
                ))}
              </div>
            ) : null}
            {error || overlay.lastError ? (
              <div className="mt-2 truncate text-[12px] text-red-700 dark:text-red-300">
                {error || t('pluginMcpRuntimeLastError', { message: overlay.lastError })}
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-ds-border bg-ds-subtle px-3 text-[12px] font-semibold text-ds-ink transition hover:bg-ds-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('pluginMcpRuntimeRefresh')}
        </button>
      </div>
    </section>
  )
}

function mcpRuntimeStatusLabel(
  status: McpMarketplaceOverlayStatus,
  t: (key: string) => string
): string {
  switch (status) {
    case 'connected':
      return t('pluginMcpRuntimeConnected')
    case 'configured':
      return t('pluginMcpRuntimeConfigured')
    case 'drift':
      return t('pluginMcpRuntimeDrifted')
    case 'error':
      return t('pluginMcpRuntimeError')
    case 'disabled':
      return t('pluginMcpRuntimeDisabled')
    case 'offline':
      return t('pluginMcpRuntimeOffline')
  }
}

function mcpRuntimeStatusTone(status: McpMarketplaceOverlayStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
    case 'configured':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200'
    case 'drift':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
    case 'error':
      return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200'
    case 'disabled':
    case 'offline':
      return 'bg-ds-subtle text-ds-muted'
  }
}

function marketplaceSourceTone(tone: MarketplaceItem['statusTone']): string {
  switch (tone) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
    case 'warning':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200'
    case 'error':
      return 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
    case 'default':
    default:
      return 'bg-ds-subtle text-ds-muted'
  }
}

function runtimeOverlayErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return /runtimeRequest|kunGui|Cannot read properties/i.test(message) ? fallback : message
}

function PluginSection({
  title,
  emptyText,
  items,
  busyId,
  isInstalled,
  onAdd,
  onDetails,
  t
}: {
  title: string
  emptyText: string
  items: MarketplaceItem[]
  busyId: string | null
  isInstalled: (item: MarketplaceItem) => boolean
  onAdd: (item: MarketplaceItem) => Promise<void>
  onDetails: (item: MarketplaceItem) => void
  t: (key: string, values?: Record<string, unknown>) => string
}): ReactElement {
  return (
    <section className="mt-8">
      <h2 className="border-b border-ds-border-muted pb-3 text-[20px] font-semibold text-ds-ink">
        {title}
      </h2>
      {items.length === 0 ? (
        <div className="py-8 text-[14px] text-ds-faint">{emptyText}</div>
      ) : (
        <div className="grid gap-x-14 md:grid-cols-2">
          {items.map((item) => {
            const itemKey = storageKey(item.kind, item.id)
            const installed = isInstalled(item)
            const busy = busyId === itemKey
            const sourceLabel = itemSourceLabel(item, t)
            return (
              <div
                key={itemKey}
                className="flex min-h-[92px] items-center gap-5 border-b border-ds-border-muted py-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[17px] font-semibold text-ds-ink">
                      {itemTitle(item, t)}
                    </span>
                    {sourceLabel ? (
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${marketplaceSourceTone(item.statusTone)}`}
                      >
                        {sourceLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[14px] leading-5 text-ds-muted">
                    {itemDescription(item, t)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDetails(item)}
                    title={t('pluginDetails')}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-ds-subtle text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
                  >
                    <Info className="h-4 w-4" strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    disabled={installed || busy}
                    onClick={() => void onAdd(item)}
                    title={installed ? t('pluginAdded') : t('pluginAdd')}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                      installed
                        ? 'text-ds-faint'
                        : 'bg-ds-subtle text-ds-ink hover:bg-ds-hover disabled:opacity-60'
                    }`}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    ) : installed ? (
                      <Check className="h-4 w-4" strokeWidth={2} />
                    ) : (
                      <Plus className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function PluginDetailDialog({
  item,
  installed,
  busy,
  onClose,
  onAdd,
  t
}: {
  item: MarketplaceItem
  installed: boolean
  busy: boolean
  onClose: () => void
  onAdd: () => void
  t: (key: string, values?: Record<string, unknown>) => string
}): ReactElement {
  const title = itemTitle(item, t)
  const description = itemDescription(item, t)
  const detail = itemDetail(item, t)
  const sourceLabel = itemSourceLabel(item, t)
  const sourceUrl = itemSourceUrl(item)
  const kindLabel = item.kind === 'mcp' ? t('pluginDetailKindMcp') : t('pluginDetailKindSkill')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ds-border bg-ds-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-ds-subtle px-2 py-0.5 text-[11px] font-semibold text-ds-muted">
                {kindLabel}
              </span>
              {sourceLabel ? (
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${marketplaceSourceTone(item.statusTone)}`}>
                  {sourceLabel}
                </span>
              ) : null}
              <span className="rounded-md bg-ds-subtle px-2 py-0.5 font-mono text-[11px] text-ds-muted">
                {item.id}
              </span>
            </div>
            <h3 className="mt-3 text-[22px] font-semibold text-ds-ink">{title}</h3>
            {description ? (
              <p className="mt-2 text-[14px] leading-6 text-ds-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('pluginCloseDetails')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ds-subtle text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-ds-border-muted bg-ds-main/35 p-4">
          <div className="text-[12px] font-semibold text-ds-faint">
            {t('pluginDetailIntro')}
          </div>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-ds-ink">
            {detail || description || t('pluginDetailNoIntro')}
          </p>
        </div>

        <div className="mt-4 grid gap-3 text-[13px] md:grid-cols-2">
          <div className="rounded-xl border border-ds-border-muted bg-ds-main/25 p-3">
            <div className="font-semibold text-ds-ink">{t('pluginDetailStatus')}</div>
            <div className="mt-1 text-ds-muted">{installed ? t('pluginAdded') : t('pluginDetailNotAdded')}</div>
          </div>
          <div className="rounded-xl border border-ds-border-muted bg-ds-main/25 p-3">
            <div className="font-semibold text-ds-ink">{t('pluginDetailSource')}</div>
            <div className="mt-1 text-ds-muted">{sourceLabel || t('pluginDetailSourceLocal')}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {sourceUrl ? (
            <button
              type="button"
              onClick={() => void window.workgpt?.openExternal?.(sourceUrl)?.catch(() => undefined)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-ds-border bg-ds-card px-3 text-[13px] font-semibold text-ds-ink shadow-sm transition hover:bg-ds-hover"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
              {t('pluginOpenSource')}
            </button>
          ) : null}
          {item.group === 'recommended' && !item.systemManaged ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={installed || busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-ds-userbubble px-4 text-[13px] font-semibold text-ds-userbubbleFg shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : installed ? <Check className="h-4 w-4" strokeWidth={2} /> : <Plus className="h-4 w-4" strokeWidth={2} />}
              {installed ? t('pluginAdded') : t('pluginAdd')}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function CustomPluginPanel({
  activeKind,
  customName,
  customDescription,
  customCommand,
  customArgs,
  customConfig,
  customSkillBody,
  busy,
  onNameChange,
  onDescriptionChange,
  onCommandChange,
  onArgsChange,
  onConfigChange,
  onSkillBodyChange,
  onAdd
}: {
  activeKind: PluginKind
  customName: string
  customDescription: string
  customCommand: string
  customArgs: string
  customConfig: string
  customSkillBody: string
  busy: boolean
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCommandChange: (value: string) => void
  onArgsChange: (value: string) => void
  onConfigChange: (value: string) => void
  onSkillBodyChange: (value: string) => void
  onAdd: () => void
}): ReactElement {
  const { t } = useTranslation('common')
  return (
    <section className="mt-6 rounded-2xl border border-ds-border bg-ds-card/95 p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={customName}
          onChange={(event) => onNameChange(event.target.value)}
          className="h-10 rounded-xl border border-ds-border bg-ds-main/45 px-3 text-[14px] text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
          placeholder={t('pluginCustomName')}
        />
        <input
          value={customDescription}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="h-10 rounded-xl border border-ds-border bg-ds-main/45 px-3 text-[14px] text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
          placeholder={t('pluginCustomDescription')}
        />
      </div>
      {activeKind === 'mcp' ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={customCommand}
              onChange={(event) => onCommandChange(event.target.value)}
              className="h-10 rounded-xl border border-ds-border bg-ds-main/45 px-3 text-[14px] text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
              placeholder={t('pluginCustomCommand')}
            />
            <textarea
              value={customArgs}
              onChange={(event) => onArgsChange(event.target.value)}
              className="min-h-[80px] rounded-xl border border-ds-border bg-ds-main/45 px-3 py-2 font-mono text-[13px] leading-5 text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
              placeholder={t('pluginCustomArgs')}
              spellCheck={false}
            />
          </div>
          <textarea
            value={customConfig}
            onChange={(event) => onConfigChange(event.target.value)}
            className="min-h-[120px] rounded-xl border border-ds-border bg-ds-main/45 px-3 py-2 font-mono text-[13px] leading-5 text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
            placeholder={t('pluginCustomMcpConfig')}
            spellCheck={false}
          />
        </div>
      ) : (
        <textarea
          value={customSkillBody}
          onChange={(event) => onSkillBodyChange(event.target.value)}
          className="mt-3 min-h-[140px] w-full rounded-xl border border-ds-border bg-ds-main/45 px-3 py-2 font-mono text-[13px] leading-5 text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/30"
          placeholder={t('pluginCustomSkillBody')}
          spellCheck={false}
        />
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onAdd}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-ds-userbubble px-4 py-2 text-[13px] font-semibold text-ds-userbubbleFg shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <Plus className="h-4 w-4" strokeWidth={2} />}
          {t('pluginAddCustom')}
        </button>
      </div>
    </section>
  )
}
