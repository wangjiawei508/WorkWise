import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const audit = require('../../../scripts/specialist-skill-audit.cjs') as {
  buildAudit: () => { skills: Array<{ id: string; status: string; packaged: boolean }> }
  verifyAudit: () => { skills: unknown[] }
  blockedSkillIds: (value: unknown) => string[]
  agentPackResourceFilter: (value: unknown) => string[]
  asarBlockedSkillFilters: (value: unknown) => string[]
}

describe('specialist Skill packaging audit', () => {
  it('preserves audited bytes when Git checks out with Windows autocrlf enabled', () => {
    const root = resolve(import.meta.dirname, '../../..')
    const fixture = mkdtempSync(join(tmpdir(), 'workwise-audit-checkout-'))
    const paths = [
      'LICENSE',
      'src/asset/agent-packs/metro-monitoring-agent-pack/assets/skill/data-analysis/SKILL.md',
      'src/asset/agent-packs/metro-monitoring-agent-pack/skill-provenance.json',
      'kun/src/engineering/specialist-skill-provenance.generated.ts'
    ]
    const git = (...args: string[]) => execFileSync('git', args, { cwd: fixture, stdio: 'pipe' })
    try {
      git('init', '--quiet')
      git('config', 'core.autocrlf', 'true')
      for (const path of ['.gitattributes', ...paths]) {
        mkdirSync(dirname(join(fixture, path)), { recursive: true })
        writeFileSync(join(fixture, path), readFileSync(join(root, path)))
      }
      git('add', '--', '.gitattributes', ...paths)
      const checkout = join(fixture, 'checkout')
      mkdirSync(checkout)
      git('checkout-index', '--all', `--prefix=${checkout}/`)
      for (const path of paths) {
        expect(readFileSync(join(checkout, path))).toEqual(readFileSync(join(root, path)))
      }
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('verifies the pinned source tree and generated hash manifests', () => {
    expect(audit.verifyAudit().skills).toHaveLength(25)
  })

  it('turns any blocked audit decision into agent-pack and legacy-source exclusions', () => {
    const manifest = audit.buildAudit()
    const blocked = manifest.skills.find((skill) => skill.id === 'cad-bim-review')!
    blocked.status = 'blocked'
    blocked.packaged = false
    expect(audit.blockedSkillIds(manifest)).toEqual(['cad-bim-review'])
    expect(audit.agentPackResourceFilter(manifest)).toContain('!metro-monitoring-agent-pack/assets/skill/cad-bim-review/**/*')
    expect(audit.asarBlockedSkillFilters(manifest)).toContain('!src/asset/skills/cad-bim-review/**/*')
  })
})
