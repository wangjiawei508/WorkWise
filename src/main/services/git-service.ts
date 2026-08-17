import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { access } from 'node:fs/promises'
import type { GitBranchesResult } from '../../shared/git-branches'
import { discoverGitRepositories, findNearestGitRoot } from './git-discovery'
import { canonicalizeContainmentRoot, isCanonicalPathContained } from './canonical-containment'

const execFileAsync = promisify(execFile)

export async function assertGitWorkspaceAllowed(workspaceRoot: string, activeWorkspaceRoot: string): Promise<void> {
  const [workspace, active] = await Promise.all([
    canonicalizeContainmentRoot(workspaceRoot),
    canonicalizeContainmentRoot(activeWorkspaceRoot)
  ])
  if (!isCanonicalPathContained(active, workspace)) {
    throw new Error('Git workspace must stay within the active workspace.')
  }
}

/**
 * Resolve a workspaceRoot to a directory that sits inside a Git working tree.
 *
 * `git rev-parse --show-toplevel` already walks up the directory tree, so it
 * usually finds the right cwd by itself. However, when the user's workspace
 * is set to a sub-folder of a repo AND the git binary is older than 2.28
 * (no `branch --format`) or returns an error string we don't match, the rest
 * of `getGitBranches` falls through to `gitFailure` and the UI shows
 * "未检测到 Git" even though we are clearly inside a repo. See issue #98.
 *
 * We mitigate that by walking up the tree in pure Node first and passing the
 * discovered repo root (or the original cwd if none was found) to git. This
 * is a defensive layer — when git itself works, the result is identical.
 */
async function resolveGitCwd(workspaceRoot: string): Promise<string> {
  const trimmed = workspaceRoot.trim()
  if (!trimmed) return trimmed
  const discovered = await findNearestGitRoot(trimmed)
  return discovered ?? trimmed
}

async function runGit(
  cwd: string,
  args: string[],
  timeout = 10_000
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 1024 * 1024
  })
  return { stdout: String(stdout), stderr: String(stderr) }
}

function gitFailure(error: unknown): GitBranchesResult {
  const message = error instanceof Error ? error.message : String(error)
  if (/not a git repository/i.test(message)) {
    return { ok: false, reason: 'not_git_repo', message: 'The working directory is not a Git repository.' }
  }
  if (/ENOENT/i.test(message) || /spawn git/i.test(message)) {
    return { ok: false, reason: 'git_unavailable', message: 'Git executable was not found.' }
  }
  return { ok: false, reason: 'error', message }
}

function preflightFailure(
  reason: Extract<GitBranchesResult, { ok: false }>['reason'],
  message: string,
  blockingPaths: string[] = []
): GitBranchesResult {
  return {
    ok: false,
    reason,
    message,
    ...(blockingPaths.length ? { blockingPaths: blockingPaths.slice(0, 2) } : {})
  }
}

export type GitStatusPorcelainEntry = {
  indexStatus: string
  worktreeStatus: string
  path: string
  originalPath?: string
}

export function parseGitStatusPorcelainV1Z(output: string): GitStatusPorcelainEntry[] {
  const fields = output.split('\0')
  const entries: GitStatusPorcelainEntry[] = []
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!field || field.length < 4 || field[2] !== ' ') continue
    const entry: GitStatusPorcelainEntry = {
      indexStatus: field[0] ?? ' ',
      worktreeStatus: field[1] ?? ' ',
      path: field.slice(3)
    }
    if (
      entry.indexStatus === 'R' || entry.indexStatus === 'C' ||
      entry.worktreeStatus === 'R' || entry.worktreeStatus === 'C'
    ) {
      const originalPath = fields[index + 1]
      if (originalPath) {
        entry.originalPath = originalPath
        index += 1
      }
    }
    entries.push(entry)
  }
  return entries
}

