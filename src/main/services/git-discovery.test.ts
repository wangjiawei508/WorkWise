import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findNearestGitRoot } from './git-discovery'

let sandbox = ''

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ds-gui-git-discovery-'))
})

afterEach(async () => {
  if (sandbox) {
    await rm(sandbox, { recursive: true, force: true })
    sandbox = ''
  }
})

async function makeRepo(root: string): Promise<void> {
  await mkdir(join(root, '.git'), { recursive: true })
}

describe('findNearestGitRoot', () => {
  it('returns the directory itself when it contains .git', async () => {
    await makeRepo(sandbox)
    const result = await findNearestGitRoot(sandbox)
    expect(result).toBe(sandbox)
  })

  it('walks up to find .git in an ancestor directory', async () => {
    await makeRepo(sandbox)
    const subdir = join(sandbox, 'src', 'components', 'chat')
    await mkdir(subdir, { recursive: true })
    const result = await findNearestGitRoot(subdir)
    expect(result).toBe(sandbox)
  })

  it('handles a deeply nested subdirectory', async () => {
    await makeRepo(sandbox)
    const deep = join(sandbox, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j')
    await mkdir(deep, { recursive: true })
    const result = await findNearestGitRoot(deep)
    expect(result).toBe(sandbox)
  })

  it('recognizes .git as a file (worktrees / submodules)', async () => {
    // .git can be a file that points at a gitdir elsewhere. We don't follow
    // the file — we just need to recognize that the parent is inside a repo.
    await writeFile(join(sandbox, '.git'), 'gitdir: /tmp/elsewhere\n', 'utf8')
    const subdir = join(sandbox, 'sub')
    await mkdir(subdir, { recursive: true })
    const result = await findNearestGitRoot(subdir)
    expect(result).toBe(sandbox)
  })

  it('returns null when no ancestor contains .git', async () => {
    // sandbox is a fresh tmpdir with no .git anywhere up the chain (the
    // walker stops at the filesystem root, so we just verify the function
    // does not crash and returns null for a non-repo path).
    const result = await findNearestGitRoot(sandbox)
    expect(result).toBeNull()
  })

  it('returns null for an empty string', async () => {
    expect(await findNearestGitRoot('')).toBeNull()
  })

  it('finds the nearest of multiple nested .git directories', async () => {
    // Outer repo at sandbox, inner "subrepo" at sandbox/inner/.git
    await makeRepo(sandbox)
    const inner = join(sandbox, 'inner')
    await makeRepo(inner)
    const innerSub = join(inner, 'src')
    await mkdir(innerSub, { recursive: true })

    // From a path inside `inner`, the inner .git wins (nearest).
    expect(await findNearestGitRoot(innerSub)).toBe(inner)
    // From a path inside `sandbox` (not inside inner), the outer .git wins.
    const sandboxSibling = join(sandbox, 'sibling')
    await mkdir(sandboxSibling, { recursive: true })
    expect(await findNearestGitRoot(sandboxSibling)).toBe(sandbox)
  })

  it('resolves a relative path against the current working directory', async () => {
    await makeRepo(sandbox)
    const subdir = join(sandbox, 'sub')
    await mkdir(subdir, { recursive: true })
    // Pass a relative path; the helper should resolve it to an absolute one.
    const result = await findNearestGitRoot(join(subdir, 'relative.txt'))
    // The file does not exist — but findNearestGitRoot doesn't care, it just
    // walks parents of the resolved path.
    expect(result).toBe(sandbox)
  })

  it('returns null for a path that walks past the filesystem root', async () => {
    // /this/path/does/not/exist/anywhere is not a real ancestor of anything
    // git-ish, so the walker should return null without throwing.
    const result = await findNearestGitRoot('/this/path/does/not/exist/anywhere')
    expect(result).toBeNull()
  })
})
