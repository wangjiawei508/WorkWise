import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogSourceV1 } from '../../shared/marketplace'
import { mcpRegistryPackageId } from './marketplace-catalog-adapters'
import { MarketplaceCatalogService } from './marketplace-catalog-service'

const roots: string[] = []
const NOW = '2026-08-08T08:00:00.000Z'
const NEXT = '2026-08-08T09:00:00.000Z'
const COMMIT = 'a'.repeat(40)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-catalog-adapter-sync-'))
  roots.push(root)
  return root
}

function codexMarketplace(name = 'review-tools'): Record<string, unknown> {
  return {
    name: 'team-marketplace',
    interface: { displayName: 'Team Marketplace' },
    plugins: [{
      name,
      source: { source: 'local', path: `./plugins/${name}` },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Developer Tools'
    }]
  }
}

function localSource(id: string, location: string): CatalogSourceV1 {
  return {
    schemaVersion: 1,
    id,
    name: id,
    type: 'local',
    scope: 'user',
    location,
    trust: 'unverified',
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

function githubSource(id: string): CatalogSourceV1 {
  return {
    schemaVersion: 1,
    id,
    name: id,
    type: 'github',
    scope: 'team',
    location: 'https://github.com/example/plugins',
    owner: 'example',
    repository: 'plugins',
    defaultBranch: 'main',
    trust: 'unverified',
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

function gitSource(id: string): CatalogSourceV1 {
  return {
    schemaVersion: 1,
    id,
    name: id,
    type: 'git',
    scope: 'team',
    location: 'https://git.example.test/team/plugins.git',
    defaultBranch: 'main',
    trust: 'unverified',
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

function registrySource(id: string): CatalogSourceV1 {
  return {
    schemaVersion: 1,
    id,
    name: id,
    type: 'mcp-registry',
    scope: 'team',
    location: 'https://registry.modelcontextprotocol.io/v0.1/servers',
    registry: 'official',
    trust: 'unverified',
    searchable: true,
    auth: { type: 'none' },
    sync: {
      mode: 'watched',
      state: 'idle',
      mirroredByDefault: false,
      installedByDefault: false
    }
  }
}

function registryEntry(
  name: string,
  version: string,
  status: 'active' | 'deprecated' | 'deleted' = 'active'
): Record<string, unknown> {
  return {
    server: {
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name,
      title: name,
      description: `${name} server`,
      version,
      remotes: [{ type: 'streamable-http', url: `https://${name.split('/')[0]}.example.test/mcp` }]
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status,
        statusChangedAt: NOW,
        publishedAt: NOW,
        updatedAt: NOW,
        isLatest: true
      }
    }
  }
}

function response(value: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) }
  })
}

describe('MarketplaceCatalogService external adapters', () => {
  it('auto-detects a local Codex marketplace and caches the adapted snapshot', async () => {
    const rootDirectory = await tempRoot()
    const path = join(rootDirectory, 'marketplace.json')
    await writeFile(path, JSON.stringify(codexMarketplace()))
    const service = new MarketplaceCatalogService({ rootDirectory, now: () => new Date(NOW) })
    await service.upsertSource(localSource('local-codex', path))

    const result = await service.syncSource('local-codex')

    expect(result).toMatchObject({ status: 'synced', stale: false })
    expect(result.snapshot?.packages[0]).toMatchObject({
      name: 'review-tools',
      categories: ['Developer Tools'],
      source: { catalogSourceId: 'local-codex', kind: 'local' }
    })
    expect((await service.getSnapshot('local-codex'))?.packages[0]?.name).toBe('review-tools')
  })

  it('resolves a GitHub branch to an immutable commit before downloading the Codex marketplace', async () => {
    const rootDirectory = await tempRoot()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('api.github.com/repos/example/plugins/commits/main')) {
        return response({ sha: COMMIT })
      }
      expect(url).toBe(
        `https://raw.githubusercontent.com/example/plugins/${COMMIT}/.agents/plugins/marketplace.json`
      )
      return response(codexMarketplace(), { etag: '"codex-r1"' })
    })
    const service = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => new Date(NOW)
    })
    await service.upsertSource(githubSource('github-codex'))

    const first = await service.syncSource('github-codex')
    const second = await service.syncSource('github-codex')

    expect(first).toMatchObject({ status: 'synced', snapshot: { commit: COMMIT } })
    expect(second).toMatchObject({ status: 'unchanged', snapshot: { commit: COMMIT } })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((await service.listSources()).find((source) => source.id === 'github-codex')?.sync.commit)
      .toBe(COMMIT)
  })

  it('uses the pinned GitHub Contents API for private catalogs without persisting the token', async () => {
    const rootDirectory = await tempRoot()
    const secret = 'github-private-token'
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${secret}`)
      if (url.includes('/commits/main')) return response({ sha: COMMIT })
      expect(url).toContain('/contents/.agents/plugins/marketplace.json')
      expect(new URL(url).searchParams.get('ref')).toBe(COMMIT)
      return response({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(codexMarketplace('private-tools'))).toString('base64')
      })
    })
    const service = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock as unknown as typeof fetch,
      resolveSecret: async () => secret,
      now: () => new Date(NOW)
    })
    const source = githubSource('github-private')
    source.auth = { type: 'token', secretKey: 'catalog.github-private.token' }
    await service.upsertSource(source)

    const result = await service.syncSource('github-private')

    expect(result.snapshot?.packages[0]?.name).toBe('private-tools')
    expect(JSON.stringify(await service.listSources())).not.toContain(secret)
  })

  it('reads a generic Git catalog through argument-array git commands pinned to FETCH_HEAD', async () => {
    const rootDirectory = await tempRoot()
    const calls: string[][] = []
    const runGit = vi.fn(async (args: string[]) => {
      calls.push(args)
      if (args.includes('rev-parse')) return COMMIT + '\n'
      if (args.includes('show')) return JSON.stringify(codexMarketplace('git-tools'))
      return ''
    })
    const service = new MarketplaceCatalogService({
      rootDirectory,
      runGit,
      now: () => new Date(NOW)
    })
    await service.upsertSource(gitSource('generic-git'))

    const first = await service.syncSource('generic-git')
    const second = await service.syncSource('generic-git')

    expect(first).toMatchObject({ status: 'synced', snapshot: { commit: COMMIT } })
    expect(second).toMatchObject({ status: 'unchanged' })
    expect(calls.some((args) => args.includes('fetch') && args.includes('refs/heads/main'))).toBe(true)
    expect(calls.filter((args) => args.includes('show'))).toHaveLength(1)
    expect(calls.every((args) => Array.isArray(args) && args.every((arg) => typeof arg === 'string')))
      .toBe(true)
  })

  it('reports malformed Git catalog content as failed instead of offline', async () => {
    const rootDirectory = await tempRoot()
    let commit = COMMIT
    let malformed = false
    const runGit = vi.fn(async (args: string[]) => {
      if (args.includes('rev-parse')) return commit + '\n'
      if (args.includes('show')) return malformed ? '{' : JSON.stringify(codexMarketplace())
      return ''
    })
    const service = new MarketplaceCatalogService({
      rootDirectory,
      runGit,
      now: () => new Date(NOW)
    })
    await service.upsertSource(gitSource('git-malformed'))
    await service.syncSource('git-malformed')
    commit = 'b'.repeat(40)
    malformed = true

    const result = await service.syncSource('git-malformed')

    expect(result).toMatchObject({
      status: 'failed',
      stale: true,
      error: expect.stringMatching(/JSON/i)
    })
  })

  it('paginates the MCP Registry then applies updated_since deletions incrementally', async () => {
    const rootDirectory = await tempRoot()
    let currentTime = NOW
    let phase = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (phase === 0 && !url.searchParams.has('cursor')) {
        expect(url.searchParams.get('version')).toBe('latest')
        expect(url.searchParams.get('limit')).toBe('100')
        return response({
          servers: [registryEntry('com.first/server', '1.0.0')],
          metadata: { count: 1, nextCursor: 'page-2' }
        })
      }
      if (phase === 0) {
        expect(url.searchParams.get('cursor')).toBe('page-2')
        phase = 1
        return response({
          servers: [registryEntry('com.second/server', '1.0.0')],
          metadata: { count: 1 }
        })
      }
      expect(url.searchParams.get('updated_since')).toBe(NOW)
      expect(url.searchParams.get('include_deleted')).toBe('true')
      expect(url.searchParams.has('version')).toBe(false)
      return response({
        servers: [
          registryEntry('com.first/server', '1.0.0', 'deleted'),
          registryEntry('com.second/server', '2.0.0')
        ],
        metadata: { count: 2 }
      })
    })
    const service = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => new Date(currentTime)
    })
    await service.upsertSource(registrySource('registry-sync'))
    const initial = await service.syncSource('registry-sync')
    currentTime = NEXT

    const incremental = await service.syncSource('registry-sync')

    expect(initial.snapshot?.packages).toHaveLength(2)
    expect(incremental).toMatchObject({ status: 'synced', stale: false })
    expect(incremental.snapshot?.packages).toHaveLength(1)
    expect(incremental.snapshot?.packages[0]).toMatchObject({
      id: mcpRegistryPackageId('com.second/server'),
      version: '2.0.0'
    })
  })

  it('rejects cursor loops without replacing the last trusted Registry snapshot', async () => {
    const rootDirectory = await tempRoot()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        servers: [registryEntry('com.cached/server', '1.0.0')], metadata: { count: 1 }
      }))
      .mockImplementation(async () => response({
        servers: [], metadata: { count: 0, nextCursor: 'same-cursor' }
      })) as unknown as typeof fetch
    const service = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock,
      now: () => new Date(NOW)
    })
    await service.upsertSource(registrySource('registry-loop'))
    await service.syncSource('registry-loop')

    const result = await service.syncSource('registry-loop')

    expect(result).toMatchObject({
      status: 'failed',
      stale: true,
      error: expect.stringMatching(/cursor.*loop/i)
    })
    expect(result.snapshot?.packages[0]?.name).toBe('com.cached/server')
  })

  it('stores the Registry request start as the incremental synchronization watermark', async () => {
    const rootDirectory = await tempRoot()
    let currentTime = NOW
    const fetchMock = vi.fn(async () => {
      currentTime = NEXT
      return response({
        servers: [registryEntry('com.watermark/server', '1.0.0')],
        metadata: { count: 1 }
      })
    })
    const service = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => new Date(currentTime)
    })
    await service.upsertSource(registrySource('registry-watermark'))

    await service.syncSource('registry-watermark')

    expect((await service.listSources()).find((source) => source.id === 'registry-watermark')?.sync)
      .toMatchObject({ lastSyncedAt: NOW })
  })

  it('performs a full Registry sync when the trusted cache is missing', async () => {
    const rootDirectory = await tempRoot()
    const urls: URL[] = []
    let call = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input)))
      call += 1
      return response({
        servers: [registryEntry(`com.full/server-${call}`, '1.0.0')],
        metadata: { count: 1 }
      })
    })
    const first = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => new Date(NOW)
    })
    await first.upsertSource(registrySource('registry-cache-loss'))
    await first.syncSource('registry-cache-loss')
    await rm(join(rootDirectory, 'snapshots'), { recursive: true, force: true })

    const reloaded = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock as unknown as typeof fetch,
      now: () => new Date(NEXT)
    })
    const result = await reloaded.syncSource('registry-cache-loss')

    expect(urls[1]?.searchParams.get('version')).toBe('latest')
    expect(urls[1]?.searchParams.has('updated_since')).toBe(false)
    expect(result.snapshot?.packages[0]?.name).toBe('com.full/server-2')
  })

  it('keeps the Registry snapshot revision stable when no package changed', async () => {
    const rootDirectory = await tempRoot()
    let currentTime = NOW
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        servers: [registryEntry('com.stable/server', '1.0.0')], metadata: { count: 1 }
      }))
      .mockResolvedValueOnce(response({ servers: [], metadata: { count: 0 } })) as unknown as typeof fetch
    const service = new MarketplaceCatalogService({
      rootDirectory,
      fetch: fetchMock,
      now: () => new Date(currentTime)
    })
    await service.upsertSource(registrySource('registry-stable'))
    const first = await service.syncSource('registry-stable')
    currentTime = NEXT

    const second = await service.syncSource('registry-stable')

    expect(second.status).toBe('unchanged')
    expect(second.snapshot?.revision).toBe(first.snapshot?.revision)
    expect((await service.listSources()).find((source) => source.id === 'registry-stable')?.sync)
      .toMatchObject({ lastSyncedAt: NEXT })
  })
})
