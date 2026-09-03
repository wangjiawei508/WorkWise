import { describe, expect, it } from 'vitest'

describe('engineering agent surface contract', () => {
  it('exposes an explicit agent execution protocol alongside the conversation', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const source = await readFile(new URL('./EngineeringAiCommandCenter.tsx', import.meta.url), 'utf8')

    expect(source).toContain('工程 Agent 执行协议')
    expect(source).toContain('理解工程目标')
    expect(source).toContain('生成可审批计划')
    expect(source).toContain('调用确定性工具')
    expect(source).toContain('回流证据并请求复核')
    expect(source).toContain('AI 不代替测量软件')
  })

  it('makes the survey console method and constraint explicit', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const source = await readFile(new URL('./SurveyAdjustmentPanel.tsx', import.meta.url), 'utf8')

    expect(source).toContain('survey-adjustment-method')
    expect(source).toContain('survey-constraint-mode')
    expect(source).toContain('平差方法 / 权模型')
    expect(source).toContain('固定已知点')
    expect(source).toContain('加权最小二乘')
  })
})
