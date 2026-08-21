import { describe, expect, it } from 'vitest'
import {
  filterGeneratedFilesForPrompt,
  generatedFilesFromTaskRuns,
  latestGeneratedFiles,
  replyTextForGeneratedFiles,
  shouldDirectSendExistingGeneratedFilesForPrompt,
  type ThreadDetailJson
} from './claw-runtime-helpers'

describe('latestGeneratedFiles', () => {
  it('discovers supported text and image deliverables printed by successful commands', () => {
    const detail: ThreadDetailJson = {
      id: 'thr_1',
      turns: [
        {
          id: 'turn_1',
          status: 'completed',
          items: [
            {
              kind: 'tool_result',
              toolKind: 'command_execution',
              status: 'completed',
              output: {
                exit_code: 0,
                output: [
                  'created /workspace/workwise-download-test.txt',
                  'preview: /workspace/preview.png'
                ].join('\n')
              }
            }
          ]
        }
      ]
    }

    expect(latestGeneratedFiles(detail, { workspaceRoot: '/workspace' })).toEqual([
      { path: '/workspace/workwise-download-test.txt', fileName: 'workwise-download-test.txt' },
      { path: '/workspace/preview.png', fileName: 'preview.png' }
    ])
  })

  it('does not treat paths from failed commands as generated deliverables', () => {
    const detail: ThreadDetailJson = {
      id: 'thr_1',
      turns: [
        {
          id: 'turn_1',
          status: 'failed',
          items: [
            {
              kind: 'tool_result',
              toolKind: 'command_execution',
              status: 'completed',
              output: {
                exit_code: 1,
                output: '/workspace/partial.txt'
              }
            }
          ]
        }
      ]
    }

    expect(latestGeneratedFiles(detail, { workspaceRoot: '/workspace' })).toEqual([])
  })
})

describe('generatedFilesFromTaskRuns', () => {
  it('returns only valid artifacts produced by the requested completed turn', () => {
    expect(generatedFilesFromTaskRuns([
      {
        activeTurnId: 'turn_other',
        status: 'completed',
        artifacts: [{ relativePath: 'stale.txt', validation: 'valid' }]
      },
      {
        activeTurnId: 'turn_1',
        status: 'completed',
        workspaceRoot: '/runtime-thread-workspace',
        artifacts: [
          { relativePath: 'partial.txt', validation: 'invalid' },
          { relativePath: 'result.txt', validation: 'valid' }
        ]
      }
    ], { turnId: 'turn_1', workspaceRoot: '/workspace' })).toEqual([
      {
        path: '/runtime-thread-workspace/result.txt',
        relativePath: 'result.txt',
        fileName: 'result.txt'
      }
    ])
  })

  it('falls back to the requested workspace for older Task payloads without a workspace root', () => {
    expect(generatedFilesFromTaskRuns([{
      activeTurnId: 'turn_legacy',
      status: 'completed',
      artifacts: [{ relativePath: 'legacy.txt', validation: 'valid' }]
    }], { turnId: 'turn_legacy', workspaceRoot: '/conversation-workspace' })).toEqual([{
      path: '/conversation-workspace/legacy.txt',
      relativePath: 'legacy.txt',
      fileName: 'legacy.txt'
    }])
  })
})

describe('replyTextForGeneratedFiles', () => {
  it('replaces a false local capability denial once a file is ready for delivery', () => {
    expect(replyTextForGeneratedFiles('我无法把文件作为附件发送。', [
      { path: '/workspace/result.txt', fileName: 'result.txt' }
    ])).toBe('文件已生成并发送：result.txt。请在当前会话中下载并打开附件。')
  })

  it('replaces a multiline tool-boundary denial once a file is ready for delivery', () => {
    expect(replyTextForGeneratedFiles([
      '附件发送环节：',
      '本轮工具集没有「发送附件/推送文件」的工具。',
      '验收契约未全部满足。'
    ].join('\n'), [
      { path: '/workspace/result.txt', fileName: 'result.txt' }
    ])).toBe('文件已生成并发送：result.txt。请在当前会话中下载并打开附件。')
  })
})

describe('direct existing file delivery', () => {
  it('starts a new Turn when the same prompt requests file creation and delivery', () => {
    expect(shouldDirectSendExistingGeneratedFilesForPrompt(
      '请创建内容完全等于 TEST 的 result.txt，并作为附件发送给我。'
    )).toBe(false)
    expect(shouldDirectSendExistingGeneratedFilesForPrompt(
      'Create result.txt and send it as an attachment.'
    )).toBe(false)
  })

  it('allows an explicit request to resend a previously generated file', () => {
    expect(shouldDirectSendExistingGeneratedFilesForPrompt('把刚才的 result.txt 发给我')).toBe(true)
  })

  it('selects the explicitly named artifact instead of every file with the same extension', () => {
    expect(filterGeneratedFilesForPrompt('把 second.txt 发给我', [
      { path: '/workspace/first.txt', fileName: 'first.txt' },
      { path: '/workspace/second.txt', fileName: 'second.txt' }
    ])).toEqual([{ path: '/workspace/second.txt', fileName: 'second.txt' }])
  })
})
