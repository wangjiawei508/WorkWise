import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SkillRuntime } from './skill-runtime.js'

const skillRoot = fileURLToPath(new URL('../../../src/asset/skills/rail-any-station-control-network/', import.meta.url))

describe('任意设站控制网测量 bundled Skill', () => {
  it('discovers the manifest and resolves both id and Chinese @ mentions', async () => {
    const runtime = await SkillRuntime.create({ enabled: true, roots: [skillRoot], legacySkillMd: true })
    expect(runtime.diagnostics().skills).toEqual([
      expect.objectContaining({
        id: 'rail-any-station-control-network',
        name: '任意设站控制网测量',
        legacy: false
      })
    ])

    for (const prompt of [
      '@rail-any-station-control-network 检查 IN2 平差',
      '@任意设站控制网测量 检查 IN2 平差'
    ]) {
      const resolution = runtime.resolveTurn({ prompt, workspace: skillRoot })
      expect(resolution.activeSkillIds).toEqual(['rail-any-station-control-network'])
      expect(resolution.instructions.join('\n')).toContain('WorkWise 调用边界')
    }
  })
})
