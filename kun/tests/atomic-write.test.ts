import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const renameMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    rename: renameMock
  }
})

const { atomicWriteFile } = await import('../src/adapters/file/atomic-write.js')

let actualRename: typeof import('node:fs/promises').rename

beforeEach(async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  actualRename = actual.rename
  renameMock.mockReset()
  renameMock.mockImplementation(actualRename)
})

afterEach(() => {
  renameMock.mockReset()
  vi.restoreAllMocks()
})

describe('atomicWriteFile', () => {
  it('retries transient Windows rename lock failures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kun-atomic-'))
    let failedOnce = false
    renameMock.mockImplementation(async (from: string, to: string) => {
      if (!failedOnce) {
        failedOnce = true
        const error = new Error('operation not permitted') as Error & { code: string }
        error.code = 'EPERM'
        throw error
      }
      return actualRename(from, to)
    })

    try {
      const path = join(dir, 'state.json')
      await atomicWriteFile(path, '{"ok":true}', {
        renameRetry: {
          attempts: 2,
          baseDelayMs: 0
        }
      })

      expect(await readFile(path, 'utf-8')).toBe('{"ok":true}')
      expect(renameMock).toHaveBeenCalledTimes(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('preserves the old file and rejects after Windows rename retries are exhausted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kun-atomic-'))
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    renameMock.mockImplementation(async () => {
      const error = new Error('operation not permitted') as Error & { code: string }
      error.code = 'EPERM'
      throw error
    })

    try {
      const path = join(dir, 'events.jsonl')
      await writeFile(path, '{"old":true}')
      await expect(atomicWriteFile(path, '{"seq":1}', {
        renameRetry: {
          attempts: 2,
          baseDelayMs: 0
        }
      })).rejects.toMatchObject({ code: 'EPERM' })

      expect(await readFile(path, 'utf-8')).toBe('{"old":true}')
      expect(renameMock).toHaveBeenCalledTimes(2)
      expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not use the direct-write fallback for non-Windows rename failures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kun-atomic-'))
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    renameMock.mockImplementation(async () => {
      const error = new Error('operation not permitted') as Error & { code: string }
      error.code = 'EPERM'
      throw error
    })

    try {
      const path = join(dir, 'events.jsonl')
      await expect(atomicWriteFile(path, '{"seq":1}', {
        renameRetry: {
          attempts: 2,
          baseDelayMs: 0
        }
      })).rejects.toMatchObject({ code: 'EPERM' })
      expect(renameMock).toHaveBeenCalledTimes(2)
      await expect(readFile(path, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
