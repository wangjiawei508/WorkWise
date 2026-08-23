import { createHash } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { safeStorage } from 'electron'
import type { CatalogCredentialStatusV1 } from '../../shared/marketplace'
import { atomicWriteFile, readRecoveredFile } from './durable-file'
import { isCandidateCredentialAccessAllowed } from '../candidate-runtime'

const MAX_SECRET_KEY_BYTES = 512
const MAX_TOKEN_BYTES = 64 * 1024

export type CatalogCredentialEncryption = {
  available(): boolean
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
  storage: NonNullable<CatalogCredentialStatusV1['storage']>
}

function defaultEncryption(): CatalogCredentialEncryption {
  if (!isCandidateCredentialAccessAllowed()) {
    return {
      available: () => false,
      encrypt: () => { throw new Error('Candidate protected storage access is disabled.') },
      decrypt: () => { throw new Error('Candidate protected storage access is disabled.') },
      storage: 'keychain'
    }
  }
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
    storage: process.platform === 'darwin'
      ? 'keychain'
      : process.platform === 'win32' ? 'dpapi' : 'safe-storage'
  }
}

function normalizedSecretKey(value: string): string {
  const key = value.trim()
  if (!key || key.includes('\0') || Buffer.byteLength(key) > MAX_SECRET_KEY_BYTES) {
    throw new Error('Catalog credential key is invalid.')
  }
  return key
}

function normalizedToken(value: string): string {
  const token = value.trim()
  if (!token || token.includes('\0') || Buffer.byteLength(token) > MAX_TOKEN_BYTES) {
    throw new Error('Catalog credential token is invalid or exceeds 64 KiB.')
  }
  return token
}

function credentialId(secretKey: string): string {
  return `catalog_${createHash('sha256').update(secretKey).digest('hex')}`
}

export class CatalogCredentialService {
  private readonly root: string
  private readonly encryption: CatalogCredentialEncryption
  private readonly session = new Map<string, string>()

  constructor(options: {
    root?: string
    encryption?: CatalogCredentialEncryption
  } = {}) {
    this.root = resolve(options.root ?? join(homedir(), '.workwise', 'credentials', 'catalog'))
    this.encryption = options.encryption ?? defaultEncryption()
  }

  async set(secretKey: string, accessToken: string): Promise<NonNullable<CatalogCredentialStatusV1['storage']>> {
    const key = normalizedSecretKey(secretKey)
    const token = normalizedToken(accessToken)
    const id = credentialId(key)
    if (!this.encryption.available()) {
      await rm(join(this.root, `${id}.json`), { force: true }).catch(() => undefined)
      this.session.set(id, token)
      return 'session'
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const encrypted = this.encryption.encrypt(token).toString('base64')
    await atomicWriteFile(
      join(this.root, `${id}.json`),
      `${JSON.stringify({ schema: 'workwise.catalog-credential', version: 1, encrypted })}\n`
    )
    this.session.delete(id)
    return this.encryption.storage
  }

  async resolve(secretKey: string): Promise<string | undefined> {
    const id = credentialId(normalizedSecretKey(secretKey))
    const session = this.session.get(id)
    if (session) return session
    if (!this.encryption.available()) return undefined
    try {
      const value = JSON.parse(await readRecoveredFile(join(this.root, `${id}.json`))) as {
        schema?: unknown
        version?: unknown
        encrypted?: unknown
      }
      if (value.schema !== 'workwise.catalog-credential' || value.version !== 1 ||
          typeof value.encrypted !== 'string') {
        return undefined
      }
      return normalizedToken(this.encryption.decrypt(Buffer.from(value.encrypted, 'base64')))
    } catch {
      return undefined
    }
  }

  async status(sourceId: string, secretKey: string): Promise<CatalogCredentialStatusV1> {
    const id = credentialId(normalizedSecretKey(secretKey))
    if (this.session.has(id)) return { sourceId, configured: true, storage: 'session' }
    if (!this.encryption.available()) return { sourceId, configured: false }
    const token = await this.resolve(secretKey)
    return token
      ? { sourceId, configured: true, storage: this.encryption.storage }
      : { sourceId, configured: false }
  }

  async remove(secretKey: string): Promise<void> {
    const id = credentialId(normalizedSecretKey(secretKey))
    this.session.delete(id)
    await rm(join(this.root, `${id}.json`), { force: true }).catch(() => undefined)
  }
}
