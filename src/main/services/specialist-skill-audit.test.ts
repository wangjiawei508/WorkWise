import { createRequire } from 'node:module'
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
