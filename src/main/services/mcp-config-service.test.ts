import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServerConfigV2 } from '../../shared/agent-workbench'
import { McpConfigService } from './mcp-config-service'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => ''
  }
}))

let root = ''
let workspace = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'workwise-mcp-config-'))
  workspace = await mkdtemp(join(tmpdir(), 'workwise-mcp-workspace-'))
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all([root, workspace].filter(Boolean).map((path) => rm(path, { recursive: true, force: true })))
})

function config(overrides: Partial<McpServerConfigV2> = {}): Omit<McpServerConfigV2, 'revision'> {
  return {
    id: 'docs',
    name: 'Docs',
    scope: 'workspace',
    workspaceRoot: workspace,
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    cwd: workspace,
    timeoutMs: 5_000,
    source: 'user',
    toolPolicy: { search: 'allow' },
    enabled: true,
    ...overrides
  }
}

describe('McpConfigService', () => {
  it('persists scoped V2 config with revision and idempotency', async () => {
    const service = new McpConfigService({
      manifestPath: join(root, 'mcp-v2.json'),
      credentialRoot: join(root, 'credentials'),
      encryption: {
        available: () => false,
        encrypt: () => Buffer.alloc(0),
        decrypt: () => '',
        storage: 'session'
      }
    })
    const request = { config: config(), expectedRevision: 0, idempotencyKey: 'save-docs' }
    const first = await service.save(request)
    const second = await service.save(request)
    expect(first.revision).toBe(1)
    expect(second).toEqual(first)
    expect(await service.list(workspace)).toEqual([first])
  })

  it('uses Authorization Code + PKCE and stores tokens only in encrypted form', async () => {
    const key = 0x5a
    const service = new McpConfigService({
      manifestPath: join(root, 'mcp-v2.json'),
      credentialRoot: join(root, 'credentials'),
      encryption: {
        available: () => true,
        encrypt: (value) => Buffer.from([...Buffer.from(value)].map((byte) => byte ^ key)),
        decrypt: (value) => Buffer.from([...value].map((byte) => byte ^ key)).toString('utf8'),
        storage: 'keychain'
      }
    })
    await service.save({
      config: config({
        transport: 'http',
        command: undefined,
        args: undefined,
        cwd: undefined,
        url: 'https://mcp.example.com/api',
        oauth: {
          authorizationUrl: 'https://auth.example.com/authorize',
          tokenUrl: 'https://auth.example.com/token',
          clientId: 'workwise-client',
          redirectUri: 'http://127.0.0.1:43119/callback',
          scopes: ['mcp.tools']
        }
      }),
      expectedRevision: 0,
      idempotencyKey: 'save-oauth'
    })
    const started = await service.authorize({ serverId: 'docs', workspaceRoot: workspace })
    const url = new URL(started.authorizationUrl!)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(started.authorizationState).toBeTruthy()

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'super-secret-token',
      refresh_token: 'refresh-secret',
      token_type: 'Bearer',
      expires_in: 3600
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const completed = await service.authorize({
      serverId: 'docs',
      workspaceRoot: workspace,
      state: started.authorizationState,
      authorizationCode: 'authorization-code'
    })
    expect(completed).toMatchObject({ state: 'connected', authorized: true })
    const saved = (await service.list(workspace))[0]!
    expect(saved.credentialRef?.storage).toBe('keychain')
    const credentialFile = await readFile(join(root, 'credentials', `${saved.credentialRef!.id}.json`), 'utf8')
    expect(credentialFile).not.toContain('super-secret-token')
    expect(credentialFile).not.toContain('refresh-secret')
  })

  it('rejects insecure non-loopback HTTP endpoints', async () => {
    const service = new McpConfigService({ manifestPath: join(root, 'mcp-v2.json') })
    await expect(service.save({
      config: config({ transport: 'http', command: undefined, url: 'http://example.com/mcp' }),
      expectedRevision: 0,
      idempotencyKey: 'unsafe-http'
    })).rejects.toMatchObject({ code: 'unsafe_url' })
  })

  it('imports legacy servers without copying plaintext environment credentials', async () => {
    const legacyPath = join(root, 'mcp.json')
    await writeFile(legacyPath, JSON.stringify({
      mcpServers: {
        legacy: {
          command: 'node',
          args: ['legacy.js'],
          env: { API_TOKEN: 'must-not-migrate' }
        }
      }
    }))
    const manifestPath = join(root, 'mcp-v2.json')
    const service = new McpConfigService({ manifestPath, legacyPath })
    const migrated = await service.list()
    expect(migrated[0]).toMatchObject({ id: 'legacy', source: 'migration', transport: 'stdio' })
    expect(await readFile(manifestPath, 'utf8')).not.toContain('must-not-migrate')
  })
})
