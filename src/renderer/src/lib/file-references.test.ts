import { describe, expect, it } from 'vitest'
import {
  createFileReferenceHref,
  findFileReferences,
  parseFileReferenceHref
} from './file-references'

describe('workspace file references', () => {
  it('recognizes previewable Office, PDF, Markdown, and image paths', () => {
    const text = [
      '演示文稿：资料/产品介绍.PPTX',
      '文档：qa-documents/验收报告.docx',
      '表格：qa-documents/数据清单.xlsx',
      'PDF：qa-documents/规范文件.pdf',
      '说明：qa-documents/使用说明.markdown',
      '图片：qa-documents/效果图.jpeg',
      '矢量图：qa-documents/结构示意.svg'
    ].join('\n')

    expect(findFileReferences(text).map((match) => match.target.path)).toEqual([
      '资料/产品介绍.PPTX',
      'qa-documents/验收报告.docx',
      'qa-documents/数据清单.xlsx',
      'qa-documents/规范文件.pdf',
      'qa-documents/使用说明.markdown',
      'qa-documents/效果图.jpeg',
      'qa-documents/结构示意.svg'
    ])
  })

  it('does not turn remote URLs into workspace file references', () => {
    const text = [
      'https://example.com/files/report.pdf',
      'https://example.com/files/deck.pptx',
      '本地文件：qa-documents/report.pdf'
    ].join('\n')

    expect(findFileReferences(text).map((match) => match.target.path)).toEqual([
      'qa-documents/report.pdf'
    ])
  })

  it('round-trips controlled file-reference URLs without losing position metadata', () => {
    const target = {
      path: 'qa-documents/产品介绍.pptx',
      line: 12,
      column: 4
    }

    expect(parseFileReferenceHref(createFileReferenceHref(target))).toEqual(target)
  })
})
