import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const queues = new Map<string, Promise<unknown>>()

export function runSerialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  queues.set(key, current)
  void current.finally(() => {
    if (queues.get(key) === current) queues.delete(key)
  }).catch(() => undefined)
  return current
}

export async function drainSerializedWrites(): Promise<void> {
  await Promise.allSettled([...queues.values()])
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
    // Directory fsync is unavailable on some Windows/filesystem combinations.
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function recoverAtomicFile(targetPath: string): Promise<void> {
  const backupPath = `${targetPath}.workwise-backup`
  const targetExists = await pathExists(targetPath)
  const backupExists = await pathExists(backupPath)
  if (!targetExists && backupExists) {
    await rename(backupPath, targetPath)
    await syncDirectory(dirname(targetPath))
    return
  }
  if (targetExists && backupExists) await rm(backupPath, { force: true })
}

async function replaceFile(targetPath: string, tempPath: string): Promise<void> {
  if (process.platform !== 'win32') {
    await rename(tempPath, targetPath)
    return
  }

  const backupPath = `${targetPath}.workwise-backup`
  await rm(backupPath, { force: true })
  const hadTarget = await pathExists(targetPath)
  if (hadTarget) await rename(targetPath, backupPath)
  try {
    await rename(tempPath, targetPath)
    await rm(backupPath, { force: true })
  } catch (error) {
    if (!(await pathExists(targetPath)) && await pathExists(backupPath)) {
      await rename(backupPath, targetPath).catch(() => undefined)
    }
    throw error
  }
}

export async function atomicWriteFile(
  targetPath: string,
  content: string | Uint8Array,
  options?: { beforeReplace?: () => Promise<void> }
): Promise<void> {
  await runSerialized(`file:${targetPath}`, async () => {
    const parent = dirname(targetPath)
    await mkdir(parent, { recursive: true })
    await recoverAtomicFile(targetPath)
    const tempPath = join(parent, `.${basename(targetPath)}.workwise-${process.pid}-${randomUUID()}.tmp`)
    const handle = await open(tempPath, 'wx', 0o600)
    try {
      await handle.writeFile(content)
      await handle.sync()
    } catch (error) {
      await handle.close().catch(() => undefined)
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
    await handle.close()
    try {
      await options?.beforeReplace?.()
      await replaceFile(targetPath, tempPath)
      await syncDirectory(parent)
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw error
    }
  })
}

export async function backupFileIfPresent(sourcePath: string, backupPath: string): Promise<boolean> {
  try {
    const source = await stat(sourcePath)
    if (!source.isFile()) return false
    await mkdir(dirname(backupPath), { recursive: true })
    await copyFile(sourcePath, backupPath, constants.COPYFILE_EXCL)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return true
    throw error
  }
}

export async function readRecoveredFile(targetPath: string): Promise<string> {
  await recoverAtomicFile(targetPath)
  return readFile(targetPath, 'utf8')
}
