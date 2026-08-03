import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { atomicWriteFile, readRecoveredFile } from './durable-file'

type SafeStorageAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export async function loadOrCreateFlowSecretStoreKey(options: {
  root?: string
  safeStorageAdapter?: SafeStorageAdapter
} = {}): Promise<string | null> {
  let adapter: SafeStorageAdapter
  try { adapter = options.safeStorageAdapter ?? safeStorage; if (!adapter.isEncryptionAvailable()) return null } catch { return null }
  const root = options.root ?? join(app.getPath('userData'), 'credentials', 'flow')
  const path = join(root, 'master-key.json')
  try {
    const parsed = JSON.parse(await readRecoveredFile(path)) as { version?: number; encrypted?: string }
    if (parsed.version !== 1 || typeof parsed.encrypted !== 'string') throw new Error('Invalid Flow secret-store key record')
    const decrypted = adapter.decryptString(Buffer.from(parsed.encrypted, 'base64'))
    if (!/^[A-Za-z0-9_-]{43}$/.test(decrypted)) throw new Error('Invalid Flow secret-store key')
    return decrypted
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /Invalid Flow/.test(error.message))) throw error
  }
  await mkdir(root, { recursive: true, mode: 0o700 })
  const key = randomBytes(32).toString('base64url')
  const encrypted = adapter.encryptString(key).toString('base64')
  await atomicWriteFile(path, `${JSON.stringify({ version: 1, encrypted })}\n`)
  return key
}
