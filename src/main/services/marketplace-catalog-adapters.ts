import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import type {
  CatalogSnapshotV1,
  CatalogSourceV1,
  MarketplacePackageV1,
  PackagePermissionV1,
  PackageSourceV1
} from '../../shared/marketplace'

const IMMUTABLE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i
const COMPATIBILITY: MarketplacePackageV1['compatibility'] = {
  workwise: '>=0.4.0',
  platforms: ['darwin', 'win32', 'linux'],
  architectures: ['arm64', 'x64']
}

type CatalogAdapterContext = {
  source: CatalogSourceV1
  revision: string
  commit?: string
  generatedAt?: string
}

export type McpRegistryPageDelta = {
  upserts: MarketplacePackageV1[]
  removals: Array<{ id: string; version: string }>
  nextCursor?: string
}

type McpRegistryContext = {
  sourceId: string
  registryUrl: string
}

type McpRegistryMergeContext = {
  sourceId: string
  revision: string
  generatedAt?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(label + ' must be an object.')
  return value
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(label + ' must be an array.')
  return value
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required.')
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return string(value, label)
}

function secureHttpsUrl(value: unknown, label: string): string {
  const raw = string(value, label)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(label + ' must be a valid HTTPS URL.')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(label + ' must be a credential-free HTTPS URL.')
  }
  return parsed.toString()
}

function optionalSecureHttpsUrl(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  try {
    return secureHttpsUrl(value, 'URL')
  } catch {
    return undefined
  }
}

function cleanRelativePluginPath(value: unknown): string {
  const raw = string(value, 'Codex plugin path')
  if (raw.includes('\\') || raw.includes('\0') || raw.startsWith('/')) {
    throw new Error('Codex plugin path must be a portable relative path.')
  }
  const withoutPrefix = raw.replace(/^\.\//, '')
  const normalized = posix.normalize(withoutPrefix)
  if (!normalized || normalized === '.' || normalized === '..' ||
      normalized.startsWith('../') || posix.isAbsolute(normalized)) {
    throw new Error('Codex plugin path traversal is not allowed.')
  }
  return normalized
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'package'
}

function stableId(prefix: string, ...parts: string[]): string {
  const label = parts.map(slug).filter(Boolean).join('-').slice(0, 80)
  const digest = createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 10)
  return `${prefix}-${label}-${digest}`
}

function codexPackageSource(
  source: CatalogSourceV1,
  packageId: string,
  pluginPath: string,
  commit?: string
): PackageSourceV1 {
  const id = `${packageId}-source-1`
  if (source.type === 'github') {
    if (!commit || !IMMUTABLE_COMMIT.test(commit)) {
      throw new Error('Codex GitHub catalogs require an immutable commit.')
    }
    return {
      id,
      catalogSourceId: source.id,
      kind: 'github',
      location: source.location,
      owner: source.owner,
      repository: source.repository,
      defaultBranch: source.defaultBranch,
      requestedRef: source.defaultBranch,
      resolvedRef: commit,
      subpath: pluginPath
    }
  }
  if (source.type === 'git') {
    if (!commit || !IMMUTABLE_COMMIT.test(commit)) {
      throw new Error('Codex Git catalogs require an immutable commit.')
    }
    return {
      id,
      catalogSourceId: source.id,
      kind: 'git',
      location: source.location,
      defaultBranch: source.defaultBranch,
      requestedRef: source.defaultBranch,
      resolvedRef: commit,
      subpath: pluginPath
    }
  }
  if (source.type === 'local' || source.type === 'project' || source.type === 'https') {
    return {
      id,
      catalogSourceId: source.id,
      kind: source.type,
      location: `${source.location}#${pluginPath}`
    }
  }
  throw new Error('Catalog source type cannot host a Codex marketplace.')
}

