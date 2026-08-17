import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_CREDENTIAL_OPERATION_TIMEOUT_MS,
  IM_PERSISTENT_CREDENTIAL_REQUIRED_CODE,
  ImCredentialService,
  protectImChannelCredentials,
  removeUnreferencedImCredentials,
  sanitizeImChannelCredentials
} from './im-credential-service'

function encryption(available = true) {
  return {
    available: () => available,
    encrypt: (value: string) => Buffer.from(value, 'utf8'),
    decrypt: (value: Buffer) => value.toString('utf8'),
    storage: 'keychain' as const
  }
}

describe('ImCredentialService', () => {
  it('allows first-run asynchronous platform storage initialization to finish', () => {
    expect(DEFAULT_CREDENTIAL_OPERATION_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000)
  })

  it('writes an encrypted envelope and verifies it before returning a reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-credentials-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const ref = await service.set('weixin', 'account-1', 'secret-token')
    expect(ref.storage).toBe('keychain')
    expect(await service.resolve(ref)).toBe('secret-token')
    expect(await readFile(join(root, `${ref.id}.json`), 'utf8')).not.toContain('secret-token')
  })

  it('uses memory-only storage when platform encryption is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-session-'))
    const service = new ImCredentialService({ root, encryption: encryption(false) })
    const ref = await service.set('feishu', 'app-1', 'app-secret')
    expect(ref.storage).toBe('session')
    expect(await service.resolve(ref)).toBe('app-secret')
    const second = new ImCredentialService({ root, encryption: encryption(false) })
    expect(await second.resolve(ref)).toBeUndefined()
  })

  it('falls back to memory-only storage when protected encryption fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-encryption-fallback-'))
    const service = new ImCredentialService({
      root,
      encryption: {
        ...encryption(),
        encrypt: async () => { throw new Error('Keychain authorization unavailable.') }
      }
    })

    const ref = await service.set('feishu', 'app-fallback', 'session-secret')
    expect(ref.storage).toBe('session')
    expect(service.getStorage()).toBe('session')
    expect(await service.resolve(ref)).toBe('session-secret')
    await expect(readFile(join(root, `${ref.id}.json`), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves the last durable envelope when a credential rotation cannot access Keychain', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-credential-rotation-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const previous = await writer.set('feishu', 'app-rotation', 'old-secret')
    const previousEnvelope = await readFile(join(root, `${previous.id}.json`), 'utf8')
    const failing = new ImCredentialService({
      root,
      encryption: {
        ...encryption(),
        encrypt: async () => { throw new Error('Keychain authorization unavailable.') }
      }
    })

    const replacement = await failing.set('feishu', 'app-rotation', 'new-secret')

    expect(replacement.storage).toBe('session')
    expect(await readFile(join(root, `${previous.id}.json`), 'utf8')).toBe(previousEnvelope)
    expect(await writer.resolve(previous)).toBe('old-secret')
  })

  it('keeps an unverifiable encrypted envelope available for a later protected-storage retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-verification-fallback-'))
    const service = new ImCredentialService({
      root,
      resolveRetryDelayMs: 0,
      encryption: {
        ...encryption(),
        decrypt: async () => { throw new Error('Keychain authorization unavailable.') }
      }
    })

    const ref = await service.set('weixin', 'account-fallback', 'session-secret')
    expect(ref.storage).toBe('session')
    expect(service.getStorage()).toBe('session')
    expect(await service.resolve(ref)).toBe('session-secret')
    expect(await readFile(join(root, `${ref.id}.json`), 'utf8')).not.toContain('session-secret')
  })

  it('restores the previous durable envelope when post-write verification fails during rotation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-verification-rotation-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const previous = await writer.set('feishu', 'app-verification-rotation', 'old-secret')
    const previousEnvelope = await readFile(join(root, `${previous.id}.json`))
    const failing = new ImCredentialService({
      root,
      resolveRetryDelayMs: 0,
      encryption: {
        ...encryption(),
        decrypt: async () => { throw new Error('Keychain authorization unavailable.') }
      }
    })

    const replacement = await failing.set('feishu', 'app-verification-rotation', 'new-secret')

    expect(replacement.storage).toBe('session')
    expect(await readFile(join(root, `${previous.id}.json`))).toEqual(previousEnvelope)
    expect(await writer.resolve(previous)).toBe('old-secret')
    expect(await failing.resolve(replacement)).toBe('new-secret')
  })

  it('removes encrypted credentials without touching unrelated files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-remove-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const ref = await service.set('weixin', 'account-1', 'secret-token')
    await service.remove(ref)
    expect(await service.resolve(ref)).toBeUndefined()
  })

  it('supports asynchronous platform encryption without blocking credential persistence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-async-'))
    const service = new ImCredentialService({
      root,
      encryption: {
        ...encryption(),
        encrypt: async (value: string) => Buffer.from(value, 'utf8'),
        decrypt: async (value: Buffer) => value.toString('utf8')
      }
    })
    const ref = await service.set('feishu', 'app-async', 'async-secret')
    expect(await service.resolve(ref)).toBe('async-secret')
  })

  it('bounds and retries a stalled platform decrypt operation before reporting it unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-timeout-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const ref = await writer.set('feishu', 'app-timeout', 'timeout-secret')
    const stalled = new ImCredentialService({
      root,
      operationTimeoutMs: 10,
      resolveRetryDelayMs: 0,
      encryption: {
        ...encryption(),
        decrypt: () => new Promise<string>(() => undefined)
      }
    })
    await expect(stalled.resolve(ref)).rejects.toMatchObject({ code: 'credential_unavailable' })
  })

  it('does not start another protected-storage operation after the process marks it unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-unavailable-cache-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const ref = await writer.set('weixin', 'account-unavailable', 'unavailable-secret')
    const decrypt = vi.fn(() => {
      throw Object.assign(new Error('IM credential helper timed out.'), {
        code: 'credential_helper_timeout'
      })
    })
    const service = new ImCredentialService({
      root,
      resolveRetryDelayMs: 0,
      encryption: { ...encryption(), decrypt }
    })

    await expect(service.resolve(ref)).rejects.toMatchObject({ code: 'credential_unavailable' })
    expect(decrypt).toHaveBeenCalledTimes(1)

    await expect(service.resolve(ref)).rejects.toMatchObject({ code: 'credential_unavailable' })
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('fails queued protected credentials after one authorization timeout without opening another helper', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-queued-timeout-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const firstRef = await writer.set('feishu', 'queued-a', 'secret-a')
    const secondRef = await writer.set('weixin', 'queued-b', 'secret-b')
    const decrypt = vi.fn(() => {
      throw Object.assign(new Error('IM credential helper timed out.'), {
        code: 'credential_helper_timeout'
      })
    })
    const service = new ImCredentialService({
      root,
      resolveRetryDelayMs: 0,
      encryption: { ...encryption(), decrypt }
    })

    const results = await Promise.allSettled([
      service.resolve(firstRef),
      service.resolve(secondRef)
    ])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight failure before an explicit protected-storage retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-explicit-retry-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const ref = await writer.set('weixin', 'account-explicit-retry', 'recovered-secret')
    let releaseFirstAttempt: (() => void) | undefined
    const firstAttempt = new Promise<void>((resolveAttempt) => {
      releaseFirstAttempt = resolveAttempt
    })
    const decrypt = vi.fn(async (value: Buffer) => {
      if (decrypt.mock.calls.length === 1) await firstAttempt
      if (decrypt.mock.calls.length <= 2) throw new Error('IM credential helper timed out.')
      return value.toString('utf8')
    })
    const prepareProtectedStorageRetry = vi.fn()
    const service = new ImCredentialService({
      root,
      resolveRetryDelayMs: 0,
      encryption: { ...encryption(), decrypt },
      prepareProtectedStorageRetry
    })

    const failedResolve = service.resolve(ref)
    await vi.waitFor(() => expect(decrypt).toHaveBeenCalledTimes(1))
    const retry = service.retryProtectedStorage()
    releaseFirstAttempt?.()
    await expect(failedResolve).rejects.toMatchObject({ code: 'credential_unavailable' })
    await retry
    expect(prepareProtectedStorageRetry).toHaveBeenCalledTimes(1)
    await expect(service.resolve(ref)).resolves.toBe('recovered-secret')
    expect(decrypt).toHaveBeenCalledTimes(3)
  })

  it('recovers when the first platform decrypt attempt fails during startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-retry-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const ref = await writer.set('weixin', 'account-retry', 'retry-secret')
    let attempts = 0
    const recovering = new ImCredentialService({
      root,
      resolveRetryDelayMs: 0,
      encryption: {
        ...encryption(),
        decrypt: (value: Buffer) => {
          attempts += 1
          if (attempts === 1) throw new Error('IM credential helper timed out.')
          return value.toString('utf8')
        }
      }
    })

    await expect(recovering.resolve(ref)).resolves.toBe('retry-secret')
    expect(attempts).toBe(2)
  })

  it('shares one decrypt operation across concurrent resolves of the same reference', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-single-flight-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const ref = await writer.set('weixin', 'account-single-flight', 'single-flight-secret')
    let decrypts = 0
    let releaseDecrypt: (() => void) | undefined
    const decryptGate = new Promise<void>((resolveGate) => {
      releaseDecrypt = resolveGate
    })
    const service = new ImCredentialService({
      root,
      encryption: {
        ...encryption(),
        decrypt: async (value: Buffer) => {
          decrypts += 1
          await decryptGate
          return value.toString('utf8')
        }
      }
    })

    const first = service.resolve(ref)
    const second = service.resolve(ref)
    await vi.waitFor(() => expect(decrypts).toBe(1))
    releaseDecrypt?.()
    await expect(Promise.all([first, second])).resolves.toEqual([
      'single-flight-secret',
      'single-flight-secret'
    ])
    expect(decrypts).toBe(1)
  })

  it('keeps a successfully decrypted protected credential in process memory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-memory-cache-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const ref = await writer.set('feishu', 'memory-cache', 'cached-secret')
    const decrypt = vi.fn((value: Buffer) => value.toString('utf8'))
    const service = new ImCredentialService({
      root,
      encryption: { ...encryption(), decrypt }
    })

    await expect(service.resolve(ref)).resolves.toBe('cached-secret')
    await expect(service.resolve(ref)).resolves.toBe('cached-secret')
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('migrates a legacy secret to an encrypted reference without persisting plaintext', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-migrate-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const ref = await service.migrate('feishu', 'app-1', 'legacy-plaintext-secret')
    const envelope = await readFile(join(root, `${ref.id}.json`), 'utf8')
    expect(await service.resolve(ref)).toBe('legacy-plaintext-secret')
    expect(envelope).not.toContain('legacy-plaintext-secret')
  })

  it('replaces an existing credential when a new plaintext secret is provided', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-rotate-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const existingRef = await service.set('feishu', 'app-1', 'old-app-secret')
    const [channel] = await protectImChannelCredentials([{
      id: 'channel-1', provider: 'feishu', label: 'Feishu', enabled: true, model: 'auto', threadId: '', workspaceRoot: '',
      agentProfile: { name: 'Agent', description: '', identity: '', personality: '', userContext: '', replyRules: '' },
      platformCredential: {
        kind: 'feishu', appId: 'app-1', appSecret: 'new-app-secret', domain: 'https://open.feishu.cn',
        createdAt: '2026-08-14T00:00:00.000Z'
      },
      credentialRef: existingRef,
      conversations: [], createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z'
    }], service)

    expect(channel.credentialRef?.id).toBe(existingRef.id)
    expect(await service.resolve(channel.credentialRef!)).toBe('new-app-secret')
    expect(JSON.stringify(channel)).not.toContain('new-app-secret')
  })

  it('removes new IM plaintext credentials before channel settings are persisted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-channel-protect-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const [channel] = await protectImChannelCredentials([{
      id: 'channel-1', provider: 'feishu', label: 'Feishu', enabled: true, model: 'auto', threadId: '', workspaceRoot: '',
      agentProfile: { name: 'Agent', description: '', identity: '', personality: '', userContext: '', replyRules: '' },
      platformCredential: {
        kind: 'feishu', appId: 'app-1', appSecret: 'new-app-secret', domain: 'https://open.feishu.cn',
        createdAt: '2026-08-14T00:00:00.000Z'
      },
      conversations: [], createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z'
    }], service)

    expect(JSON.stringify(channel)).not.toContain('new-app-secret')
    expect(channel.platformCredential).not.toHaveProperty('appSecret')
    expect(channel.credentialRef).toBeDefined()
    expect(await service.resolve(channel.credentialRef!)).toBe('new-app-secret')
  })

  it('refuses a new IM channel binding when protected storage falls back to memory only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-persistent-required-'))
    const prepareProtectedStorageRetry = vi.fn()
    const service = new ImCredentialService({
      root,
      encryption: {
        ...encryption(),
        encrypt: async () => { throw new Error('Keychain authorization unavailable.') }
      },
      prepareProtectedStorageRetry
    })
    const channel = {
      id: 'channel-1', provider: 'feishu' as const, label: 'Feishu', enabled: true, model: 'auto', threadId: '', workspaceRoot: '',
      agentProfile: { name: 'Agent', description: '', identity: '', personality: '', userContext: '', replyRules: '' },
      platformCredential: {
        kind: 'feishu' as const, appId: 'app-1', appSecret: 'new-app-secret', domain: 'https://open.feishu.cn',
        createdAt: '2026-08-14T00:00:00.000Z'
      },
      conversations: [], createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z'
    }

    await expect(protectImChannelCredentials([channel], service, { requirePersistent: true }))
      .rejects.toMatchObject({ code: IM_PERSISTENT_CREDENTIAL_REQUIRED_CODE })
    expect(prepareProtectedStorageRetry).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(channel)).toContain('new-app-secret')
  })

  it('preserves an existing durable credential when a required persistent rotation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-required-rotation-'))
    const writer = new ImCredentialService({ root, encryption: encryption() })
    const previous = await writer.set('feishu', 'app-rotation', 'old-secret')
    const previousEnvelope = await readFile(join(root, `${previous.id}.json`), 'utf8')
    const failing = new ImCredentialService({
      root,
      encryption: {
        ...encryption(),
        encrypt: async () => { throw new Error('Keychain authorization unavailable.') }
      }
    })
    const channel = {
      id: 'channel-rotation', provider: 'feishu' as const, label: 'Feishu', enabled: true, model: 'auto', threadId: '', workspaceRoot: '',
      agentProfile: { name: 'Agent', description: '', identity: '', personality: '', userContext: '', replyRules: '' },
      platformCredential: {
        kind: 'feishu' as const, appId: 'app-rotation', appSecret: 'new-secret', domain: 'feishu',
        createdAt: '2026-08-14T00:00:00.000Z'
      },
      credentialRef: previous,
      conversations: [], createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z'
    }

    await expect(protectImChannelCredentials([channel], failing, { requirePersistent: true }))
      .rejects.toMatchObject({ code: IM_PERSISTENT_CREDENTIAL_REQUIRED_CODE })

    expect(await readFile(join(root, `${previous.id}.json`), 'utf8')).toBe(previousEnvelope)
    expect(await writer.resolve(previous)).toBe('old-secret')
    expect(JSON.stringify(channel)).toContain('new-secret')
  })

  it('removes deprecated plaintext credentials before exposing channels to the renderer', () => {
    const channels = sanitizeImChannelCredentials([
      {
        id: 'feishu-legacy', provider: 'feishu', label: 'Feishu', enabled: true, model: 'auto', threadId: '', workspaceRoot: '',
        agentProfile: { name: 'Agent', description: '', identity: '', personality: '', userContext: '', replyRules: '' },
        platformCredential: { kind: 'feishu', appId: 'app-1', appSecret: 'secret', domain: 'feishu', createdAt: '2026-08-14T00:00:00.000Z' },
        conversations: [], createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z'
      },
      {
        id: 'weixin-legacy', provider: 'weixin', label: '微信', enabled: true, model: 'auto', threadId: '', workspaceRoot: '',
        agentProfile: { name: 'Agent', description: '', identity: '', personality: '', userContext: '', replyRules: '' },
        platformCredential: { kind: 'weixin', accountId: 'account-1', sessionKey: 'session-secret', createdAt: '2026-08-14T00:00:00.000Z' },
        conversations: [], createdAt: '2026-08-14T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z'
      }
    ])

    expect(JSON.stringify(channels)).not.toContain('secret')
    expect(JSON.stringify(channels)).not.toContain('session-secret')
    expect(channels[0]?.platformCredential).toEqual(expect.objectContaining({ kind: 'feishu', appId: 'app-1' }))
    expect(channels[1]?.platformCredential).toEqual(expect.objectContaining({ kind: 'weixin', accountId: 'account-1' }))
  })

  it('removes credential files when channels are deleted without touching active references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-prune-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const removed = await service.set('feishu', 'app-removed', 'removed-secret')
    const active = await service.set('feishu', 'app-active', 'active-secret')

    await removeUnreferencedImCredentials(
      [{ credentialRef: removed }, { credentialRef: active }],
      [{ credentialRef: active }],
      service
    )

    expect(await service.resolve(removed)).toBeUndefined()
    expect(await service.resolve(active)).toBe('active-secret')
  })

  it('keeps a credential when the same id moves from session to protected storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-im-prune-storage-upgrade-'))
    const service = new ImCredentialService({ root, encryption: encryption() })
    const protectedRef = await service.set('feishu', 'app-upgraded', 'upgraded-secret')
    const sessionRef = { ...protectedRef, storage: 'session' as const }

    await removeUnreferencedImCredentials(
      [{ credentialRef: sessionRef }],
      [{ credentialRef: protectedRef }],
      service
    )

    expect(await service.resolve(protectedRef)).toBe('upgraded-secret')
  })
})
