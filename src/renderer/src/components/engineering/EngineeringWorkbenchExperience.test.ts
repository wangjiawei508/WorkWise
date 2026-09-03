import { describe, expect, it } from 'vitest'

describe('engineering workbench experience contract', () => {
  it('keeps AI planning, conversation, and evidence in one three-column surface', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const source = await readFile(new URL('./EngineeringAiCommandCenter.tsx', import.meta.url), 'utf8')

    expect(source).toContain('xl:grid-cols-[216px_minmax(0,1fr)_284px]')
    expect(source).toContain('工程测量 AI 会话')
    expect(source).toContain('Copilot 检查器')
    expect(source).toContain('证据回流')
    expect(source).toContain('Typed Plan')
    expect(source).toContain('交给测绘专业 AI Agent')
    expect(source).not.toContain('localStorage')
  })

  it('does not stack the classic delivery header above the AI command surface', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const source = await readFile(new URL('./EngineeringWorkspaceView.tsx', import.meta.url), 'utf8')

    expect(source).toContain("${tab === 'ai-command' ? 'engineering-agent-route' : 'engineering-classic-route'}")
    expect(source).toContain("{tab !== 'ai-command' ? <header")
    expect(source).toContain('data-testid="engineering-classic-header"')
  })

  it('uses an engineering-specific empty state before a project thread exists', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const source = await readFile(new URL('./EngineeringAiCommandCenter.tsx', import.meta.url), 'utf8')

    expect(source).toContain('data-testid="engineering-ai-empty-state"')
    expect(source).toContain('先选择一个工程测量项目')
    expect(source).toContain('AI 会识别测量类型、绑定资料边界')
    expect(source).not.toContain('Start your agent rhythm')
    expect(source).not.toContain('WorkWise Runtime usage')
    expect(source).toContain('timelineHasActivity')
    expect(source).toContain('测绘专业 AI Agent 已就绪')
  })

  it('keeps survey work in professional point, observation, topology, and result views', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const source = await readFile(new URL('./SurveyAdjustmentPanel.tsx', import.meta.url), 'utf8')

    expect(source).toContain('网形与基准')
    expect(source).toContain('观测表')
    expect(source).toContain('点位与网形')
    expect(source).toContain('平差结果与精度评定')
    expect(source).toContain('残差与粗差候选')
    expect(source).toContain('运行加权最小二乘')
    expect(source).toContain('高级 JSON')
    expect(source).toContain('让测绘专业 AI Agent 解读')
    expect(source).toContain('lg:grid-cols-[190px_minmax(0,1fr)] 2xl:grid-cols-[190px_minmax(0,1fr)_260px]')
    expect(source).toContain('grid gap-3 2xl:grid-cols-[minmax(0,1fr)_260px]')
    expect(source).toContain('survey-instrument-strip')
    expect(source).toContain('点位成果与复核摘要')
    expect(source).toContain('标准化残差 > 3σ')
  })
})
