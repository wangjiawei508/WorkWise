import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadOrCreateFlowSecretStoreKey } from './flow-secret-store-key'

const adapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`protected:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^protected:/, '')
}

describe('Flow system safe-storage key', () => {
  it('persists only the platform-encrypted master key and returns the same key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-flow-key-'))
    const first = await loadOrCreateFlowSecretStoreKey({ root, safeStorageAdapter: adapter }); const second = await loadOrCreateFlowSecretStoreKey({ root, safeStorageAdapter: adapter })
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(second).toBe(first)
    const stored = await readFile(join(root, 'master-key.json'), 'utf8'); expect(stored).not.toContain(first!); expect(stored).toContain('encrypted')
  })
  it('fails closed when platform encryption is unavailable', async () => {
    await expect(loadOrCreateFlowSecretStoreKey({ root: '/unused', safeStorageAdapter: { ...adapter, isEncryptionAvailable: () => false } })).resolves.toBeNull()
  })
})
