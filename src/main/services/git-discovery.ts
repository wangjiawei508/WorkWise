import { lstat, readdir, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  '.workwise',
  'dist',
  'build',
  'out',
  'coverage'
])

/**
 * Walk up the directory tree starting at `start` and return the path of the
 * first directory that contains a `.git` entry (either a directory or, in the
 * case of git worktrees/submodules, a file). Returns `null` if the filesystem
 * root is reached without finding one.
 *
 * This mirrors the upward search that `git rev-parse --show-toplevel` performs
 * internally, but does it in pure Node so we can fall back gracefully when the
 * git binary is missing, returns a non-matching error, or is too old to support
 * the sub-commands the rest of `getGitBranches` relies on (e.g. `branch
 * --format`, which requires git 2.28+).
 *
 * The walker is bounded by the filesystem root (`/` on POSIX, the drive root
 * on Windows), so it cannot escape the host. Symlinks are not resolved here
 * — `getGitBranches` resolves them before calling this helper, or you can
 * resolve them yourself before passing the start path in.
 */
export async function findNearestGitRoot(start: string): Promise<string | null> {
  if (!start) return null
  const absolute = isAbsolute(start) ? start : resolve(start)
  const { root } = parse(absolute)

  let current = absolute
  // Hard upper bound: a real-world deep workspace shouldn't need more than
  // 64 ancestor hops. If we ever hit it, bail out rather than spin forever.
  for (let depth = 0; depth < 64; depth += 1) {
    const candidate = `${current}/.git`
    try {
      const info = await stat(candidate)
      // Both `.git/` (regular repo) and `.git` (file, used by submodules and
      // worktrees pointing at a gitdir elsewhere) qualify.
      if (info.isDirectory() || info.isFile()) {
        return current
      }
    } catch {
      // `.git` not present at this level — keep walking up.
    }

    if (current === root) return null
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

/**
 * Find top-level and nested repositories without following symlinks. Worktree
 * and submodule `.git` files count as repository markers. Results are
 * canonical paths contained by the canonical workspace root.
 */
export async function discoverGitRepositories(
  workspaceRoot: string,
  options: { maxDepth?: number; maxRepositories?: number } = {}
): Promise<string[]> {
  const maxDepth = Math.min(Math.max(options.maxDepth ?? 8, 0), 8)
  const maxRepositories = Math.min(Math.max(options.maxRepositories ?? 64, 1), 64)
  const root = await realpath(resolve(workspaceRoot))
  const results: string[] = []

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (results.length >= maxRepositories || depth > maxDepth) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    const marker = entries.find((entry) => entry.name === '.git')
    if (marker) {
      try {
        const markerInfo = await lstat(join(directory, marker.name))
        if (markerInfo.isDirectory() || markerInfo.isFile()) results.push(directory)
      } catch {
        // A repository marker that disappears during discovery is ignored.
      }
    }
    if (depth === maxDepth) return
    for (const entry of entries) {
      if (results.length >= maxRepositories) break
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORY_NAMES.has(entry.name)) continue
      const child = join(directory, entry.name)
      try {
        const childReal = await realpath(child)
        const rel = relative(root, childReal)
        if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
          continue
        }
        await visit(childReal, depth + 1)
      } catch {
        // Ignore inaccessible or concurrently removed directories.
      }
    }
  }

  await visit(root, 0)
  return [...new Set(results)]
}
