import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WorkspacePreviewResultV1 } from '@shared/agent-workbench'
import { WorkspaceRichPreview } from './WorkspaceRichPreview'

describe('WorkspaceRichPreview PDF status', () => {
  it('shows the selected engine, parsing mode, switch reasons, and fallback source', () => {
    const result: WorkspacePreviewResultV1 = {
      kind: 'pdf',
      relativePath: '招标 文件.pdf',
      pageCount: 2,
      searchable: true,
      pageTexts: [{ page: 1, text: '正文' }],
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=',
      truncated: false,
      warnings: ['高精度解析失败，已显示可用的快解析结果。'],
      document: {
        engine: 'markitdown',
        engineVersion: 'fixture-1',
        quality: {
          status: 'degraded',
          reasons: []
        },
        route: {
          requestedMode: 'accurate',
          selectedEngine: 'markitdown',
          fallbackFrom: 'mineru-local',
          switchReason: ['weak_text_layer', 'engine_fallback']
        },
        references: [{ page: 1, blockId: 'heading-1', kind: 'text' }]
      },
      sizeBytes: 128
    }

    const html = renderToStaticMarkup(createElement(WorkspaceRichPreview, { result }))

    expect(html).toContain('当前引擎：markitdown fixture-1')
    expect(html).toContain('解析模式：高精度解析')
    expect(html).toContain('切换原因：PDF 文本层较弱、高精度引擎失败后已降级')
    expect(html).toContain('降级来源：mineru-local')
    expect(html).toContain('高精度解析失败，已显示可用的快解析结果。')
  })

  it('offers a document-level retry when the current PDF uses the fast route', () => {
    const result: WorkspacePreviewResultV1 = {
      kind: 'pdf',
      relativePath: 'scan.pdf',
      pageCount: 1,
      searchable: false,
      pageTexts: [{ page: 1, text: '' }],
      truncated: false,
      warnings: ['需要高精度解析。'],
      document: {
        engine: 'markitdown',
        engineVersion: 'fixture-1',
        quality: { status: 'degraded', reasons: ['scanned_document'] },
        route: { requestedMode: 'auto', selectedEngine: 'markitdown' },
        references: []
      },
      sizeBytes: 128
    }

    const html = renderToStaticMarkup(createElement(WorkspaceRichPreview, {
      result,
      onRequestAccuratePdf: () => undefined
    }))

    expect(html).toContain('使用高精度解析')
  })
})
