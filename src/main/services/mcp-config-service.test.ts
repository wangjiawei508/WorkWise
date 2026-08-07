import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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
  it('exports credentials only as process environment values with placeholder config references', async () => {
    const key = 0x2a
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
    const saved = await service.save({
      config: config({ credentialEnvironmentVariables: ['DOCS_API_TOKEN'] }),
      expectedRevision: 0,
      idempotencyKey: 'save-runtime-export'
    })
    await service.setCredential({
      serverId: saved.id,
      workspaceRoot: workspace,
      accessToken: 'runtime-only-secret',
      expectedRevision: saved.revision,
      idempotencyKey: 'credential-runtime-export'
    })

    const snapshot = await service.runtimeSnapshot()
    const serialized = JSON.stringify(snapshot.servers)
    expect(serialized).not.toContain('runtime-only-secret')
    expect(snapshot.servers.docs).toMatchObject({
      transport: 'stdio',
      env: { DOCS_API_TOKEN: expect.stringMatching(/^\$\{WORKWISE_MCP_SECRET_[A-F0-9]+\}$/) }
    })
    expect(Object.values(snapshot.environment)).toContain('runtime-only-secret')
  })

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

  it('serializes concurrent MCP manifest mutations without losing independent servers', async () => {
    const service = new McpConfigService({ manifestPath: join(root, 'mcp-v2.json') })
    await Promise.all([
      service.save({
        config: config({ id: 'first', name: 'First', scope: 'global', workspaceRoot: undefined, cwd: undefined }),
        expectedRevision: 0,
        idempotencyKey: 'save-first'
      }),
      service.save({
        config: config({ id: 'second', name: 'Second', scope: 'global', workspaceRoot: undefined, cwd: undefined }),
        expectedRevision: 0,
        idempotencyKey: 'save-second'
      })
    ])

    expect((await service.list()).map((server) => server.id).sort()).toEqual(['first', 'second'])
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

  it('discovers protected resource metadata and dynamically registers a public PKCE client', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp') {
        return new Response(JSON.stringify({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://auth.example.com/tenant']
        }), { status: 200 })
      }
      if (url === 'https://auth.example.com/.well-known/oauth-authorization-server/tenant') {
        return new Response(JSON.stringify({
          issuer: 'https://auth.example.com/tenant',
          authorization_endpoint: 'https://auth.example.com/tenant/authorize',
          token_endpoint: 'https://auth.example.com/tenant/token',
          registration_endpoint: 'https://auth.example.com/tenant/register',
          scopes_supported: ['mcp.tools', 'mcp.resources'],
          code_challenge_methods_supported: ['S256']
        }), { status: 200 })
      }
      if (url === 'https://auth.example.com/tenant/register') {
        expect(init?.method).toBe('POST')
        const request = JSON.parse(String(init?.body)) as Record<string, unknown>
        expect(request).toMatchObject({
          client_name: 'WorkWise',
          token_endpoint_auth_method: 'none',
          redirect_uris: ['http://127.0.0.1:43119/callback']
        })
        expect(JSON.stringify(request)).not.toMatch(/secret/i)
        return new Response(JSON.stringify({
          client_id: 'dynamic-workwise-client',
          token_endpoint_auth_method: 'none'
        }), { status: 201 })
      }
      throw new Error('Unexpected OAuth request: ' + url)
    })
    const service = new McpConfigService({
      manifestPath: join(root, 'mcp-v2.json'),
      credentialRoot: join(root, 'credentials'),
      fetch: fetchMock as typeof fetch
    })

    const saved = await service.save({
      config: config({
        transport: 'http',
        command: undefined,
        args: undefined,
        cwd: undefined,
        url: 'https://mcp.example.com/mcp',
        oauth: {
          resource: 'https://mcp.example.com/mcp',
          redirectUri: 'http://127.0.0.1:43119/callback',
          scopes: []
        }
      }),
      expectedRevision: 0,
      idempotencyKey: 'discover-oauth'
    })

    expect(saved.oauth).toMatchObject({
      authorizationUrl: 'https://auth.example.com/tenant/authorize',
      tokenUrl: 'https://auth.example.com/tenant/token',
      registrationUrl: 'https://auth.example.com/tenant/register',
      clientId: 'dynamic-workwise-client',
      scopes: ['mcp.tools', 'mcp.resources'],
      discovery: {
        protectedResourceMetadataUrl: 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
        authorizationServerMetadataUrl: 'https://auth.example.com/.well-known/oauth-authorization-server/tenant',
        codeChallengeMethodsSupported: ['S256'],
        clientRegistration: 'dynamic'
      }
    })
    const started = await service.authorize({ serverId: 'docs', workspaceRoot: workspace })
    const authorizationUrl = new URL(started.authorizationUrl!)
    expect(authorizationUrl.searchParams.get('resource')).toBe('https://mcp.example.com/mcp')
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('rejects OAuth discovery that does not advertise S256 PKCE', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('oauth-protected-resource')) {
        return new Response(JSON.stringify({
          resource: 'https://mcp.example.com/mcp',
          authorization_servers: ['https://auth.example.com']
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
        code_challenge_methods_supported: ['plain']
      }), { status: 200 })
    })
    const service = new McpConfigService({
      manifestPath: join(root, 'mcp-v2.json'),
      fetch: fetchMock as typeof fetch
    })

    await expect(service.save({
      config: config({
        transport: 'http',
        command: undefined,
        cwd: undefined,
        url: 'https://mcp.example.com/mcp',
        oauth: {
          resource: 'https://mcp.example.com/mcp',
          redirectUri: 'http://127.0.0.1:43119/callback',
          scopes: []
        }
      }),
      expectedRevision: 0,
      idempotencyKey: 'reject-plain-pkce'
    })).rejects.toThrow(/S256 PKCE/i)
  })

  it('rejects insecure non-loopback HTTP endpoints', async () => {
    const service = new McpConfigService({ manifestPath: join(root, 'mcp-v2.json') })
    await expect(service.save({
      config: config({ transport: 'http', command: undefined, url: 'http://example.com/mcp' }),
      expectedRevision: 0,
      idempotencyKey: 'unsafe-http'
    })).rejects.toMatchObject({ code: 'unsafe_url' })
  })

  it('stores manually supplied MCP tokens only in encrypted credential files', async () => {
    const key = 0x33
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
    const server = await service.save({
      config: config({
        transport: 'http',
        command: undefined,
        args: undefined,
        cwd: undefined,
        url: 'https://api.githubcopilot.com/mcp/'
      }),
      expectedRevision: 0,
      idempotencyKey: 'save-token-server'
    })
    const request = {
      serverId: server.id,
      workspaceRoot: workspace,
      accessToken: 'github-super-secret-token',
      expectedRevision: server.revision,
      idempotencyKey: 'set-token'
    }

    const saved = await service.setCredential(request)
    const replayed = await service.setCredential(request)

    expect(replayed).toEqual(saved)
    expect(saved.credentialRef?.storage).toBe('keychain')
    const manifest = await readFile(join(root, 'mcp-v2.json'), 'utf8')
    expect(manifest).not.toContain('github-super-secret-token')
    const credentialFiles = await readdir(join(root, 'credentials'))
    expect(credentialFiles).toHaveLength(1)
    const credential = await readFile(join(root, 'credentials', credentialFiles[0]!), 'utf8')
    expect(credential).not.toContain('github-super-secret-token')
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