async function existingGitOperation(cwd: string): Promise<string | null> {
  const markers = [
    ['MERGE_HEAD', 'merge'],
    ['rebase-merge', 'rebase'],
    ['rebase-apply', 'rebase'],
    ['CHERRY_PICK_HEAD', 'cherry-pick'],
    ['REVERT_HEAD', 'revert'],
    ['BISECT_LOG', 'bisect']
  ] as const
  for (const [marker, label] of markers) {
    const markerPath = (await runGit(cwd, ['rev-parse', '--git-path', marker])).stdout.trim()
    try {
      await access(resolve(cwd, markerPath))
      return label
    } catch {
      // Marker absent.
    }
  }
  return null
}

async function branchWorktreePath(cwd: string, branch: string): Promise<string | null> {
  const output = (await runGit(cwd, ['worktree', 'list', '--porcelain'])).stdout
  for (const block of output.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const worktree = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length).trim()
    const branchRef = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length).trim()
    if (worktree && branchRef === `refs/heads/${branch}`) return resolve(worktree)
  }
  return null
}

async function preflightGitWorkspaceState(cwd: string): Promise<GitBranchesResult | null> {
  const conflicts = (await runGit(cwd, ['diff', '--name-only', '-z', '--diff-filter=U'])).stdout
    .split('\0')
    .filter(Boolean)
  if (conflicts.length) {
    return preflightFailure('unresolved_conflicts', 'Resolve Git conflicts before switching branches.', conflicts)
  }
  const operation = await existingGitOperation(cwd)
  if (operation) {
    return preflightFailure('operation_in_progress', `Finish or abort the current Git ${operation} before switching branches.`)
  }
  return null
}

async function pathsChangedOnTarget(cwd: string, branch: string, candidates: string[]): Promise<Set<string>> {
  const changed = new Set<string>()
  for (let index = 0; index < candidates.length; index += 128) {
    const chunk = candidates.slice(index, index + 128)
    const output = (await runGit(cwd, ['diff', '--name-only', 'HEAD', branch, '--', ...chunk])).stdout
    for (const line of output.split('\n')) {
      const path = line.trim()
      if (path) changed.add(path)
    }
  }
  return changed
}

async function untrackedPathsPresentOnTarget(cwd: string, branch: string, candidates: string[]): Promise<Set<string>> {
  const tracked = new Set<string>()
  for (let index = 0; index < candidates.length; index += 128) {
    const chunk = candidates.slice(index, index + 128)
    const output = (await runGit(cwd, ['ls-tree', '-r', '--name-only', branch, '--', ...chunk])).stdout
    for (const line of output.split('\n')) {
      const path = line.trim()
      if (path) tracked.add(path)
    }
  }
  return tracked
}

