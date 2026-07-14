import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { validateSkillPackage } from './skill-package-security'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'workwise-skill-security-'))
  roots.push(value)
  return value
}

describe('Skill package security', () => {
  it('accepts a bounded ordinary package', async () => {
    const dir = await root()
    await writeFile(join(dir, 'SKILL.md'), '# Safe')
    await expect(validateSkillPackage(dir)).resolves.toEqual({ files: 1, totalBytes: 6 })
  })

  it('rejects links, submodules, special depth, and oversized files', async () => {
    const linked = await root()
    const outside = await root()
    await writeFile(join(outside, 'secret'), 'x')
    await symlink(join(outside, 'secret'), join(linked, 'SKILL.md'))
    await expect(validateSkillPackage(linked)).rejects.toThrow(/links and junctions/)

    const submodule = await root()
    await writeFile(join(submodule, 'SKILL.md'), '# Safe')
    await writeFile(join(submodule, '.git'), 'gitdir: elsewhere')
    await expect(validateSkillPackage(submodule)).rejects.toThrow(/submodules/)

    const deep = await root()
    let current = deep
    for (let index = 0; index < 18; index += 1) {
      current = join(current, `d${index}`)
      await mkdir(current)
    }
    await writeFile(join(current, 'SKILL.md'), '# Deep')
    await expect(validateSkillPackage(deep)).rejects.toThrow(/depth/)

    const large = await root()
    await writeFile(join(large, 'SKILL.md'), Buffer.alloc(1024 * 1024 + 1))
    await expect(validateSkillPackage(large)).rejects.toThrow(/1 MiB/)
  })
})
