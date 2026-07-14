import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

const queues = new Map<string, Promise<unknown>>()
export type AtomicWriteFileOptions = {
  renameRetry?: { attempts?: number; baseDelayMs?: number }
  beforeReplace?: () => Promise<void>
}
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

export function serializeFileOperation<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const key = `file:${path}`
  const previous = queues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  queues.set(key, current)
  void current.finally(() => {
    if (queues.get(key) === current) queues.delete(key)
  }).catch(() => undefined)
  return current
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function syncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, constants.O_RDONLY)
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    // Some Windows filesystems do not expose directory fsync.
  }
}

export async function recoverAtomicWrite(path: string): Promise<void> {
  const backup = `${path}.workwise-backup`
  if (!(await exists(path)) && await exists(backup)) {
    await rename(backup, path)
  } else if (await exists(path) && await exists(backup)) {
    await rm(backup, { force: true })
  }
}

async function renameWithRetry(from: string, to: string, options?: AtomicWriteFileOptions['renameRetry']): Promise<void> {
  const attempts = Math.max(1, Math.floor(options?.attempts ?? 2))
  const baseDelayMs = Math.max(0, Math.floor(options?.baseDelayMs ?? 25))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException).code ?? '')
      if (attempt >= attempts || !RETRYABLE_RENAME_CODES.has(code)) throw error
      await new Promise((resolveDelay) => setTimeout(resolveDelay, baseDelayMs * attempt))
    }
  }
}

async function replace(path: string, temp: string, options?: AtomicWriteFileOptions['renameRetry']): Promise<void> {
  if (process.platform !== 'win32') {
    await renameWithRetry(temp, path, options)
    return
  }
  const backup = `${path}.workwise-backup`
  await rm(backup, { force: true })
  const hadTarget = await exists(path)
  if (hadTarget) await renameWithRetry(path, backup, options)
  try {
    await renameWithRetry(temp, path, options)
    await rm(backup, { force: true })
  } catch (error) {
    if (!(await exists(path)) && await exists(backup)) {
      await rename(backup, path).catch(() => undefined)
    }
    throw error
  }
}

export async function atomicWriteFile(
  path: string,
  contents: string | Uint8Array,
  options: AtomicWriteFileOptions = {}
): Promise<void> {
  await serializeFileOperation(path, () => atomicWriteFileLocked(path, contents, options))
}

/** Atomic replacement for callers that already hold serializeFileOperation(path). */
export async function atomicWriteFileLocked(
  path: string,
  contents: string | Uint8Array,
  options: AtomicWriteFileOptions = {}
): Promise<void> {
  const parent = dirname(path)
  await mkdir(parent, { recursive: true })
  await recoverAtomicWrite(path)
  const temp = `${path}.${process.pid}.${randomUUID()}.workwise.tmp`
  const handle = await open(temp, 'wx', 0o600)
  try {
    await handle.writeFile(contents)
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
  await handle.close()
  try {
    await options.beforeReplace?.()
    await replace(path, temp, options.renameRetry)
    await syncDirectory(parent)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function drainAtomicWrites(): Promise<void> {
  await Promise.allSettled([...queues.values()])
}
