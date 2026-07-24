import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillRuntime } from './skill-runtime.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('preferred built-in Skill activation', () => {
  it('injects Tender Master when the selected Agent prefers it even for a generic prompt', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-tender-agent-'))
    roots.push(workspace)
    const bundledSkills = resolve(process.cwd(), '..', 'src', 'asset', 'skills')
    const runtime = await SkillRuntime.create({
      enabled: true,
      roots: [bundledSkills],
      legacySkillMd: true
    })

    const resolution = runtime.resolveTurn({
      prompt: '请先查看我提供的材料',
      workspace,
      preferredSkillIds: ['tender-master']
    })

    expect(resolution.activeSkillIds).toContain('tender-master')
    expect(resolution.activations).toContainEqual(expect.objectContaining({
      skillId: 'tender-master',
      reason: 'continuation:previous-turn'
    }))
    expect(resolution.instructions.join('\n')).toContain('招投标编制专家')
    expect(resolution.instructions.join('\n')).toContain('不可信数据')
  })

  it('does not activate restricted link-only projects because their source is not bundled', async () => {
    const bundledSkills = resolve(process.cwd(), '..', 'src', 'asset', 'skills')
    const runtime = await SkillRuntime.create({
      enabled: true,
      roots: [bundledSkills],
      legacySkillMd: true
    })

    const diagnostics = runtime.diagnostics()
    expect(diagnostics.skills.map((skill) => skill.id)).not.toEqual(expect.arrayContaining([
      'guizang-social-card-skill',
      'guizang-material-illustration',
      'logo-generator-skill'
    ]))
  })
})
