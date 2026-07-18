import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { safeStorage } from 'electron'
import type {
  McpCredentialReferenceV1,
  McpServerConfigV2,
  McpServerStatusV1
} from '../../shared/agent-workbench'
import { atomicWriteFile, readRecoveredFile } from './durable-file'
import { canonicalizeContainmentRoot, resolveContainedPath } from './canonical-containment'

const execFileAsync = promisify(execFile)

type McpManifestV2 = {
  schema: 'workwise.mcp-servers'
  version: 2
  revision: number
  servers: McpServerConfigV2[]
  mutationKeys: Record<string, string>
}

type CredentialPayload = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  tokenType?: string
}

type EncryptionAdapter = {
  available(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
  storage: McpCredentialReferenceV1['storage']
}

type PendingOAuth = {
  serverId: string
  state: string
  verifier: string
  createdAt: number
}

export type SaveMcpServerRequest = {
  config: Omit<McpServerConfigV2, 'revision'> & { revision?: number }
  expectedRevision: number
  idempotencyKey: string
}

export type AuthorizeMcpServerRequest = {
  serverId: string
  workspaceRoot?: string
  state?: string
  authorizationCode?: string
}

function emptyManifest(): McpManifestV2 {
  return {
    schema: 'workwise.mcp-servers',
    version: 2,
    revision: 0,
    servers: [],
    mutationKeys: {}
  }
}

function base64Url(value: Buffer): string {
  return value.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function defaultEncryption(): EncryptionAdapter {
  return {
    available: () => {
      try {
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    },
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
    storage: process.platform === 'darwin' ? 'keychain' : process.platform === 'win32' ? 'dpapi' : 'safe-storage'
  }
}

function assertHttpUrl(value: string, label: string): URL {
  const parsed = new URL(value)
  if (parsed.username || parsed.password) throw Object.assign(new Error(`${label} must not contain URL credentials.`), { code: 'unsafe_url' })
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw Object.assign(new Error(`${label} must use HTTPS, except for loopback development servers.`), { code: 'unsafe_url' })
  }
  return parsed
}

function assertRedirectUri(value: string): URL {
  const parsed = new URL(value)
  if (parsed.protocol === 'workwise:') return parsed
  return assertHttpUrl(value, 'OAuth redirect URL')
}

function normalizedManifest(value: unknown): McpManifestV2 {
  if (!value || typeof value !== 'object') return emptyManifest()
  const raw = value as Partial<McpManifestV2>
  if (raw.schema !== 'workwise.mcp-servers' || raw.version !== 2 || !Array.isArray(raw.servers)) return emptyManifest()
  return {
    schema: 'workwise.mcp-servers',
    version: 2,
    revision: Number.isInteger(raw.revision) ? raw.revision! : 0,
    servers: raw.servers,
    mutationKeys: raw.mutationKeys && typeof raw.mutationKeys === 'object' ? raw.mutationKeys : {}
  }
}

export class McpConfigService {
  private readonly manifestPath: string
  private readonly legacyPath: string
  private readonly credentialRoot: string
  private readonly encryption: EncryptionAdapter
  private readonly sessionCredentials = new Map<string, CredentialPayload>()
  private readonly pendingOAuth = new Map<string, PendingOAuth>()

  constructor(options: {
    manifestPath?: string
    legacyPath?: string
    credentialRoot?: string
    encryption?: EncryptionAdapter
  } = {}) {
    this.manifestPath = resolve(options.manifestPath ?? join(homedir(), '.workwise', 'mcp-v2.json'))
    this.legacyPath = resolve(options.legacyPath ?? join(dirname(this.manifestPath), 'mcp.json'))
    this.credentialRoot = resolve(options.credentialRoot ?? join(homedir(), '.workwise', 'credentials', 'mcp'))
    this.encryption = options.encryption ?? defaultEncryption()
  }

  async list(workspaceRoot?: string): Promise<McpServerConfigV2[]> {
    const manifest = await this.read()
    const canonicalWorkspace = workspaceRoot ? await canonicalizeContainmentRoot(workspaceRoot) : undefined
    return manifest.servers.filter((server) =>
      server.scope === 'global' || (canonicalWorkspace && server.workspaceRoot === canonicalWorkspace)
    )
  }

  async save(request: SaveMcpServerRequest): Promise<McpServerConfigV2> {
    const manifest = await this.read()
    const previousId = manifest.mutationKeys[request.idempotencyKey]
    if (previousId) {
      const previous = manifest.servers.find((server) => server.id === previousId)
      if (previous) return previous
    }
    const index = manifest.servers.findIndex((server) => server.id === request.config.id)
    const current = index >= 0 ? manifest.servers[index]! : null
    const revision = current?.revision ?? 0
    if (revision !== request.expectedRevision) {
      throw Object.assign(new Error('MCP server revision conflict.'), { code: 'stale_request' })
    }
    const workspaceRoot = request.config.scope === 'workspace'
      ? await canonicalizeContainmentRoot(request.config.workspaceRoot ?? '')
      : undefined
    let canonicalCwd: string | undefined
    if (request.config.transport === 'stdio') {
      if (!request.config.command?.trim()) throw Object.assign(new Error('stdio MCP server requires a command.'), { code: 'invalid_state' })
      if (request.config.cwd) {
        if (!workspaceRoot) throw Object.assign(new Error('stdio cwd requires workspace scope.'), { code: 'unsafe_path' })
        canonicalCwd = await canonicalizeContainmentRoot(request.config.cwd)
        await resolveContainedPath({ root: workspaceRoot, target: canonicalCwd, allowRoot: true, mustExist: true, expect: 'directory' })
      }
    } else {
      if (!request.config.url) throw Object.assign(new Error('HTTP MCP server requires a URL.'), { code: 'invalid_state' })
      assertHttpUrl(request.config.url, 'MCP server URL')
    }
    if (request.config.oauth) {
      assertHttpUrl(request.config.oauth.authorizationUrl, 'OAuth authorization URL')
      assertHttpUrl(request.config.oauth.tokenUrl, 'OAuth token URL')
      assertRedirectUri(request.config.oauth.redirectUri)
    }
    const next: McpServerConfigV2 = {
      ...request.config,
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(canonicalCwd ? { cwd: canonicalCwd } : {}),
      timeoutMs: Math.min(Math.max(request.config.timeoutMs, 1_000), 120_000),
      revision: revision + 1
    }
    const servers = [...manifest.servers]
    if (index >= 0) servers[index] = next
    else servers.push(next)
    const mutationKeys = { ...manifest.mutationKeys, [request.idempotencyKey]: next.id }
    const trimmedKeys = Object.fromEntries(Object.entries(mutationKeys).slice(-256))
    await this.write({ ...manifest, revision: manifest.revision + 1, servers, mutationKeys: trimmedKeys })
    return next
  }

  async test(serverId: string, workspaceRoot?: string): Promise<McpServerStatusV1> {
    const server = (await this.list(workspaceRoot)).find((entry) => entry.id === serverId)
    if (!server) return { id: serverId, state: 'error', authorized: false, message: 'MCP server was not found.' }
    const startedAt = Date.now()
    try {
      if (server.transport === 'stdio') {
        if (server.cwd && server.workspaceRoot) {
          const cwd = await canonicalizeContainmentRoot(server.cwd)
          await resolveContainedPath({ root: server.workspaceRoot, target: cwd, allowRoot: true, mustExist: true, expect: 'directory' })
        }
        const lookup = process.platform === 'win32' ? ['where', [server.command!]] as const : ['which', [server.command!]] as const
        await execFileAsync(lookup[0], lookup[1], { timeout: Math.min(server.timeoutMs, 10_000), windowsHide: true })
        return { id: server.id, state: 'connected', authorized: true, latencyMs: Date.now() - startedAt }
      }
      const credential = await this.readCredential(server.credentialRef)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), server.timeoutMs)
      const response = await fetch(server.url!, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: credential ? { Authorization: `${credential.tokenType ?? 'Bearer'} ${credential.accessToken}` } : undefined
      }).finally(() => clearTimeout(timer))
      if (response.status === 401 || response.status === 403) {
        return { id: server.id, state: 'needs_authorization', authorized: false, latencyMs: Date.now() - startedAt, message: 'Authorization is required.' }
      }
      return { id: server.id, state: 'connected', authorized: Boolean(credential || !server.oauth), latencyMs: Date.now() - startedAt }
    } catch (error) {
      return {
        id: server.id,
        state: server.oauth && !(await this.readCredential(server.credentialRef)) ? 'needs_authorization' : 'error',
        authorized: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async authorize(request: AuthorizeMcpServerRequest): Promise<McpServerStatusV1> {
    const server = (await this.list(request.workspaceRoot)).find((entry) => entry.id === request.serverId)
    if (!server) return { id: request.serverId, state: 'error', authorized: false, message: 'MCP server was not found.' }
    if (!server.oauth) return { id: server.id, state: 'connected', authorized: true, message: 'This server does not require OAuth.' }
    if (!request.authorizationCode) {
      const verifier = base64Url(randomBytes(48))
      const challenge = base64Url(createHash('sha256').update(verifier).digest())
      const state = base64Url(randomBytes(24))
      this.pendingOAuth.set(state, { serverId: server.id, state, verifier, createdAt: Date.now() })
      const authorizationUrl = new URL(server.oauth.authorizationUrl)
      authorizationUrl.searchParams.set('response_type', 'code')
      authorizationUrl.searchParams.set('client_id', server.oauth.clientId)
      authorizationUrl.searchParams.set('redirect_uri', server.oauth.redirectUri)
      authorizationUrl.searchParams.set('code_challenge', challenge)
      authorizationUrl.searchParams.set('code_challenge_method', 'S256')
      authorizationUrl.searchParams.set('state', state)
      if (server.oauth.scopes.length > 0) authorizationUrl.searchParams.set('scope', server.oauth.scopes.join(' '))
      return {
        id: server.id,
        state: 'needs_authorization',
        authorized: false,
        authorizationUrl: authorizationUrl.toString(),
        authorizationState: state,
        message: 'Open the authorization URL and return the authorization code.'
      }
    }
    const pending = request.state ? this.pendingOAuth.get(request.state) : undefined
    if (!pending || pending.serverId !== server.id || Date.now() - pending.createdAt > 10 * 60_000) {
      return { id: server.id, state: 'error', authorized: false, message: 'OAuth state is missing or expired.' }
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: request.authorizationCode,
      client_id: server.oauth.clientId,
      redirect_uri: server.oauth.redirectUri,
      code_verifier: pending.verifier
    })
    const response = await fetch(server.oauth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Encoding': 'identity' },
      body
    })
    if (!response.ok) return { id: server.id, state: 'error', authorized: false, message: `OAuth token exchange failed (${response.status}).` }
    const value = await response.json() as Record<string, unknown>
    if (typeof value.access_token !== 'string') return { id: server.id, state: 'error', authorized: false, message: 'OAuth response did not contain an access token.' }
    const credential: CredentialPayload = {
      accessToken: value.access_token,
      ...(typeof value.refresh_token === 'string' ? { refreshToken: value.refresh_token } : {}),
      ...(typeof value.token_type === 'string' ? { tokenType: value.token_type } : {}),
      ...(typeof value.expires_in === 'number' ? { expiresAt: new Date(Date.now() + value.expires_in * 1000).toISOString() } : {})
    }
    const credentialRef = await this.writeCredential(server.id, credential)
    await this.save({
      config: { ...server, credentialRef },
      expectedRevision: server.revision,
      idempotencyKey: `oauth:${server.id}:${pending.state}`
    })
    this.pendingOAuth.delete(pending.state)
    return { id: server.id, state: 'connected', authorized: true, message: 'Authorization completed.' }
  }

  private async writeCredential(serverId: string, credential: CredentialPayload): Promise<McpCredentialReferenceV1> {
    const id = `mcp_${createHash('sha256').update(serverId).digest('hex').slice(0, 24)}`
    if (!this.encryption.available()) {
      this.sessionCredentials.set(id, credential)
      return { id, storage: 'session' }
    }
    await mkdir(this.credentialRoot, { recursive: true })
    const encrypted = this.encryption.encrypt(JSON.stringify(credential)).toString('base64')
    await atomicWriteFile(join(this.credentialRoot, `${id}.json`), `${JSON.stringify({ version: 1, encrypted })}\n`)
    return { id, storage: this.encryption.storage }
  }

  private async readCredential(reference?: McpCredentialReferenceV1): Promise<CredentialPayload | null> {
    if (!reference) return null
    if (reference.storage === 'session') return this.sessionCredentials.get(reference.id) ?? null
    try {
      const raw = JSON.parse(await readRecoveredFile(join(this.credentialRoot, `${reference.id}.json`))) as { encrypted: string }
      return JSON.parse(this.encryption.decrypt(Buffer.from(raw.encrypted, 'base64'))) as CredentialPayload
    } catch {
      return null
    }
  }

  private async read(): Promise<McpManifestV2> {
    try {
      return normalizedManifest(JSON.parse(await readRecoveredFile(this.manifestPath)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.migrateLegacy()
      throw error
    }
  }

  private async migrateLegacy(): Promise<McpManifestV2> {
    let legacy: unknown
    try {
      legacy = JSON.parse(await readRecoveredFile(this.legacyPath))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyManifest()
      return emptyManifest()
    }
    const root = legacy && typeof legacy === 'object' ? legacy as Record<string, unknown> : {}
    const rawServers = root.mcpServers && typeof root.mcpServers === 'object'
      ? root.mcpServers as Record<string, unknown>
      : root.servers && typeof root.servers === 'object'
        ? root.servers as Record<string, unknown>
        : {}
    const servers: McpServerConfigV2[] = []
    for (const [id, value] of Object.entries(rawServers)) {
      if (!value || typeof value !== 'object') continue
      const raw = value as Record<string, unknown>
      const command = typeof raw.command === 'string' ? raw.command.trim() : ''
      const url = typeof raw.url === 'string' ? raw.url.trim() : ''
      if (!command && !url) continue
      if (url) {
        try {
          assertHttpUrl(url, 'MCP server URL')
        } catch {
          continue
        }
      }
      servers.push({
        id,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
        scope: 'global',
        transport: url ? 'http' : 'stdio',
        ...(command ? { command } : {}),
        ...(Array.isArray(raw.args) ? { args: raw.args.filter((item): item is string => typeof item === 'string').slice(0, 256) } : {}),
        ...(url ? { url } : {}),
        timeoutMs: typeof raw.timeoutMs === 'number' ? Math.min(Math.max(raw.timeoutMs, 1_000), 120_000) : 30_000,
        source: 'migration',
        toolPolicy: {},
        enabled: raw.enabled !== false,
        revision: 1
      })
    }
    const migrated: McpManifestV2 = {
      schema: 'workwise.mcp-servers',
      version: 2,
      revision: servers.length > 0 ? 1 : 0,
      servers,
      mutationKeys: {}
    }
    if (servers.length > 0) await this.write(migrated)
    return migrated
  }

  private async write(manifest: McpManifestV2): Promise<void> {
    await mkdir(dirname(this.manifestPath), { recursive: true })
    await atomicWriteFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
}
