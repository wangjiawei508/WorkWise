import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

describe('authorize-workwise-candidate.sh', () => {
  it('writes source-safe paths when the isolated root contains spaces', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'workwise-candidate-auth-'))
    const home = join(testRoot, 'home with spaces')
    const candidateRoot = join(home, 'Library', 'Application Support', 'WorkWise-Candidate')
    const helper = join(candidateRoot, 'authorized helper', 'WorkWise')
    const script = join(process.cwd(), 'scripts', 'authorize-workwise-candidate.sh')

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
      const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        encoding: 'utf8'
      }).trim()
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
    const script = join(process.cwd(), 'scripts', 'authorize-workwise-candidate.sh')

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
})