export function adaptCodexMarketplace(
  input: unknown,
  context: CatalogAdapterContext
): CatalogSnapshotV1 {
  if ((context.source.type === 'git' || context.source.type === 'github') &&
      (!context.commit || !IMMUTABLE_COMMIT.test(context.commit))) {
    throw new Error('Codex Git catalogs require an immutable commit.')
  }
  const marketplace = record(input, 'Codex marketplace')
  const marketplaceName = string(marketplace.name, 'Codex marketplace name')
  const marketplaceInterface = marketplace.interface === undefined
    ? undefined
    : record(marketplace.interface, 'Codex marketplace interface')
  const displayName = optionalString(
    marketplaceInterface?.displayName,
    'Codex marketplace displayName'
  ) ?? marketplaceName
  const plugins = array(marketplace.plugins, 'Codex marketplace plugins')
  const names = new Set<string>()
  const packages = plugins.map((rawPlugin) => {
    const plugin = record(rawPlugin, 'Codex marketplace plugin')
    const name = string(plugin.name, 'Codex plugin name')
    if (names.has(name)) throw new Error('Codex marketplace contains duplicate plugin names.')
    names.add(name)
    const sourceDefinition = record(plugin.source, `${name} source`)
    if (sourceDefinition.source !== 'local') {
      throw new Error(`${name} uses an unsupported Codex plugin source.`)
    }
    const pluginPath = cleanRelativePluginPath(sourceDefinition.path)
    const policy = record(plugin.policy, `${name} policy`)
    const installation = string(policy.installation, `${name} installation policy`)
    if (!new Set(['AVAILABLE', 'REQUIRED', 'DISABLED']).has(installation)) {
      throw new Error(`${name} installation policy is unsupported.`)
    }
    const authentication = string(policy.authentication, `${name} authentication policy`)
    if (!new Set(['ON_INSTALL', 'ON_USE', 'NONE']).has(authentication)) {
      throw new Error(`${name} authentication policy is unsupported.`)
    }
    if (policy.products !== undefined) {
      const products = array(policy.products, `${name} products`)
      if (products.some((product) => typeof product !== 'string' || !product.trim())) {
        throw new Error(`${name} products must contain strings.`)
      }
    }
    const category = optionalString(plugin.category, `${name} category`)
    const packageId = stableId('codex', marketplaceName, name)
    const packageSource = codexPackageSource(
      context.source,
      packageId,
      pluginPath,
      context.commit
    )
    const publisherUrl = context.source.location.startsWith('https://')
      ? context.source.location
      : undefined
    return {
      schemaVersion: 1,
      id: packageId,
      name,
      summary: `${name} from ${displayName}.`,
      tier: 'advanced',
      ...(category ? { categories: [category] } : {}),
      version: context.commit ?? context.revision,
      publisher: {
        id: slug(marketplaceName),
        name: displayName,
        verified: new Set(['system', 'official', 'verified']).has(context.source.trust),
        ...(publisherUrl ? { url: publisherUrl } : {})
      },
      license: null,
      source: packageSource,
      sources: [packageSource],
      components: [],
      permissions: [],
      auth: { type: 'none' },
      licenseEvidence: [],
      dependencies: [],
      updatePolicy: { strategy: 'manual', channel: 'stable', allowMajor: false },
      compatibility: COMPATIBILITY,
      availability: installation === 'DISABLED'
        ? {
            status: 'unavailable',
            reasonCode: 'disabled-by-catalog-policy',
            message: 'The source catalog has disabled this plugin.'
          }
        : { status: 'available' },
      installation: { mode: 'external', installedByDefault: false, reinstallable: false }
    } satisfies MarketplacePackageV1
  })
  return {
    schemaVersion: 1,
    sourceId: context.source.id,
    revision: context.revision,
    ...(context.generatedAt ? { generatedAt: context.generatedAt } : {}),
    ...(context.commit ? { commit: context.commit } : {}),
    packages
  }
}

export function mcpRegistryPackageId(serverName: string): string {
  return stableId('mcp-registry', serverName)
}

