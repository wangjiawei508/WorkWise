import { describe, expect, it } from 'vitest'

// Regression: ISSUE-001 — the survey workspace mixed generic Engineering labels with the approved product name.
// Found by /qa on 2026-09-04
// Report: .gstack/qa-reports/qa-report-workwise-candidate-2026-09-04.md
describe('engineering survey product naming regression', () => {
  it('uses the approved workbench, agent, and project names in user-visible surfaces', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const sources = await Promise.all([
      readFile(new URL('./EngineeringAiCommandCenter.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./EngineeringWorkspaceView.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./EngineeringSidebarContent.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../chat/Sidebar.tsx', import.meta.url), 'utf8')
    ])
    const source = sources.join('\n')

    expect(source).toContain('工程测量工作台')
    expect(source).toContain('工程测量 AI 指挥台')
    expect(source).toContain('测绘专业 AI Agent')
    expect(source).toContain('创建工程测量项目')
    expect(source).not.toMatch(/工程 AI 指挥台|工程 Agent|创建工程项目|新建工程项目|选择工程项目|暂无工程项目/)
  })
})
