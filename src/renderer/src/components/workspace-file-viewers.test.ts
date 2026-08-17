import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { resolveBuiltinWorkspaceFileViewer } from './workspace-file-viewers'

describe('built-in workspace file viewers', () => {
  it('routes plain text rich-preview results to the rich viewer', () => {
    expect(resolveBuiltinWorkspaceFileViewer({ fileName: 'notes.txt' })?.id).toBe('rich')
  })

  it('renders a plain text rich result without requiring a code result', () => {
    const viewer = resolveBuiltinWorkspaceFileViewer({ fileName: 'notes.txt' })
    expect(viewer?.id).toBe('rich')

    expect(() => viewer?.render({
      WorkspaceRichPreview: () => createElement('div')
    }, {
      richResult: {
        kind: 'markdown',
        source: 'plain text',
        html: '<p>plain text</p>',
        sizeBytes: 10
      },
      textResult: null,
      language: 'text'
    })).not.toThrow()
  })
})
