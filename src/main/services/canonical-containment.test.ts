import { mkdtemp, mkdir, realpath, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  UnsafePathError,
  recheckContainedParent,
  resolveContainedPath
} from './canonical-containment'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<{ base: string; root: string; outside: string }> {
  const base = await mkdtemp(join(tmpdir(), 'workwise-containment-'))
  roots.push(base)
  const root = join(base, 'workspace')
  const outside = join(base, 'outside')
  await mkdir(root)
  await mkdir(outside)
  return { base, root, outside }
}

describe('canonical containment', () => {
  it('allows a workspace root that is itself a link', async () => {
    const { base, root } = await fixture()
    await writeFile(join(root, 'inside.txt'), 'ok')
    const linkedRoot = join(base, 'linked-workspace')
    await symlink(root, linkedRoot, 'dir')
    await expect(resolveContainedPath({
      root: linkedRoot,
      target: 'inside.txt',
      mustExist: true,
      expect: 'file'
    })).resolves.toBe(await realpath(join(root, 'inside.txt')))
  })

  it('rejects lexical traversal and NUL input', async () => {
    const { root } = await fixture()
    await expect(resolveContainedPath({ root, target: '../outside/file' })).rejects.toBeInstanceOf(UnsafePathError)
    await expect(resolveContainedPath({ root, target: 'bad\0name' })).rejects.toMatchObject({ code: 'unsafe_path' })
  })

  it('rejects a link inside the workspace that points outside', async () => {
    const { root, outside } = await fixture()
    await writeFile(join(outside, 'secret.txt'), 'no')
    await symlink(outside, join(root, 'escape'), 'dir')
    await expect(resolveContainedPath({
      root,
      target: 'escape/secret.txt',
      mustExist: true
    })).rejects.toMatchObject({ code: 'unsafe_path' })
  })

  it('canonicalizes a missing target through its nearest existing parent', async () => {
    const { root } = await fixture()
    await mkdir(join(root, 'nested'))
    await expect(resolveContainedPath({ root, target: 'nested/new.txt' }))
      .resolves.toBe(join(await realpath(root), 'nested', 'new.txt'))
  })

  it('detects a parent swapped to an external link before replacement', async () => {
    const { root, outside } = await fixture()
    const parent = join(root, 'target')
    await mkdir(parent)
    const target = await resolveContainedPath({ root, target: 'target/file.txt' })
    await rm(parent, { recursive: true })
    await symlink(outside, parent, 'dir')
    await expect(recheckContainedParent(root, target)).rejects.toMatchObject({ code: 'unsafe_path' })
  })
})
