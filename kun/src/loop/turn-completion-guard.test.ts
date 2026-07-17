import { describe, expect, it } from 'vitest'
import { makeToolResultItem } from '../domain/item.js'
import {
  hasSuccessfulFileDeliverable,
  completionIntentText,
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

  it('uses only marked user requests for file-delivery intent', () => {
    const prompt = [
      '[写作上下文]',
      '当前文件: qa-ppt-source.md',
      '',
      '[RailWise 知识库检索结果]',
      '[RailWise 1] AI监测报告生成工具',
      '生成报告的参考资料。',
      '',
      '[用户请求]',
      '基于知识库生成最多 6 项巡检清单。不要生成文件，不要调用工具。'
    ].join('\n')

    expect(completionIntentText(prompt)).toBe(
      '基于知识库生成最多 6 项巡检清单。不要生成文件，不要调用工具。'
    )
    expect(promptRequiresFileDeliverable(prompt)).toBe(false)
    expect(requiredFileExtensionsForPrompt(prompt)).toBeUndefined()
  })

  it('keeps positive delivery clauses that follow an unrelated or different negation', () => {
    expect(promptRequiresFileDeliverable('不要调用工具，生成 PPT 文件。')).toBe(true)
    expect(promptRequiresFileDeliverable('不要生成 HTML 文件；请生成 PPTX 文件。')).toBe(true)
    expect(promptRequiresFileDeliverable('不要只输出文字，请生成 PPT 文件。')).toBe(true)
    expect(promptRequiresFileDeliverable('Do not call tools; generate a PPTX file.')).toBe(true)
    expect(promptRequiresFileDeliverable('Do not generate an HTML file; generate a PPTX file.')).toBe(true)
  })

  it('preserves prior marked delivery intent across a confirmation turn', () => {
    const workflowPrompt = [
      '[写作上下文]\n当前文件: source.md\n\n[用户请求]\n请生成一份 PPT 演示文稿。',
      '[写作上下文]\n当前文件: source.md\n\n[用户请求]\n确认，开始执行。'
    ].join('\n')

    expect(completionIntentText(workflowPrompt)).toContain('请生成一份 PPT 演示文稿。')
    expect(completionIntentText(workflowPrompt)).toContain('确认，开始执行。')
    expect(promptRequiresFileDeliverable(workflowPrompt)).toBe(true)
    expect(requiredFileExtensionsForPrompt(workflowPrompt)).toEqual(['ppt', 'pptx'])
  })

  it('does not treat a contextual file name as a delivery request', () => {
    expect(promptRequiresFileDeliverable(
      '[写作上下文]\n当前文件: current.md\n\n[用户请求]\n总结当前内容。'
    )).toBe(false)
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
