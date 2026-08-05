import { describe, expect, it } from 'vitest'
import {
  buildPptMasterResult,
  describePptMasterConfirmation,
  findPptMasterPendingConfirmation
} from './ppt-confirm-contract'

const SAMPLE_RECOMMENDATIONS = {
  mode: { id: 'agent', label: 'Agent 模式', candidates: [{ id: 'agent', label: 'Agent 模式' }] },
  visual_style: {
    id: 'pyramid',
    label: '金字塔',
    candidates: [
      { id: 'pyramid', label: '金字塔' },
      { id: 'swiss-minimal', label: '瑞士极简' }
    ]
  },
  canvas: 'ppt169',
  page_count: 12,
  audience: '工程管理层',
  communication_intent: '汇报',
  delivery_context: 'presenter-led',
  content_divergence: '补充',
  generation_mode: 'continuous',
  proactive_speaker_notes: true,
  proactive_custom_animations: false,
  image_usage: ['ai', 'web'],
  core_message: '项目阶段总结',
  custom_note: '保留未知字段'
}

describe('ppt confirm contract', () => {
  it('builds a final confirmed result by merging edits over recommendations', () => {
    const result = buildPptMasterResult(
      SAMPLE_RECOMMENDATIONS,
      { visual_style: { id: 'swiss-minimal', label: '瑞士极简' }, page_count: 16 },
      '/work/deck',
      '2026-08-05T00:00:00.000Z'
    )
    expect(result.stage).toBe('final')
    expect(result.status).toBe('confirmed')
    expect(result.source).toBe('workwise-native-panel')
    expect(result.projectDir).toBe('/work/deck')
    expect(result.visual_style).toMatchObject({ id: 'swiss-minimal', label: '瑞士极简' })
    expect(result.page_count).toBe(16)
    expect(result.mode).toMatchObject({ id: 'agent' })
    expect(result.custom_note).toBe('保留未知字段')
  })

  it('generates a concise Chinese summary for the conversation', () => {
    const result = buildPptMasterResult(SAMPLE_RECOMMENDATIONS, {}, '/work/deck')
    const summary = describePptMasterConfirmation(result)
    expect(summary).toContain('已确认 PPT Master 方案')
    expect(summary).toContain('视觉风格：金字塔')
    expect(summary).toContain('页数：12')
    expect(summary).toContain('confirm_ui/result.json')
  })

  it('finds a pending recommendations.stage1.json and ignores confirmed projects', async () => {
    const files = new Map<string, string>([
      ['/root/projects/a/confirm_ui/recommendations.stage1.json', JSON.stringify(SAMPLE_RECOMMENDATIONS)]
    ])
    const dirs = new Map<string, Array<{ name: string; path: string; type: 'file' | 'directory' }>>([
      ['/root', [
        { name: 'projects', path: '/root/projects', type: 'directory' }
      ]],
      ['/root/projects', [
        { name: 'a', path: '/root/projects/a', type: 'directory' },
        { name: 'b', path: '/root/projects/b', type: 'directory' }
      ]],
      ['/root/projects/a', [
        { name: 'confirm_ui', path: '/root/projects/a/confirm_ui', type: 'directory' }
      ]],
      ['/root/projects/a/confirm_ui', [
        { name: 'recommendations.stage1.json', path: '/root/projects/a/confirm_ui/recommendations.stage1.json', type: 'file' }
      ]],
      ['/root/projects/b', []],
      ['/root/projects/b/confirm_ui', [
        { name: 'result.json', path: '/root/projects/b/confirm_ui/result.json', type: 'file' }
      ]]
    ])
    const listDir = async (path: string) => dirs.get(path) ?? []
    const readFile = async (path: string) => {
      const content = files.get(path)
      if (content === undefined) throw new Error('missing')
      return content
    }

    const found = await findPptMasterPendingConfirmation('/root', listDir, readFile)
    expect(found?.projectDir).toBe('/root/projects/a')
    expect(found?.recommendations.visual_style).toMatchObject({ id: 'pyramid' })
  })
})
