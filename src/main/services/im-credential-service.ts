import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { safeStorage } from 'electron'
import type { ImCredentialRefV1, ImCredentialStorageV1 } from '../../shared/im-communication'
import type { ClawImChannelV1 } from '../../shared/app-settings-types'
import { atomicWriteFile, readRecoveredFile } from './durable-file'
import {
  decryptStringWithCredentialHelper,
  encryptStringWithCredentialHelper,
  isCredentialHelperAuthorizationFailure,
  requestInteractiveCredentialHelperAccess
} from './im-credential-helper'

type EncryptionAdapter = {
  available(): boolean
  encrypt(value: string): Buffer | Promise<Buffer>
  decrypt(value: Buffer): string | Promise<string>
  storage: Exclude<ImCredentialStorageV1, 'session'>
}

export const DEFAULT_CREDENTIAL_OPERATION_TIMEOUT_MS = 120_000
export const DEFAULT_CREDENTIAL_RESOLVE_RETRY_DELAY_MS = 250
export const IM_PERSISTENT_CREDENTIAL_REQUIRED_CODE = 'persistent_credential_required'

async function withCredentialOperationTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('IM credential operation timed out.')), timeoutMs)
        timer.unref?.()
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function defaultEncryption(): EncryptionAdapter {
  if (process.platform === 'darwin') {
    return {
      // Querying or decrypting macOS Safe Storage can block Electron's main
      // process while Keychain initializes. Keep that work in a disposable
      // helper so connection recovery cannot freeze the entire GUI.
      available: () => true,
      encrypt: encryptStringWithCredentialHelper,
      decrypt: decryptStringWithCredentialHelper,
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
    encrypt: (value) => safeStorage.encryptStringAsync(value),
    decrypt: async (value) => (await safeStorage.decryptStringAsync(value)).result,
    storage: process.platform === 'win32' ? 'dpapi' : 'safe-storage'
  }
}

function keyId(namespace: string, key: string): string {
  return createHash('sha256').update(`${namespace}\0${key}`).digest('hex')
}

function assertSecret(value: string): string {
  const secret = value.trim()
  if (!secret || secret.includes('\0') || Buffer.byteLength(secret) > 128 * 1024) {
    throw new Error('IM credential is empty or exceeds 128 KiB.')
  }
  return secret
}

export class ImCredentialService {
  private readonly root: string
  private readonly encryption: EncryptionAdapter
  private readonly operationTimeoutMs: number
  private readonly resolveRetryDelayMs: number
  private readonly prepareProtectedStorageRetry: () => void
  private readonly session = new Map<string, string>()
  private readonly pendingResolves = new Map<string, Promise<string | undefined>>()
  private protectedResolveTail: Promise<void> = Promise.resolve()
  private protectedStorageUnavailable = false

  constructor(options: {
    root?: string
    encryption?: EncryptionAdapter
    operationTimeoutMs?: number
    resolveRetryDelayMs?: number
    prepareProtectedStorageRetry?: () => void
  } = {}) {
    this.root = resolve(options.root ?? join(process.cwd(), '.workwise', 'credentials', 'im'))
    this.encryption = options.encryption ?? defaultEncryption()
    this.operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_CREDENTIAL_OPERATION_TIMEOUT_MS
    this.resolveRetryDelayMs = options.resolveRetryDelayMs ?? DEFAULT_CREDENTIAL_RESOLVE_RETRY_DELAY_MS
    this.prepareProtectedStorageRetry = options.prepareProtectedStorageRetry ?? (
      options.encryption ? () => undefined : requestInteractiveCredentialHelperAccess
    )
  }

  getStorage(): ImCredentialStorageV1 {
    return !this.protectedStorageUnavailable && this.encryption.available()
      ? this.encryption.storage
      : 'session'
  }

  async retryProtectedStorage(): Promise<void> {
    const pending = [...this.pendingResolves.values()]
    if (pending.length > 0) await Promise.allSettled(pending)
    this.protectedStorageUnavailable = false
    this.prepareProtectedStorageRetry()
  }

  async set(
    namespace: string,
    key: string,
    value: string,
    options: { unique?: boolean } = {}
  ): Promise<ImCredentialRefV1> {
    const secret = assertSecret(value)
    const id = keyId(namespace, options.unique ? `${key}\0${randomUUID()}` : key)
    this.session.delete(id)
    const createdAt = new Date().toISOString()
    const storage = this.getStorage()
    if (storage === 'session') {
      await rm(join(this.root, `${id}.json`), { force: true }).catch(() => undefined)
      this.session.set(id, secret)
      return { id, storage, createdAt }
    }
    const path = join(this.root, `${id}.json`)
    let previousEnvelope: Buffer | undefined
    try {
      previousEnvelope = await readFile(path)
    } catch {
      // First-time writes have no durable value to restore.
    }
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      const encrypted = (await withCredentialOperationTimeout(
        Promise.resolve(this.encryption.encrypt(secret)),
        this.operationTimeoutMs
      )).toString('base64')
      await atomicWriteFile(
        path,
        `${JSON.stringify({ schema: 'workwise.im-credential', version: 1, encrypted })}\n`
      )
      const verified = await this.resolve({ id, storage, createdAt })
      if (verified !== secret) throw new Error('IM credential write verification failed.')
      return { id, storage, createdAt }
    } catch {
      // Keep a newly authorized channel usable without ever persisting its
      // plaintext when platform protected storage is locked or unavailable.
      // atomicWriteFile only replaces the destination after the complete
      // envelope is written. Preserve an older envelope during a failed
      // rotation or migration so a transient Keychain failure cannot destroy
      // the last durable credential.
      this.protectedStorageUnavailable = true
      if (previousEnvelope) {
        await atomicWriteFile(path, previousEnvelope).catch(() => undefined)
      }
      this.session.set(id, secret)
      return { id, storage: 'session', createdAt }
    }
  }

  async resolve(ref: ImCredentialRefV1): Promise<string | undefined> {
    const cached = this.session.get(ref.id)
    if (cached !== undefined) return cached
    if (ref.storage === 'session') return undefined
    if (!this.encryption.available()) return undefined
    if (this.protectedStorageUnavailable) {
      throw Object.assign(new Error('IM credential storage is temporarily unavailable.'), {
        code: 'credential_unavailable'
      })
    }
    const pendingKey = `${ref.storage}:${ref.id}`
    const pending = this.pendingResolves.get(pendingKey)
    if (pending) return pending
    const operation = this.protectedResolveTail
      .catch(() => undefined)
      .then(async () => {
        const queuedCache = this.session.get(ref.id)
        if (queuedCache !== undefined) return queuedCache
        if (this.protectedStorageUnavailable) {
          throw Object.assign(new Error('IM credential storage is temporarily unavailable.'), {
            code: 'credential_unavailable'
          })
        }
        return this.resolveProtected(ref)
      })
    this.protectedResolveTail = operation.then(() => undefined, () => undefined)
    this.pendingResolves.set(pendingKey, operation)
    void operation.finally(() => {
      if (this.pendingResolves.get(pendingKey) === operation) this.pendingResolves.delete(pendingKey)
    }).catch(() => undefined)
    return operation
  }

  private async resolveProtected(ref: ImCredentialRefV1): Promise<string | undefined> {
    let encrypted: Buffer
    try {
      const parsed = JSON.parse(await readRecoveredFile(join(this.root, `${ref.id}.json`))) as Record<string, unknown>
      if (parsed.schema !== 'workwise.im-credential' || parsed.version !== 1 || typeof parsed.encrypted !== 'string') {
        return undefined
      }
      encrypted = Buffer.from(parsed.encrypted, 'base64')
    } catch {
      return undefined
    }
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const decrypted = await withCredentialOperationTimeout(
          Promise.resolve(this.encryption.decrypt(encrypted)),
          this.operationTimeoutMs
        )
        const secret = assertSecret(decrypted)
        this.session.set(ref.id, secret)
        return secret
      } catch (error) {
        lastError = error
        if (isCredentialHelperAuthorizationFailure(error)) break
        if (attempt === 0 && this.resolveRetryDelayMs > 0) {
          await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, this.resolveRetryDelayMs))
        }
      }
    }
    this.protectedStorageUnavailable = true
    throw Object.assign(new Error('IM credential storage is temporarily unavailable.'), {
      code: 'credential_unavailable',
      cause: lastError
    })
  }

  async remove(ref: ImCredentialRefV1 | undefined): Promise<void> {
    if (!ref) return
    this.session.delete(ref.id)
    await rm(join(this.root, `${ref.id}.json`), { force: true }).catch(() => undefined)
  }

  async migrate(namespace: string, key: string, legacySecret: string, ref?: ImCredentialRefV1): Promise<ImCredentialRefV1> {
    if (ref) {
      const current = await this.resolve(ref)
      if (current) return ref
    }
    return this.set(namespace, key, legacySecret)
  }
}

