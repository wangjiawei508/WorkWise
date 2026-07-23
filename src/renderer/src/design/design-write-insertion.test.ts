import { describe, expect, it } from 'vitest'
import { insertDesignMarkdownIntoWrite } from './design-write-insertion'
import type { WriteEditorSelectionState } from '../components/write/WriteMarkdownEditor'

function selection(
  from: number,
  to: number,
  text = ''
): WriteEditorSelectionState {
  return {
    text,
    charCount: Math.max(0, to - from),
    ranges: [{
      from,
      to,
      startLine: 1,
      startColumn: from + 1,
      endLine: 1,
      endColumn: to + 1,
      text,
      charCount: Math.max(0, to - from)
    }]
  }
}

describe('insertDesignMarkdownIntoWrite', () => {
  it('inserts at the saved caret with Markdown block spacing', () => {
    expect(insertDesignMarkdownIntoWrite(
      'Alpha\n\nOmega',
      selection(5, 5),
      '![Design](img/design.png)'
    )).toEqual({
      ok: true,
      content: 'Alpha\n\n![Design](img/design.png)\n\nOmega'
    })
  })

  it('places the image after the paragraph containing a selection', () => {
    expect(insertDesignMarkdownIntoWrite(
      'Alpha paragraph\nNext paragraph',
      selection(0, 5, 'Alpha'),
      '![Design](img/design.png)'
    )).toEqual({
      ok: true,
      content: 'Alpha paragraph\n\n![Design](img/design.png)\n\nNext paragraph'
    })
  })

  it('rejects a stale selection rather than guessing an insertion point', () => {
    expect(insertDesignMarkdownIntoWrite(
      'Changed paragraph',
      selection(0, 5, 'Alpha'),
      '![Design](img/design.png)'
    )).toEqual({ ok: false, reason: 'stale_selection' })
  })

  it('appends when Write has no saved selection or caret', () => {
    expect(insertDesignMarkdownIntoWrite(
      'Alpha',
      { text: '', ranges: [], charCount: 0 },
      '![Design](img/design.png)'
    )).toEqual({
      ok: true,
      content: 'Alpha\n\n![Design](img/design.png)\n'
    })
  })
})
