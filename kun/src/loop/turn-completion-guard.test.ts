import { describe, expect, it } from 'vitest'
import { makeToolResultItem } from '../domain/item.js'
import {
  hasSuccessfulFileDeliverable,
  incompleteTurnContinuationInstruction,
  looksLikeProgressOnlyReply,
  promptRequiresFileDeliverable,
  requiredFileExtensionsForPrompt
} from './turn-completion-guard.js'

describe('turn completion guard', () => {
  it('detects explicit Chinese and English file deliverables', () => {
    expect(promptRequiresFileDeliverable('形成一份针对宁波睿威的产品介绍文档')).toBe(true)
    expect(promptRequiresFileDeliverable('Please create a DOCX report and save it.')).toBe(true)
    expect(promptRequiresFileDeliverable('解释一下这段代码')).toBe(false)
  })

  it('distinguishes a progress announcement from a delivered result', () => {
    expect(looksLikeProgressOnlyReply('资料够了。现在开始撰写完整文档。')).toBe(true)
    expect(looksLikeProgressOnlyReply('文档已完成并保存到 workspace/report.md。')).toBe(false)
  })

  it('recognizes a successful document write in the current turn', () => {
    const items = [
      makeToolResultItem({
        id: 'result_1',
        threadId: 'thread_1',
        turnId: 'turn_1',
        callId: 'call_1',
        toolName: 'write',
        toolKind: 'file_change',
        output: { path: '/tmp/report.md', relative_path: 'report.md' }
      })
    ]
    expect(hasSuccessfulFileDeliverable(items, 'turn_1')).toBe(true)
  })

  it('does not accept HTML as completion when the user requested a PPT', () => {
    const htmlItems = [
      makeToolResultItem({
        id: 'result_html',
        threadId: 'thread_1',
        turnId: 'turn_1',
        callId: 'call_html',
        toolName: 'write',
        toolKind: 'file_change',
        output: { path: 'slides.html' }
      })
    ]
    const pptxItems = [
      makeToolResultItem({
        id: 'result_pptx',
        threadId: 'thread_1',
        turnId: 'turn_1',
        callId: 'call_pptx',
        toolName: 'ppt_master_export',
        output: { generatedFiles: [{ relativePath: 'slides.pptx' }] }
      })
    ]
    const prompt = '请使用 PPT Master 生成一份演示文稿。'

    expect(hasSuccessfulFileDeliverable(htmlItems, 'turn_1', prompt)).toBe(false)
    expect(hasSuccessfulFileDeliverable(pptxItems, 'turn_1', prompt)).toBe(true)
    expect(incompleteTurnContinuationInstruction({
      requiresFileDeliverable: true,
      hasFileDeliverable: false,
      previousAssistantText: '',
      requiredFileExtensions: ['ppt', 'pptx']
    })).toContain('HTML, an outline, or a preview alone does not satisfy')
  })

  it('keeps PPT as the required output when HTML is the source format', () => {
    expect(requiredFileExtensionsForPrompt('请把这个 HTML 页面转换成 PPT。')).toEqual(['ppt', 'pptx'])
    expect(requiredFileExtensionsForPrompt('Create a self-contained HTML presentation.')).toBeUndefined()
  })

  it('builds recovery guidance for incomplete delivery and progress-only replies', () => {
    expect(incompleteTurnContinuationInstruction({
      requiresFileDeliverable: true,
      hasFileDeliverable: false,
      previousAssistantText: ''
    })).toContain('has not produced one yet')
    expect(incompleteTurnContinuationInstruction({
      requiresFileDeliverable: false,
      hasFileDeliverable: false,
      previousAssistantText: '让我继续整理资料。'
    })).toContain('progress announcement')
  })
})