export async function preflightGitBranchSwitch(
  workspaceRoot: string,
  branchName: string
): Promise<GitBranchesResult | null> {
  const cwd = await resolveGitCwd(workspaceRoot)
  const branch = branchName.trim()
  if (!cwd) return preflightFailure('no_workspace', 'No working directory selected.')
  if (!branch) return preflightFailure('invalid_branch', 'Branch name is required.')
  try {
    await runGit(cwd, ['check-ref-format', '--branch', branch])
  } catch {
    return preflightFailure('invalid_branch', 'The branch name is not valid.')
  }
  try {
    await runGit(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
  } catch {
    return preflightFailure('branch_not_found', 'The requested local branch does not exist.')
  }
  try {
    const repositoryRoot = resolve((await runGit(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim())
    const currentBranch = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim()
    if (currentBranch === branch) return null

    const workspaceBlocked = await preflightGitWorkspaceState(cwd)
    if (workspaceBlocked) return workspaceBlocked

    const occupiedPath = await branchWorktreePath(cwd, branch)
    if (occupiedPath && occupiedPath !== repositoryRoot) {
      return preflightFailure('branch_in_other_worktree', 'The branch is already checked out in another worktree.', [occupiedPath])
    }

    const statusEntries = parseGitStatusPorcelainV1Z(
      (await runGit(cwd, ['status', '--porcelain=v1', '-z'])).stdout
    )
    const dirtyPaths = [...new Set(statusEntries.flatMap((entry) => [entry.path, entry.originalPath].filter((path): path is string => Boolean(path))))]
    if (dirtyPaths.length) {
      const untracked = statusEntries
        .filter((entry) => entry.indexStatus === '?' && entry.worktreeStatus === '?')
        .map((entry) => entry.path)
      const trackedDirty = dirtyPaths.filter((path) => !untracked.includes(path))
      const blocked = new Set<string>()
      for (const path of await pathsChangedOnTarget(cwd, branch, trackedDirty)) blocked.add(path)
      for (const path of await untrackedPathsPresentOnTarget(cwd, branch, untracked)) blocked.add(path)
      if (blocked.size) {
        return preflightFailure(
          'would_overwrite_files',
          'Switching branches would overwrite local files.',
          [...blocked]
        )
      }
    }
    return null
  } catch (error) {
    return gitFailure(error)
  }
}

export async function getGitBranches(workspaceRoot: string): Promise<GitBranchesResult> {
  const cwd = await resolveGitCwd(workspaceRoot)
  if (!cwd) {
    return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  }
  try {
    const canonicalWorkspaceRoot = resolve(workspaceRoot)
    const repositoryRoot = resolve(
      (await runGit(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
    )
    const discovered: string[] = (
      await discoverGitRepositories(canonicalWorkspaceRoot).catch(() => [])
    ).map((root) => resolve(root))
    const allRepositories = discovered.includes(repositoryRoot)
      ? discovered
      : [repositoryRoot, ...discovered]
    const repositories = [...new Set(allRepositories)].map((root) => {
      const rel = relative(canonicalWorkspaceRoot, root)
      return {
        root,
        relativePath: !rel || isAbsolute(rel) || rel.startsWith('..') ? basename(root) : rel
      }
    })
    const currentRaw = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim()
    const currentBranch = currentRaw || null
    const branchLines = (await runGit(cwd, ['branch', '--format=%(refname:short)'])).stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const branchSet = new Set(branchLines)
    if (currentBranch && !branchSet.has(currentBranch)) branchSet.add(currentBranch)
    const branches = [...branchSet].map((name) => ({
      name,
      current: currentBranch === name
    }))
    const dirtyCount = parseGitStatusPorcelainV1Z(
      (await runGit(cwd, ['status', '--porcelain=v1', '-z'])).stdout
    ).length
    return { ok: true, repositoryRoot, repositories, currentBranch, branches, dirtyCount }
  } catch (error) {
    return gitFailure(error)
  }
}

export async function switchGitBranch(
  workspaceRoot: string,
  branchName: string
): Promise<GitBranchesResult> {
  const cwd = await resolveGitCwd(workspaceRoot)
  const branch = branchName.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!branch) return { ok: false, reason: 'invalid_branch', message: 'Branch name is required.' }
  try {
    const blocked = await preflightGitBranchSwitch(cwd, branch)
    if (blocked) return blocked
    await runGit(cwd, ['switch', '--no-guess', branch], 20_000)
    return getGitBranches(cwd)
  } catch (error) {
    return gitFailure(error)
  }
}

export async function createAndSwitchGitBranch(
  workspaceRoot: string,
  branchName: string
): Promise<GitBranchesResult> {
  const cwd = await resolveGitCwd(workspaceRoot)
  const branch = branchName.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!branch) return { ok: false, reason: 'invalid_branch', message: 'Branch name is required.' }
  try {
    await runGit(cwd, ['check-ref-format', '--branch', branch])
    const blocked = await preflightGitWorkspaceState(cwd)
    if (blocked) return blocked
    await runGit(cwd, ['switch', '--no-guess', '-c', branch], 20_000)
    return getGitBranches(cwd)
  } catch (error) {
    return gitFailure(error)
  }
}
