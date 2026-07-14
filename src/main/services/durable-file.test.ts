import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atomicWriteFile, drainSerializedWrites, recoverAtomicFile, runSerialized } from './durable-file'

const roots: string[] = []

afterEach(async () => {
  await drainSerializedWrites()
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('durable file writes', () => {
  it('serializes writes for one key', async () => {
    const order: number[] = []
    await Promise.all([
      runSerialized('same-key', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push(1)
      }),
      runSerialized('same-key', async () => { order.push(2) })
    ])
    expect(order).toEqual([1, 2])
  })

  it('keeps the previous target when the pre-replace containment check fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-durable-'))
    roots.push(root)
    const target = join(root, 'settings.json')
    await writeFile(target, 'old')
    await expect(atomicWriteFile(target, 'new', {
      beforeReplace: async () => { throw new Error('unsafe_path') }
    })).rejects.toThrow('unsafe_path')
    await expect(readFile(target, 'utf8')).resolves.toBe('old')
  })

  it('recovers a backup left before replacement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-durable-'))
    roots.push(root)
    const target = join(root, 'manifest.json')
    await writeFile(target, 'complete')
    await rename(target, `${target}.workwise-backup`)
    await recoverAtomicFile(target)
    await expect(readFile(target, 'utf8')).resolves.toBe('complete')
  })
})
