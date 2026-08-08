import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogCredentialService } from './catalog-credential-service'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => ''
  }
}))

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'workwise-catalog-credentials-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('CatalogCredentialService', () => {
  it('stores persistent tokens only as safe-storage ciphertext', async () => {
    const key = 0x47
    const service = new CatalogCredentialService({
      root,
      encryption: {
        available: () => true,
        encrypt: (value) => Buffer.from([...Buffer.from(value)].map((byte) => byte ^ key)),
        decrypt: (value) => Buffer.from([...value].map((byte) => byte ^ key)).toString('utf8'),
        storage: 'keychain'
      }
    })

    await expect(service.set('catalog.private.token', 'private-token-value')).resolves.toBe('keychain')
    await expect(service.resolve('catalog.private.token')).resolves.toBe('private-token-value')
    await expect(service.status('private', 'catalog.private.token')).resolves.toEqual({
      sourceId: 'private',
      configured: true,
      storage: 'keychain'
    })
    const files = await readdir(root)
    expect(files).toHaveLength(1)
    expect(await readFile(join(root, files[0]!), 'utf8')).not.toContain('private-token-value')

    await service.remove('catalog.private.token')
    await expect(service.resolve('catalog.private.token')).resolves.toBeUndefined()
  })

  it('falls back to process-memory session storage when encryption is unavailable', async () => {
    const service = new CatalogCredentialService({
      root,
      encryption: {
        available: () => false,
        encrypt: () => Buffer.alloc(0),
        decrypt: () => '',
        storage: 'safe-storage'
      }
    })
    await expect(service.set('catalog.session.token', 'session-token')).resolves.toBe('session')
    await expect(service.resolve('catalog.session.token')).resolves.toBe('session-token')
    await expect(service.status('session', 'catalog.session.token')).resolves.toMatchObject({
      configured: true,
      storage: 'session'
    })
  })

  it('removes stale persistent ciphertext when a token is replaced in session storage', async () => {
    const encryption = {
      available: () => true,
      encrypt: (value: string) => Buffer.from(value),
      decrypt: (value: Buffer) => value.toString('utf8'),
      storage: 'keychain' as const
    }
    const persistent = new CatalogCredentialService({ root, encryption })
    await persistent.set('catalog.rotated.token', 'old-token')
    expect(await readdir(root)).toHaveLength(1)

    const session = new CatalogCredentialService({
      root,
      encryption: { ...encryption, available: () => false }
    })
    await expect(session.set('catalog.rotated.token', 'new-token')).resolves.toBe('session')
    await expect(session.resolve('catalog.rotated.token')).resolves.toBe('new-token')
    expect(await readdir(root)).toHaveLength(0)
  })

  it('rejects empty and oversized secrets', async () => {
    const service = new CatalogCredentialService({ root })
    await expect(service.set('catalog.token', '')).rejects.toThrow(/invalid/i)
    await expect(service.set('catalog.token', 'x'.repeat(64 * 1024 + 1))).rejects.toThrow(/64 KiB/i)
  })
})