export async function protectImChannelCredentials(
  channels: readonly ClawImChannelV1[],
  service: ImCredentialService,
  options: {
    requirePersistent?: boolean
    rotate?: boolean
    onProtectedCredential?: (ref: ImCredentialRefV1) => void
  } = {}
): Promise<ClawImChannelV1[]> {
  const results = await Promise.allSettled(channels.map(async (channel) => {
    const credential = channel.platformCredential
    if (credential?.kind === 'feishu' && credential.appSecret?.trim()) {
      if (options.requirePersistent) await service.retryProtectedStorage()
      const ref = await service.set(
        'feishu',
        credential.appId,
        credential.appSecret,
        { unique: options.rotate }
      )
      if (options.requirePersistent && ref.storage === 'session') {
        if (options.rotate) await service.remove(ref)
        throw Object.assign(new Error('Protected IM credential storage must be authorized before this connection can be saved.'), {
          code: IM_PERSISTENT_CREDENTIAL_REQUIRED_CODE
        })
      }
      options.onProtectedCredential?.(ref)
      const { appSecret: _appSecret, ...publicCredential } = credential
      return { ...channel, platformCredential: publicCredential, credentialRef: ref }
    }
    if (credential?.kind === 'weixin' && credential.sessionKey?.trim()) {
      if (options.requirePersistent) await service.retryProtectedStorage()
      const ref = await service.set(
        'weixin',
        credential.accountId,
        credential.sessionKey,
        { unique: options.rotate }
      )
      if (options.requirePersistent && ref.storage === 'session') {
        if (options.rotate) await service.remove(ref)
        throw Object.assign(new Error('Protected IM credential storage must be authorized before this connection can be saved.'), {
          code: IM_PERSISTENT_CREDENTIAL_REQUIRED_CODE
        })
      }
      options.onProtectedCredential?.(ref)
      const { sessionKey: _sessionKey, ...publicCredential } = credential
      return { ...channel, platformCredential: publicCredential, credentialRef: ref }
    }
    return channel
  }))
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed) throw failed.reason
  return results.map((result) => (result as PromiseFulfilledResult<ClawImChannelV1>).value)
}

