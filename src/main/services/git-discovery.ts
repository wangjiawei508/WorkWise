import { stat } from 'node:fs/promises'
import { dirname, isAbsolute, parse, resolve } from 'node:path'

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
