import { describe, expect, it } from 'vitest'
import { skillsCatalog } from './engineering.js'

describe('engineering skill provenance', () => {
  it('publishes complete pinned provenance without treating virtual aliases as duplicate packages', () => {
    const payload = JSON.parse(skillsCatalog().body) as {
      commit: string
      license: { spdx: string; path: string; sha256: string }
      skills: Array<{
        id: string
        sourcePath?: string
        packaged: boolean
        status: string
        reason?: string
        commit: string
        license: string
        licenseHash?: string
        fileHashes: Record<string, string>
        treeHash?: string
        dependencyStatus: string
        permissionReview: string
        executionPolicy: string
        networkAccess: string
        credentialAccess: string
        scenarioEvidence?: { status: string }
        aliasFor?: string[]
      }>
    }
    expect(payload.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(payload.license).toMatchObject({ spdx: 'MIT', path: 'LICENSE', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })

    const physical = payload.skills.filter((skill) => !skill.aliasFor)
    const aliases = payload.skills.filter((skill) => skill.aliasFor)
    expect(physical).toHaveLength(25)
    expect(aliases.map((skill) => skill.id).sort()).toEqual(['survey-adjustment', 'third-party-monitoring'])
    for (const skill of physical) {
      expect(skill).toMatchObject({
        commit: payload.commit,
        license: 'MIT',
        packaged: true,
        status: 'available',
        dependencyStatus: 'passed',
        permissionReview: 'passed'
      })
      expect(skill.sourcePath).toContain(`/assets/skill/${skill.id}`)
      expect(skill.licenseHash).toBe(payload.license.sha256)
      expect(skill.treeHash).toMatch(/^[0-9a-f]{64}$/)
      expect(Object.keys(skill.fileHashes).length).toBeGreaterThan(0)
      expect(skill.scenarioEvidence?.status).toBe('passed')
    }
    expect(payload.skills.find((skill) => skill.id === 'di-bao-monitoring')).toMatchObject({
      networkAccess: 'external',
      credentialAccess: 'read',
      executionPolicy: 'user-approval-required'
    })
    for (const alias of aliases) {
      expect(alias).toMatchObject({ packaged: false, status: 'available', executionPolicy: 'runtime-adapter-only' })
      expect(alias.reason).toContain('不复制源文件')
    }
  })
})
