const { execFileSync } = require('node:child_process')

function git(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim()
  } catch (error) {
    const detail = String(error?.stderr || error?.message || '').trim()
    throw new Error(
      `Candidate source provenance requires a readable Git worktree${detail ? `: ${detail}` : '.'}`
    )
  }
}

function verifyCandidateSourceTree(repoRoot, expectedSourceHead, options = {}) {
  const label = options.label ? `[${options.label}] ` : ''
  if (!/^[0-9a-f]{40}$/.test(expectedSourceHead || '')) {
    throw new Error(`${label}Candidate source HEAD must be a 40-character lowercase Git commit.`)
  }

  const currentHead = git(repoRoot, ['rev-parse', '--verify', 'HEAD'])
  if (currentHead !== expectedSourceHead) {
    throw new Error(
      `${label}Candidate source HEAD ${currentHead || 'missing'} does not match expected source HEAD ${expectedSourceHead}`
    )
  }

  const changes = git(repoRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none'
  ])
  if (changes) {
    throw new Error(
      `${label}Candidate source tree has uncommitted changes; package provenance would be ambiguous.`
    )
  }
  return currentHead
}

module.exports = { verifyCandidateSourceTree }
