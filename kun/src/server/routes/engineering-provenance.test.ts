import { describe, expect, it } from 'vitest'
import { skillsCatalog } from './engineering.js'

describe('engineering skill provenance', () => {
  it('never advertises un-audited skills as packaged', () => {
    const payload = JSON.parse(skillsCatalog().body) as { skills: Array<{ packaged: boolean; status: string; reason?: string; commit: string }> }
    expect(payload.skills.length).toBeGreaterThan(0)
    for (const skill of payload.skills) {
      if (skill.status !== 'available') {
        expect(skill.packaged).toBe(false)
        expect(skill.reason).toBeTruthy()
      }
    }
    expect(payload.skills.some((skill) => skill.commit === 'audit-pending')).toBe(true)
  })
})