function registryPermissions(endpoint: string, configuredInputs: string[]): PackagePermissionV1[] {
  const permissions: PackagePermissionV1[] = [{
    id: 'network.connect',
    kind: 'network',
    access: 'connect',
    default: 'review',
    reviewRequired: true,
    description: 'Connect to the MCP server endpoint.',
    resources: [new URL(endpoint).origin]
  }]
  if (configuredInputs.length > 0) {
    permissions.push({
      id: 'credentials.authenticate',
      kind: 'credentials',
      access: 'authenticate',
      default: 'review',
      reviewRequired: true,
      description: 'Provide configuration requested by the MCP server.',
      resources: configuredInputs
    })
  }
  return permissions
}

function registryPackage(
  server: Record<string, unknown>,
  official: Record<string, unknown>,
  context: McpRegistryContext
): MarketplacePackageV1 {
  const name = string(server.name, 'MCP server name')
  const title = optionalString(server.title, `${name} title`) ?? name
  const description = string(server.description, `${name} description`)
  const version = string(server.version, `${name} version`)
  const packageId = mcpRegistryPackageId(name)
  const sourceId = `${packageId}-source-1`
  const publisherUrl = optionalSecureHttpsUrl(server.websiteUrl) ??
    (isRecord(server.repository) ? optionalSecureHttpsUrl(server.repository.url) : undefined)
  const publisher = {
    id: slug(name.split('/')[0] ?? name),
    name: name.split('/')[0] ?? name,
    verified: false,
    ...(publisherUrl ? { url: publisherUrl } : {})
  }
  const remotes = server.remotes === undefined || server.remotes === null
    ? []
    : array(server.remotes, `${name} remotes`).map((item) => record(item, `${name} remote`))
  const supportedRemotes = remotes.filter((remote) =>
    remote.type === 'streamable-http' || remote.type === 'sse'
  )
  const remote = supportedRemotes.find((item) => item.type === 'streamable-http') ?? supportedRemotes[0]
  const status = string(official.status, `${name} registry status`)
  if (remote) {
    const endpoint = secureHttpsUrl(remote.url, `${name} remote endpoint`)
    const headers = remote.headers === undefined || remote.headers === null
      ? []
      : array(remote.headers, `${name} remote headers`).map((item) =>
          record(item, `${name} remote header`)
        )
    const configuredInputs = headers.map((header) =>
      string(header.name, `${name} header name`)
    )
    const variables = remote.variables === undefined || remote.variables === null
      ? []
      : Object.keys(record(remote.variables, `${name} remote variables`))
    configuredInputs.push(...variables.map((variable) => `variable:${variable}`))
    const requiresConfiguration = configuredInputs.length > 0
    const source: PackageSourceV1 = {
      id: sourceId,
      catalogSourceId: context.sourceId,
      kind: 'remote',
      location: endpoint
    }
    return {
      schemaVersion: 1,
      id: packageId,
      name: title,
      summary: description,
      tier: 'advanced',
      categories: ['MCP Servers'],
      version,
      publisher,
      license: null,
      source,
      sources: [source],
      components: [{
        id: `${packageId}-server`,
        name: `${title} Server`,
        sourceId,
        type: 'mcp',
        runtime: {
          kind: 'remote',
          transport: remote.type as 'streamable-http' | 'sse',
          endpoint
        }
      }],
      permissions: registryPermissions(endpoint, configuredInputs),
      auth: requiresConfiguration
        ? { type: 'tool-managed', provider: `mcp-registry:${name}` }
        : { type: 'none' },
      licenseEvidence: [],
      dependencies: [],
      updatePolicy: { strategy: 'manual', channel: 'stable', allowMajor: false },
      compatibility: COMPATIBILITY,
      availability: status === 'active' && !requiresConfiguration
        ? { status: 'available' }
        : {
            status: 'unavailable',
            reasonCode: requiresConfiguration
              ? 'remote-configuration-resolution-required'
              : 'registry-' + status,
            message: requiresConfiguration
              ? 'Remote headers or variables must be reviewed before this server can be installed.'
              : `The MCP Registry marks this server as ${status}.`
          },
      installation: { mode: 'external', installedByDefault: false, reinstallable: false }
    }
  }

  const registryLocation = `${context.registryUrl.replace(/\/$/, '')}/${encodeURIComponent(name)}` +
    `/versions/${encodeURIComponent(version)}`
  const source: PackageSourceV1 = {
    id: sourceId,
    catalogSourceId: context.sourceId,
    kind: 'mcp-registry',
    location: registryLocation,
    resolvedRef: version
  }
  const packages = server.packages === undefined || server.packages === null
    ? []
    : array(server.packages, `${name} packages`)
  return {
    schemaVersion: 1,
    id: packageId,
    name: title,
    summary: description,
    tier: 'advanced',
    categories: ['MCP Servers'],
    version,
    publisher,
    license: null,
    source,
    sources: [source],
    components: [],
    permissions: [],
    auth: { type: 'none' },
    licenseEvidence: [],
    dependencies: [],
    updatePolicy: { strategy: 'manual', channel: 'stable', allowMajor: false },
    compatibility: COMPATIBILITY,
    availability: {
      status: 'unavailable',
      reasonCode: packages.length > 0
        ? 'artifact-integrity-resolution-required'
        : 'unsupported-registry-transport',
      message: packages.length > 0
        ? 'Artifact integrity must be resolved before this package can be installed.'
        : 'This registry entry has no supported remote or package transport.'
    },
    installation: { mode: 'external', installedByDefault: false, reinstallable: false }
  }
}

