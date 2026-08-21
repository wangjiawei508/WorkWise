import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertGitWorkspaceAllowed,
  createAndSwitchGitBranch,
  getGitBranches,
  parseGitStatusPorcelainV1Z,
  switchGitBranch
} from './git-service'

/**
 * Integration tests for git-service.ts that exercise the real `git` binary
 * in a temp repository. These complement the unit tests for findNearestGitRoot
 * (in git-discovery.test.ts) by proving that the public entry points
 * (`getGitBranches`, `switchGitBranch`, `createAndSwitchGitBranch`) actually
 * return the right `repositoryRoot` when called with a subdirectory path.
 *
 * See issue #98: user reported that GUI showed "未检测到 Git" when the
 * workspace was a sub-folder of a repo. The fix walks up to find the nearest
 * `.git` root before calling git, so callers can pass a subdirectory and
 * still get a usable result.
 */

let sandbox = ''
let repoRoot = ''

describe('parseGitStatusPorcelainV1Z', () => {
  it('preserves spaces, arrow text, and both sides of a rename', () => {
    expect(parseGitStatusPorcelainV1Z(
      'R  renamed file.txt\0old file.txt\0?? loose -> file.txt\0'
    )).toEqual([
      {
        indexStatus: 'R',
        worktreeStatus: ' ',
        path: 'renamed file.txt',
        originalPath: 'old file.txt'
      },
      {
        indexStatus: '?',
        worktreeStatus: '?',
        path: 'loose -> file.txt'
      }
    ])
    expect(parseGitStatusPorcelainV1Z(
      ' R worktree renamed.txt\0worktree original.txt\0'
    )).toEqual([{
      indexStatus: ' ',
      worktreeStatus: 'R',
      path: 'worktree renamed.txt',
      originalPath: 'worktree original.txt'
    }])
  })
})

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'workwise-git-service-'))
  repoRoot = await realpath(sandbox)
  // Initialise a real git repo with one commit on `main` and a few sub-dirs.
  // `realpath` resolves the macOS /tmp symlink so the returned repositoryRoot
  // matches what `git rev-parse --show-toplevel` returns (which also resolves
  // symlinks).
  execFileSync('git', ['init', '-b', 'main', repoRoot], { stdio: 'pipe' })
  execFileSync('git', ['-C', repoRoot, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe' })
  execFileSync('git', ['-C', repoRoot, 'config', 'user.name', 'Test'], { stdio: 'pipe' })
  await writeFile(join(repoRoot, 'README.md'), 'test')
  execFileSync('git', ['-C', repoRoot, 'add', 'README.md'], { stdio: 'pipe' })
  execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'init'], { stdio: 'pipe' })
})

afterEach(async () => {
  if (sandbox) {
    await rm(sandbox, { recursive: true, force: true })
    sandbox = ''
    repoRoot = ''
  }
})

