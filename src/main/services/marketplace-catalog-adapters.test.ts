import { describe, expect, it } from 'vitest'
import type { CatalogSourceV1, MarketplacePackageV1 } from '../../shared/marketplace'
import {
  adaptCodexMarketplace,
  mcpRegistryPackageId,
  mergeMcpRegistryDelta,
  parseMcpRegistryPage
} from './marketplace-catalog-adapters'

const NOW = '2026-08-08T08:00:00.000Z'
const COMMIT = 'a'.repeat(40)

function githubSource(): CatalogSourceV1 {
  return {
    schemaVersion: 1,
    id: 'team-codex',
    name: 'Team Codex catalog',
    type: 'github',
    scope: 'team',
    location: 'https://github.com/example/plugins',
    owner: 'example',
    repository: 'plugins',
    defaultBranch: 'main',
    trust: 'verified',
    searchable: true,
    auth: { type: 'none' },
    sync: {
      mode: 'manual',
      state: 'idle',
      mirroredByDefault: false,
      installedByDefault: false
    }
  }
}

function registryEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    server: {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'com.example/weather',
      title: 'Weather MCP',
      description: 'Retrieve weather forecasts.',
      version: '1.2.3',
      websiteUrl: 'https://example.com/weather',
      repository: {
        url: 'https://github.com/example/weather-mcp',
        source: 'github',
        id: '12345'
      },
      remotes: [{
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        headers: [{
          name: 'Authorization',
          description: 'API token',
          isRequired: true,
          isSecret: true
        }]
      }]
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        statusChangedAt: NOW,
        publishedAt: NOW,
        updatedAt: NOW,
        isLatest: true
      }
    },
    ...overrides
  }
}

describe('Codex marketplace adapter', () => {
  it('maps pinned local plugin entries to namespaced GitHub packages', () => {
    const result = adaptCodexMarketplace({
      name: 'team-marketplace',
      interface: { displayName: 'Team Marketplace' },
      plugins: [{
        name: 'review-tools',
        source: { source: 'local', path: './plugins/review-tools' },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
          products: ['CODEX']
        },
        category: 'Developer Tools'
      }]
    }, {
      source: githubSource(),
      revision: COMMIT,
      commit: COMMIT,
      generatedAt: NOW
    })

    expect(result).toMatchObject({
      schemaVersion: 1,
      sourceId: 'team-codex',
      revision: COMMIT,
      commit: COMMIT,
      generatedAt: NOW
    })
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]).toMatchObject({
      name: 'review-tools',
      version: COMMIT,
      categories: ['Developer Tools'],
      publisher: { name: 'Team Marketplace', verified: true },
      source: {
        kind: 'github',
        catalogSourceId: 'team-codex',
        location: 'https://github.com/example/plugins',
        owner: 'example',
        repository: 'plugins',
        resolvedRef: COMMIT,
        subpath: 'plugins/review-tools'
      },
      installation: { mode: 'external', installedByDefault: false, reinstallable: false }
    })
    expect(result.packages[0]?.id).toMatch(/^codex-team-marketplace-review-tools-/)
  })

  it('rejects path traversal, absolute paths, duplicate names, and unsupported sources', () => {
    const base = {
      name: 'unsafe',
      plugins: [{
        name: 'plugin',
        source: { source: 'local', path: './plugins/plugin' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }
      }]
    }
    const context = { source: githubSource(), revision: COMMIT, commit: COMMIT }
    for (const path of ['../outside', '/absolute/plugin', 'plugins/../../outside', 'plugins\\outside']) {
      const input = structuredClone(base)
      input.plugins[0]!.source.path = path
      expect(() => adaptCodexMarketplace(input, context)).toThrow(/path|relative|traversal/i)
    }

    expect(() => adaptCodexMarketplace({
      ...base,
      plugins: [base.plugins[0], base.plugins[0]]
    }, context)).toThrow(/duplicate/i)

    expect(() => adaptCodexMarketplace({
      ...base,
      plugins: [{ ...base.plugins[0], source: { source: 'npm', path: 'plugin' } }]
    }, context)).toThrow(/source/i)
  })

  it('requires immutable commits for Git and GitHub catalogs', () => {
    expect(() => adaptCodexMarketplace({ name: 'mutable', plugins: [] }, {
      source: githubSource(),
      revision: 'main',
      commit: 'main'
    })).toThrow(/immutable|commit/i)
  })
})