export function parseMcpRegistryPage(
  input: unknown,
  context: McpRegistryContext
): McpRegistryPageDelta {
  secureHttpsUrl(context.registryUrl, 'MCP Registry URL')
  const page = record(input, 'MCP Registry page')
  const servers = array(page.servers, 'MCP Registry servers')
  const metadata = record(page.metadata, 'MCP Registry metadata')
  if (!Number.isInteger(metadata.count) || Number(metadata.count) < 0) {
    throw new Error('MCP Registry metadata count is invalid.')
  }
  if (metadata.nextCursor !== undefined && typeof metadata.nextCursor !== 'string') {
    throw new Error('MCP Registry next cursor must be a string.')
  }
  const seen = new Set<string>()
  const upserts: MarketplacePackageV1[] = []
  const removals: McpRegistryPageDelta['removals'] = []
  for (const rawEntry of servers) {
    const entry = record(rawEntry, 'MCP Registry server entry')
    const server = record(entry.server, 'MCP Registry server')
    const name = string(server.name, 'MCP server name')
    const version = string(server.version, `${name} version`)
    const key = `${name}\0${version}`
    if (seen.has(key)) throw new Error('MCP Registry page contains a duplicate server update.')
    seen.add(key)
    const meta = record(entry._meta, `${name} registry metadata`)
    const official = record(
      meta['io.modelcontextprotocol.registry/official'],
      `${name} official registry metadata`
    )
    if (typeof official.isLatest !== 'boolean') {
      throw new Error(`${name} registry isLatest flag is required.`)
    }
    if (!official.isLatest) continue
    const status = string(official.status, `${name} registry status`)
    if (!new Set(['active', 'deprecated', 'deleted']).has(status)) {
      throw new Error(`${name} registry status is unsupported.`)
    }
    if (status === 'deleted') {
      removals.push({ id: mcpRegistryPackageId(name), version })
      continue
    }
    upserts.push(registryPackage(server, official, context))
  }
  return {
    upserts,
    removals,
    ...(metadata.nextCursor ? { nextCursor: metadata.nextCursor } : {})
  }
}

export function mergeMcpRegistryDelta(
  existing: MarketplacePackageV1[],
  deltas: McpRegistryPageDelta[],
  context: McpRegistryMergeContext
): CatalogSnapshotV1 {
  const packages = new Map(existing.map((item) => [item.id, structuredClone(item)]))
  for (const delta of deltas) {
    for (const removal of delta.removals) {
      packages.delete(removal.id)
    }
    for (const item of delta.upserts) packages.set(item.id, structuredClone(item))
  }
  return {
    schemaVersion: 1,
    sourceId: context.sourceId,
    revision: context.revision,
    ...(context.generatedAt ? { generatedAt: context.generatedAt } : {}),
    packages: [...packages.values()].sort((left, right) => left.id.localeCompare(right.id))
  }
}
