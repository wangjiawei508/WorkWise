import { describe, expect, it } from 'vitest'

describe('Workbench responsive panel contract', () => {
  it('keeps both sidebars as overlay drawers at narrow widths', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const [workbench, surfaces, baseShell] = await Promise.all([
      readFile(new URL('./Workbench.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../styles/surfaces-write.css', import.meta.url), 'utf8'),
      readFile(new URL('../styles/base-shell.css', import.meta.url), 'utf8')
    ])

    expect(workbench).toContain('ds-workbench-left-panel')
    expect(workbench).toContain('ds-workbench-right-panel')
    expect(workbench).toContain('ds-workbench-left-divider')
    expect(workbench).toContain('ds-workbench-right-divider')
    expect(surfaces).toMatch(/@media \(max-width: 960px\)[\s\S]*\.ds-workbench-right-panel[\s\S]*position: absolute/)
    expect(surfaces).toMatch(/@media \(max-width: 720px\)[\s\S]*\.ds-workbench-left-panel[\s\S]*position: absolute/)
    expect(baseShell).toMatch(/\.ds-workbench-divider\s*\{[\s\S]*width: 1px;[\s\S]*flex: 0 0 1px;[\s\S]*background: transparent;/)
    expect(baseShell).toMatch(/\.ds-workbench-divider::before\s*\{[\s\S]*width: 9px;[\s\S]*background: transparent;/)
    expect(baseShell).toMatch(/\.ds-workbench-divider::after\s*\{\s*content: none;/)
    expect(baseShell).not.toMatch(/\.ds-workbench-divider:hover::(before|after)/)
  })
})
