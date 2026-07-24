import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const bundledRoot = resolve(process.cwd(), 'src', 'asset', 'skills')

function bundledTextFiles(root: string): Array<{ path: string; content: string }> {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name)
    const stats = statSync(path)
    if (stats.isDirectory()) return bundledTextFiles(path)
    if (stats.size > 2 * 1024 * 1024) return []
    try {
      return [{ path, content: readFileSync(path, 'utf8') }]
    } catch {
      return []
    }
  })
}

describe('bundled specialist Skill source policy', () => {
  it('bundles the audited MIT document illustrator with its exact upstream revision', () => {
    const skillRoot = resolve(bundledRoot, 'document-illustrator')
    expect(existsSync(resolve(skillRoot, 'SKILL.md'))).toBe(true)
    expect(readFileSync(resolve(skillRoot, 'LICENSE'), 'utf8')).toContain('MIT License')
    expect(readFileSync(resolve(skillRoot, 'references', 'upstream.md'), 'utf8'))
      .toContain('8344815d407cc25cc04c327557f36ed839f0aaef')
    expect(existsSync(resolve(skillRoot, 'scripts'))).toBe(false)
    const packagedText = bundledTextFiles(skillRoot).map((file) => file.content).join('\n')
    expect(packagedText).not.toContain('GEMINI_API_KEY')
    expect(packagedText).not.toContain('~/.claude/skills')
    expect(packagedText).not.toContain('load_dotenv')
  })

  it('does not redistribute sources that lack the required platform license', () => {
    for (const blockedId of [
      'guizang-social-card-skill',
      'guizang-material-illustration',
      'logo-generator-skill'
    ]) {
      expect(existsSync(resolve(bundledRoot, blockedId)), blockedId).toBe(false)
    }

    const forbiddenSourceMarkers = [
      'cf4b810fac1c73fb65a2bb31d8c9278d82cbc4c5',
      'cf26e194ce075cd205329abab29cc71fda3e78b2',
      'bf4e9ac4d4428bda261afcfe981871ceb92d94e6',
      'github.com/op7418/guizang-social-card-skill',
      'github.com/op7418/guizang-material-illustration',
      'github.com/op7418/logo-generator-skill'
    ]
    for (const file of bundledTextFiles(bundledRoot)) {
      for (const marker of forbiddenSourceMarkers) {
        expect(file.content, `${file.path} contains restricted source marker ${marker}`)
          .not.toContain(marker)
      }
    }
  })
})
