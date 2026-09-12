import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), 'src', 'asset', 'skills', 'rail-any-station-control-network')

describe('任意设站控制网测量 bundled Skill', () => {
  it('ships the auditable entrypoint and excludes the user project archive', () => {
    expect(existsSync(resolve(root, 'SKILL.md'))).toBe(true)
    expect(existsSync(resolve(root, 'skill.json'))).toBe(true)
    expect(existsSync(resolve(root, 'agents', 'openai.yaml'))).toBe(true)
    expect(readFileSync(resolve(root, 'SOURCE_NOTICE.md'), 'utf8')).toContain('license')
    expect(existsSync(resolve(root, 'assets', 'examples', 'xuwang-original.zip'))).toBe(false)
    expect(existsSync(resolve(root, 'sources'))).toBe(false)
  })

  it('keeps the reusable scripts offline and deterministic', () => {
    const scripts = ['network_adjustment.py', 'reproduce_project.py', 'report_outputs.py', 'assessment_report.py']
      .map((name) => readFileSync(resolve(root, 'scripts', name), 'utf8'))
      .join('\n')
    expect(scripts).not.toMatch(/\b(?:requests|urllib|curl|wget)\b|(?:subprocess|os\.system)\s*\(/i)
    expect(scripts).not.toMatch(/(?:password|api[_-]?key|access[_-]?token|cookie|secret)/i)
  })
})
