import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { SkillRuntime } from '../skills/skill-runtime.js'
import { AUDITED_SPECIALIST_SKILLS, SPECIALIST_SKILL_ALIASES } from './specialist-skill-provenance.generated.js'

const skillsRoot = fileURLToPath(new URL('../../../src/asset/agent-packs/metro-monitoring-agent-pack/assets/skill/', import.meta.url))
let runtime: SkillRuntime

beforeAll(async () => {
  runtime = await SkillRuntime.create(
    { enabled: true, roots: [skillsRoot], legacySkillMd: true },
    { activeLimit: 1, instructionBudgetBytes: 24_000 }
  )
})

describe('audited specialist Skill real-scenario activation', () => {
  it.each(AUDITED_SPECIALIST_SKILLS)('$scenarioEvidence.id activates $id through the production SkillRuntime', (skill) => {
    const resolution = runtime.resolveTurn({
      prompt: skill.scenarioEvidence.prompt,
      workspace: skillsRoot,
      preferredSkillIds: [skill.id]
    })
    expect(resolution.activeSkillIds).toEqual([skill.id])
    expect(resolution.instructions.join('\n')).toContain(skill.scenarioEvidence.expectedEvidence)
    expect(resolution.injectedBytes).toBeGreaterThan(0)
  })

  it('keeps capability aliases virtual and bound to audited physical Skills', () => {
    const physicalIds = new Set(AUDITED_SPECIALIST_SKILLS.map((skill) => skill.id))
    for (const alias of SPECIALIST_SKILL_ALIASES) {
      expect(alias.packaged).toBe(false)
      expect(alias.executionPolicy).toBe('runtime-adapter-only')
      expect(alias.aliasFor?.every((id) => physicalIds.has(id))).toBe(true)
    }
  })
})