describe('getGitBranches — integration with real git', () => {
  it('rejects a Git workspace outside the configured active workspace', async () => {
    const allowed = await mkdtemp(join(tmpdir(), 'workwise-git-allowed-'))
    const outside = await mkdtemp(join(tmpdir(), 'workwise-git-outside-'))
    try {
      await expect(assertGitWorkspaceAllowed(outside, allowed)).rejects.toThrow(/active workspace/)
    } finally {
      await rm(allowed, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('returns ok with the repo root when called from a nested subdirectory (issue #98)', async () => {
    // Build a 5-level nested subdirectory inside the repo: <root>/a/b/c/d/e
    const deep = join(repoRoot, 'a', 'b', 'c', 'd', 'e')
    await mkdir(deep, { recursive: true })

    const result = await getGitBranches(deep)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable: just checked ok')

    // `repositoryRoot` must be the repo root (not the subdirectory we passed in).
    expect(result.repositoryRoot).toBe(repoRoot)
    // And we should see the default branch we created.
    expect(result.currentBranch).toBe('main')
    expect(result.branches.map((b) => b.name)).toContain('main')
    // Working tree is clean, no untracked files inside the subdir.
    expect(result.dirtyCount).toBe(0)
  })

  it('returns ok when called from the repo root itself', async () => {
    const result = await getGitBranches(repoRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.repositoryRoot).toBe(repoRoot)
    expect(result.currentBranch).toBe('main')
  })

  it('reports dirty files inside the workspace subdirectory', async () => {
    const sub = join(repoRoot, 'src')
    await mkdir(sub, { recursive: true })
    await writeFile(join(sub, 'untracked.ts'), 'export const x = 1\n')

    const result = await getGitBranches(sub)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.repositoryRoot).toBe(repoRoot)
    expect(result.dirtyCount).toBeGreaterThanOrEqual(1)
  })

  it('returns not_git_repo when the path is outside any repository', async () => {
    // A fresh tmpdir (no .git anywhere up the chain on this host).
    const outside = await mkdtemp(join(tmpdir(), 'workwise-git-outside-'))
    try {
      const result = await getGitBranches(outside)
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected not_git_repo, got ok')
      expect(result.reason).toBe('not_git_repo')
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('returns no_workspace for an empty workspace root', async () => {
    const result = await getGitBranches('   ')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected no_workspace, got ok')
    expect(result.reason).toBe('no_workspace')
  })
})

describe('switchGitBranch / createAndSwitchGitBranch — integration with real git', () => {
  it('rejects invalid or missing branches before mutating the repository', async () => {
    await expect(switchGitBranch(repoRoot, 'bad branch')).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_branch'
    })
    await expect(switchGitBranch(repoRoot, 'does-not-exist')).resolves.toMatchObject({
      ok: false,
      reason: 'branch_not_found'
    })
    await expect(createAndSwitchGitBranch(repoRoot, 'bad branch')).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_branch'
    })
    expect(execFileSync('git', ['-C', repoRoot, 'branch', '--show-current'], { encoding: 'utf8' }).trim()).toBe('main')
  })

  it('blocks switching while conflicts or another Git operation are active', async () => {
    execFileSync('git', ['-C', repoRoot, 'checkout', '-b', 'feature/conflict'], { stdio: 'pipe' })
    await writeFile(join(repoRoot, 'conflict.txt'), 'feature')
    execFileSync('git', ['-C', repoRoot, 'add', 'conflict.txt'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'feature conflict'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'checkout', 'main'], { stdio: 'pipe' })
    await writeFile(join(repoRoot, 'conflict.txt'), 'main')
    execFileSync('git', ['-C', repoRoot, 'add', 'conflict.txt'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'main conflict'], { stdio: 'pipe' })
    try {
      execFileSync('git', ['-C', repoRoot, 'merge', 'feature/conflict'], { stdio: 'ignore' })
    } catch {
      // Expected: the merge leaves an unresolved conflict for the preflight.
    }

    await expect(switchGitBranch(repoRoot, 'feature/conflict')).resolves.toMatchObject({
      ok: false,
      reason: 'unresolved_conflicts',
      blockingPaths: ['conflict.txt']
    })
    execFileSync('git', ['-C', repoRoot, 'merge', '--abort'], { stdio: 'pipe' })
    await writeFile(join(repoRoot, '.git', 'MERGE_HEAD'), '0000000000000000000000000000000000000000\n')
    await expect(switchGitBranch(repoRoot, 'feature/conflict')).resolves.toMatchObject({
      ok: false,
      reason: 'operation_in_progress'
    })
  })

  it('blocks every supported rebase, revert, and bisect operation marker', async () => {
    execFileSync('git', ['-C', repoRoot, 'branch', 'feature/operation-target'], { stdio: 'pipe' })
    const markers = [
      { name: 'rebase-merge', directory: true, label: 'rebase' },
      { name: 'rebase-apply', directory: true, label: 'rebase' },
      { name: 'REVERT_HEAD', directory: false, label: 'revert' },
      { name: 'BISECT_LOG', directory: false, label: 'bisect' }
    ]

    for (const marker of markers) {
      const markerPath = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--git-path', marker.name], { encoding: 'utf8' }).trim()
      const absoluteMarkerPath = join(repoRoot, markerPath)
      if (marker.directory) await mkdir(absoluteMarkerPath, { recursive: true })
      else await writeFile(absoluteMarkerPath, 'fixture\n')

      await expect(switchGitBranch(repoRoot, 'feature/operation-target')).resolves.toMatchObject({
        ok: false,
        reason: 'operation_in_progress',
        message: expect.stringContaining(marker.label)
      })
      await rm(absoluteMarkerPath, { recursive: true, force: true })
    }
  })

  it('blocks a branch already occupied by another worktree', async () => {
    execFileSync('git', ['-C', repoRoot, 'branch', 'feature/occupied'], { stdio: 'pipe' })
    const other = await realpath(await mkdtemp(join(tmpdir(), 'workwise-git-worktree-')))
    try {
      execFileSync('git', ['-C', repoRoot, 'worktree', 'add', other, 'feature/occupied'], { stdio: 'pipe' })
      await expect(switchGitBranch(repoRoot, 'feature/occupied')).resolves.toMatchObject({
        ok: false,
        reason: 'branch_in_other_worktree',
        blockingPaths: [other]
      })
    } finally {
      execFileSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', other], { stdio: 'pipe' })
      await rm(other, { recursive: true, force: true })
    }
  })

  it('blocks an untracked file that the target branch would add', async () => {
    execFileSync('git', ['-C', repoRoot, 'checkout', '-b', 'feature/overwrite'], { stdio: 'pipe' })
    await writeFile(join(repoRoot, 'incoming.txt'), 'tracked on target')
    execFileSync('git', ['-C', repoRoot, 'add', 'incoming.txt'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'target file'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'checkout', 'main'], { stdio: 'pipe' })
    await writeFile(join(repoRoot, 'incoming.txt'), 'local untracked')

    await expect(switchGitBranch(repoRoot, 'feature/overwrite')).resolves.toMatchObject({
      ok: false,
      reason: 'would_overwrite_files',
      blockingPaths: ['incoming.txt']
    })
  })

  it('caps untracked overwrite blockers at two paths', async () => {
    const paths = ['incoming-a.txt', 'incoming-b.txt', 'incoming-c.txt']
    execFileSync('git', ['-C', repoRoot, 'checkout', '-b', 'feature/many-overwrites'], { stdio: 'pipe' })
    for (const path of paths) await writeFile(join(repoRoot, path), 'tracked on target')
    execFileSync('git', ['-C', repoRoot, 'add', ...paths], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'target files'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'checkout', 'main'], { stdio: 'pipe' })
    for (const path of paths) await writeFile(join(repoRoot, path), 'local untracked')

    await expect(switchGitBranch(repoRoot, 'feature/many-overwrites')).resolves.toMatchObject({
      ok: false,
      reason: 'would_overwrite_files',
      blockingPaths: paths.slice(0, 2)
    })
  })

  it('returns a stable operation_in_progress error before creating a branch', async () => {
    await writeFile(join(repoRoot, '.git', 'CHERRY_PICK_HEAD'), '0000000000000000000000000000000000000000\n')

    await expect(createAndSwitchGitBranch(repoRoot, 'feature/blocked-create')).resolves.toMatchObject({
      ok: false,
      reason: 'operation_in_progress'
    })
    expect(execFileSync('git', ['-C', repoRoot, 'branch', '--show-current'], { encoding: 'utf8' }).trim()).toBe('main')
  })

  it('switches to an existing branch from a subdirectory', async () => {
    // Pre-create a feature branch with one commit on top of main.
    execFileSync('git', ['-C', repoRoot, 'checkout', '-b', 'feature/x'], { stdio: 'pipe' })
    await writeFile(join(repoRoot, 'feature.txt'), 'feature work')
    execFileSync('git', ['-C', repoRoot, 'add', 'feature.txt'], { stdio: 'pipe' })
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'feature'], { stdio: 'pipe' })
    // Back to main so we have something to switch away from.
    execFileSync('git', ['-C', repoRoot, 'checkout', 'main'], { stdio: 'pipe' })

    const sub = join(repoRoot, 'src', 'components')
    await mkdir(sub, { recursive: true })

    const result = await switchGitBranch(sub, 'feature/x')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.repositoryRoot).toBe(repoRoot)
    expect(result.currentBranch).toBe('feature/x')

    // Confirm the underlying git state actually changed.
    const actual = execFileSync('git', ['-C', repoRoot, 'branch', '--show-current'], {
      encoding: 'utf8'
    }).trim()
    expect(actual).toBe('feature/x')
  })

  it('creates a new branch from a subdirectory and switches to it', async () => {
    const sub = join(repoRoot, 'src', 'components')
    await mkdir(sub, { recursive: true })

    const result = await createAndSwitchGitBranch(sub, 'feature/y')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.repositoryRoot).toBe(repoRoot)
    expect(result.currentBranch).toBe('feature/y')
    expect(readdirSync(join(repoRoot, '.git', 'refs', 'heads'))).toContain('feature')
  })

  it('does not mutate a parent repository outside the active workspace', async () => {
    execFileSync('git', ['-C', repoRoot, 'branch', 'feature/outside-workspace'], { stdio: 'pipe' })
    const sub = join(repoRoot, 'authorized-child')
    await mkdir(sub, { recursive: true })

    await expect(switchGitBranch(sub, 'feature/outside-workspace', sub)).resolves.toMatchObject({
      ok: false,
      reason: 'workspace_not_allowed'
    })
    await expect(createAndSwitchGitBranch(sub, 'feature/must-not-exist', sub)).resolves.toMatchObject({
      ok: false,
      reason: 'workspace_not_allowed'
    })

    expect(execFileSync('git', ['-C', repoRoot, 'branch', '--show-current'], { encoding: 'utf8' }).trim()).toBe('main')
    expect(execFileSync('git', ['-C', repoRoot, 'branch', '--list', 'feature/must-not-exist'], { encoding: 'utf8' }).trim()).toBe('')
  })
})