describe('MCP Registry v0.1 adapter', () => {
  it('maps configured remote servers without promising installation before review', () => {
    const page = parseMcpRegistryPage({
      servers: [registryEntry()],
      metadata: { count: 1, nextCursor: 'next-page' }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' })

    expect(page.nextCursor).toBe('next-page')
    expect(page.upserts).toHaveLength(1)
    const item = page.upserts[0]!
    expect(item).toMatchObject({
      id: mcpRegistryPackageId('com.example/weather'),
      name: 'Weather MCP',
      version: '1.2.3',
      source: { kind: 'remote', location: 'https://mcp.example.com/mcp' },
      auth: { type: 'tool-managed', provider: 'mcp-registry:com.example/weather' },
      availability: {
        status: 'unavailable',
        reasonCode: 'remote-configuration-resolution-required'
      }
    })
    expect(item.components[0]).toMatchObject({
      type: 'mcp',
      sourceId: item.source.id,
      runtime: {
        kind: 'remote',
        transport: 'streamable-http',
        endpoint: 'https://mcp.example.com/mcp'
      }
    })
    expect(item.permissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'network', access: 'connect' }),
      expect.objectContaining({ kind: 'credentials', access: 'authenticate' })
    ]))
  })

  it('keeps package-only entries searchable but unavailable until integrity resolution', () => {
    const entry = registryEntry()
    const server = entry.server as Record<string, unknown>
    delete server.remotes
    server.packages = [{
      registryType: 'npm',
      identifier: '@example/weather-mcp',
      version: '1.2.3',
      transport: { type: 'stdio' }
    }]

    const page = parseMcpRegistryPage({
      servers: [entry], metadata: { count: 1 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' })

    expect(page.upserts[0]).toMatchObject({
      source: { kind: 'mcp-registry' },
      components: [],
      availability: {
        status: 'unavailable',
        reasonCode: 'artifact-integrity-resolution-required'
      }
    })
  })

  it('emits removals for deleted latest records and ignores superseded versions', () => {
    const deleted = registryEntry()
    const deletedMeta = (deleted._meta as Record<string, Record<string, unknown>>)[
      'io.modelcontextprotocol.registry/official'
    ]!
    deletedMeta.status = 'deleted'
    const old = registryEntry()
    ;(old.server as Record<string, unknown>).version = '1.0.0'
    const oldMeta = (old._meta as Record<string, Record<string, unknown>>)[
      'io.modelcontextprotocol.registry/official'
    ]!
    oldMeta.isLatest = false

    const page = parseMcpRegistryPage({
      servers: [deleted, old], metadata: { count: 2 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' })

    expect(page.upserts).toEqual([])
    expect(page.removals).toEqual([{
      id: mcpRegistryPackageId('com.example/weather'),
      version: '1.2.3'
    }])
  })

  it('merges incremental pages without losing unchanged packages', () => {
    const existing: MarketplacePackageV1[] = [
      parseMcpRegistryPage({
        servers: [registryEntry()], metadata: { count: 1 }
      }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' }).upserts[0]!,
      {
        ...parseMcpRegistryPage({
          servers: [registryEntry()], metadata: { count: 1 }
        }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' }).upserts[0]!,
        id: 'unchanged-package',
        name: 'Unchanged package'
      }
    ]
    const updatedEntry = registryEntry()
    ;(updatedEntry.server as Record<string, unknown>).version = '2.0.0'
    const delta = parseMcpRegistryPage({
      servers: [updatedEntry], metadata: { count: 1 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' })

    const snapshot = mergeMcpRegistryDelta(existing, [delta], {
      sourceId: 'mcp-registry', revision: 'registry-r2', generatedAt: NOW
    })

    expect(snapshot.packages.find((item) => item.id === mcpRegistryPackageId('com.example/weather'))?.version)
      .toBe('2.0.0')
    expect(snapshot.packages.some((item) => item.id === 'unchanged-package')).toBe(true)
  })

  it('removes a deleted latest server even when the cached version differs', () => {
    const current = parseMcpRegistryPage({
      servers: [registryEntry()], metadata: { count: 1 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' })
      .upserts[0]!
    const snapshot = mergeMcpRegistryDelta([current], [{
      upserts: [],
      removals: [{ id: current.id, version: '9.9.9' }]
    }], { sourceId: 'mcp-registry', revision: 'registry-r3' })

    expect(snapshot.packages).toEqual([])
  })

  it('rejects insecure endpoints, cursor type confusion, and duplicate server updates', () => {
    const insecure = registryEntry()
    ;((insecure.server as Record<string, unknown>).remotes as Array<Record<string, unknown>>)[0]!.url =
      'http://mcp.example.com/mcp'
    expect(() => parseMcpRegistryPage({
      servers: [insecure], metadata: { count: 1 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' }))
      .toThrow(/HTTPS|endpoint/i)

    expect(() => parseMcpRegistryPage({
      servers: [], metadata: { count: 0, nextCursor: 42 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' }))
      .toThrow(/cursor/i)

    expect(() => parseMcpRegistryPage({
      servers: [registryEntry(), registryEntry()], metadata: { count: 2 }
    }, { sourceId: 'mcp-registry', registryUrl: 'https://registry.modelcontextprotocol.io/v0.1/servers' }))
      .toThrow(/duplicate/i)
  })
})