/**
 * Remove deprecated plaintext channel credentials before crossing the main /
 * renderer IPC boundary. Main-process migration still has access to the
 * original settings object so a failed migration can be retried safely.
 */
export function sanitizeImChannelCredentials(
  channels: readonly ClawImChannelV1[]
): ClawImChannelV1[] {
  return channels.map((channel) => {
    const credential = channel.platformCredential
    if (credential?.kind === 'feishu' && credential.appSecret !== undefined) {
      const { appSecret: _appSecret, ...publicCredential } = credential
      return { ...channel, platformCredential: publicCredential }
    }
    if (credential?.kind === 'weixin' && credential.sessionKey !== undefined) {
      const { sessionKey: _sessionKey, ...publicCredential } = credential
      return { ...channel, platformCredential: publicCredential }
    }
    return channel
  })
}

export function hasLegacyImChannelCredential(channel: ClawImChannelV1): boolean {
  const credential = channel.platformCredential
  return Boolean(
    (credential?.kind === 'feishu' && credential.appSecret?.trim()) ||
    (credential?.kind === 'weixin' && credential.sessionKey?.trim())
  )
}

export async function removeUnreferencedImCredentials(
  previous: readonly Pick<ClawImChannelV1, 'credentialRef'>[],
  next: readonly Pick<ClawImChannelV1, 'credentialRef'>[],
  service: ImCredentialService
): Promise<void> {
  const active = new Set(next.flatMap((channel) => channel.credentialRef
    ? [channel.credentialRef.id]
    : []))
  const stale = new Map<string, ImCredentialRefV1>()
  for (const channel of previous) {
    const ref = channel.credentialRef
    if (!ref) continue
    if (!active.has(ref.id)) stale.set(ref.id, ref)
  }
  await Promise.all([...stale.values()].map((ref) => service.remove(ref)))
}
