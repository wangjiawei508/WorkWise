import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

function createCandidateRepo(testRoot: string): { repo: string; script: string; sourceHead: string } {
  const repo = join(testRoot, 'repo')
  const scripts = join(repo, 'scripts')
  const script = join(scripts, 'authorize-workwise-candidate.sh')
  mkdirSync(scripts, { recursive: true })
  copyFileSync(join(process.cwd(), 'scripts', 'authorize-workwise-candidate.sh'), script)
  chmodSync(script, 0o700)
  writeFileSync(join(repo, 'package.json'), '{"version":"0.0.0-test"}\n')
  writeFileSync(join(repo, 'AGENTS.md'), '# Candidate fixture\n')
  execFileSync('git', ['init', '-b', 'candidate-test'], { cwd: repo, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'WorkWise Test'], { cwd: repo })
  execFileSync('git', ['config', 'user.email', 'test@workwise.invalid'], { cwd: repo })
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo, stdio: 'pipe' })
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  return { repo, script, sourceHead }
}

describe('authorize-workwise-candidate.sh', () => {
  it('writes source-safe paths when the isolated root contains spaces', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'workwise-candidate-auth-'))
    const home = join(testRoot, 'home with spaces')
    const candidateRoot = join(home, 'Library', 'Application Support', 'WorkWise-Candidate')
    const helper = join(candidateRoot, 'authorized helper', 'WorkWise')
    const { script, sourceHead } = createCandidateRepo(testRoot)

    try {
      const helperDir = join(candidateRoot, 'authorized helper')
      execFileSync('mkdir', ['-p', helperDir])
      writeFileSync(helper, '#!/bin/sh\nexit 0\n')
      chmodSync(helper, 0o700)

      execFileSync('bash', [script, '--prepare'], {
        env: {
          ...process.env,
          HOME: home,
          WORKWISE_CANDIDATE_ROOT: candidateRoot,
          WORKWISE_CANDIDATE_CREDENTIAL_HELPER: helper
        },
        input: 'AUTHORIZE WORKWISE CANDIDATE\n',
        encoding: 'utf8'
      })

      const envFile = join(candidateRoot, 'candidate.env')
      const raw = readFileSync(envFile, 'utf8')
      expect(raw).toContain('Application\\ Support')
      expect(raw).toContain(`WORKWISE_CANDIDATE_SOURCE_HEAD=${sourceHead}`)
      const resolvedCandidateRoot = realpathSync(candidateRoot)
      const resolvedHelper = realpathSync(helper)

      const sourced = execFileSync('bash', [
        '-c',
        'set -euo pipefail; source "$1"; printf "%s\\n%s\\n%s\\n" "$WORKWISE_CANDIDATE_ROOT" "$WORKWISE_CANDIDATE_USER_DATA" "$WORKWISE_CANDIDATE_CREDENTIAL_HELPER"',
        'workwise-candidate-env-test',
        envFile
      ], { encoding: 'utf8' })

      expect(sourced).toBe([
        resolvedCandidateRoot,
        join(resolvedCandidateRoot, 'user-data'),
        resolvedHelper
      ].join('\n') + '\n')
    } finally {
      rmSync(testRoot, { recursive: true, force: true })
    }
  })

  it('rejects a candidate check when the expected source HEAD differs', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'workwise-candidate-head-'))
    const candidateRoot = join(testRoot, 'candidate')
    const { script } = createCandidateRepo(testRoot)

    try {
      expect(() => execFileSync('bash', [script, '--check'], {
        env: {
          ...process.env,
          WORKWISE_CANDIDATE_ROOT: candidateRoot,
          WORKWISE_CANDIDATE_SOURCE_HEAD: '0000000000000000000000000000000000000000'
        },
        encoding: 'utf8',
        stdio: 'pipe'
      })).toThrow(/source HEAD/i)
    } finally {
      rmSync(testRoot, { recursive: true, force: true })
    }
  })

  it('rejects candidate preparation from a dirty source tree', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'workwise-candidate-dirty-'))
    const candidateRoot = join(testRoot, 'candidate')
    const { repo, script } = createCandidateRepo(testRoot)

    try {
      writeFileSync(join(repo, 'untracked-build-input.ts'), 'export const dirty = true\n')
      expect(() => execFileSync('bash', [script, '--check'], {
        env: {
          ...process.env,
          WORKWISE_CANDIDATE_ROOT: candidateRoot
        },
        encoding: 'utf8',
        stdio: 'pipe'
      })).toThrow(/uncommitted changes/i)
    } finally {
      rmSync(testRoot, { recursive: true, force: true })
    }
  })
})
