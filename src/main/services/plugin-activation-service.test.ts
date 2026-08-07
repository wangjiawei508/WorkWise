import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstalledPackageV1, MarketplacePackageV1 } from '../../shared/marketplace'
import { activatePluginPackage } from './plugin-activation-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<{ item: MarketplacePackageV1; installed: InstalledPackageV1 }> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-plugin-activation-'))
  roots.push(root)
  const packageRoot = join(root, 'node_modules', '@example', 'server')
  await mkdir(join(packageRoot, 'dist'), { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@example/server',
    version: '1.2.3',
    bin: { 'example-mcp': 'dist/server.js' }
  }))
  await writeFile(join(packageRoot, 'dist', 'server.js'), 'console.log("ready")\n')
  const source = {
    id: 'source-1',
    catalogSourceId: 'official',
    kind: 'npm' as const,
    location: 'https://www.npmjs.com/package/@example/server',
    packageName: '@example/server',
    version: '1.2.3',
    resolvedRef: '1.2.3',
    digest: { algorithm: 'sha512-sri' as const, value: 'sha512-dGVzdA==' }
  }
  const item: MarketplacePackageV1 = {
    schemaVersion: 1,
    id: 'example-server',
    name: 'Example Server',
    summary: 'Activation fixture.',
    tier: 'recommended',
    version: '1.2.3',
    publisher: { id: 'example', name: 'Example', verified: true },
    license: 'MIT',
    source,
    sources: [source],
    components: [{
      id: 'example-mcp',
      name: 'Example MCP',
      type: 'mcp',
      sourceId: source.id,
      runtime: {
        kind: 'npm',
        packageName: source.packageName,
        version: source.version,
        executable: 'example-mcp',
        args: ['--root', '${workspaceRoot}'],
        install: { strategy: 'managed-download', verify: 'sri-before-activation', digestSource: 'component-source' }
      }
    }],
    permissions: [{
      id: 'filesystem.read',
      kind: 'filesystem',
      access: 'read',
      default: 'review',
      reviewRequired: true,
      description: 'Read workspace files.'
    }],
    auth: { type: 'token', provider: 'example', environmentVariables: ['EXAMPLE_TOKEN'] },
    licenseEvidence: [],
    dependencies: [],
    updatePolicy: { strategy: 'pinned', channel: 'stable', allowMajor: false },
    compatibility: { workwise: '>=0.3.5', platforms: ['darwin', 'win32', 'linux'], architectures: ['arm64', 'x64'] },
    availability: { status: 'available' },
    installation: { mode: 'direct-mirror', installedByDefault: false, reinstallable: true }
  }
  const installed: InstalledPackageV1 = {
    schemaVersion: 1,
    packageId: item.id,
    version: item.version,
    license: item.license,
    reviewSha256: 'a'.repeat(64),
    source,
    sources: [source],
    components: [{ componentId: 'example-mcp', sourceId: source.id }],
    scope: 'workspace',
    artifact: { sha256: 'b'.repeat(64), location: root, fileCount: 2, totalBytes: 20 },
    permissions: [{ permissionId: 'filesystem.read', decision: 'granted' }],
    timestamps: { installedAt: '2026-08-08T00:00:00.000Z' },
    updatePolicy: item.updatePolicy,
    rollback: { available: false },
    health: { status: 'healthy' }
  }
  return { item, installed }
}

describe('activatePluginPackage', () => {
  it('activates verified npm entrypoints in MCP V2 without shell command strings', async () => {
    const { item, installed } = await fixture()
    const save = vi.fn(async ({ config }) => ({ ...config, revision: 1 }))
    const mcpConfigService = { list: vi.fn(async () => []), save }

    await activatePluginPackage({
      item,
      installed,
      workspaceRoot: '/tmp/workspace',
      mcpConfigService: mcpConfigService as never,
      idempotencyKey: 'activate-example'
    })

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        id: 'example-mcp',
        transport: 'stdio',
        command: process.platform === 'win32' ? 'node.exe' : 'node',
        args: [expect.stringMatching(/dist[/\\]server\.js$/), '--root', '/tmp/workspace'],
        credentialEnvironmentVariables: ['EXAMPLE_TOKEN'],
        enabled: true
      })
    }))
  })

  it('keeps the MCP server disabled when a declared permission is denied', async () => {
    const { item, installed } = await fixture()
    installed.permissions = [{ permissionId: 'filesystem.read', decision: 'denied' }]
    const save = vi.fn(async ({ config }) => ({ ...config, revision: 1 }))

    await activatePluginPackage({
      item,
      installed,
      workspaceRoot: '/tmp/workspace',
      mcpConfigService: { list: vi.fn(async () => []), save } as never,
      idempotencyKey: 'activate-denied'
    })

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ enabled: false })
    }))
  })
})
