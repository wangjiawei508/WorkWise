import { describe, expect, it } from 'vitest'
import type { WriteEditorSelectionState, WriteSelectionRange } from '../components/write/WriteMarkdownEditor'
import { writeSelectionStatesEqual } from './write-selection'

function range(overrides: Partial<WriteSelectionRange> = {}): WriteSelectionRange {
  return {
    from: 4,
    to: 9,
    startLine: 1,
    startColumn: 5,
    endLine: 1,
    endColumn: 9,
    text: 'hello',
    charCount: 5,
    ...overrides
  }
}

function selection(overrides: Partial<WriteEditorSelectionState> = {}): WriteEditorSelectionState {
  return {
    text: 'hello',
    ranges: [range()],
    charCount: 5,
    anchorRect: { left: 10, right: 60, top: 20, bottom: 36, width: 50, height: 16 },
    ...overrides
  }
}

describe('writeSelectionStatesEqual', () => {
  it('treats two empty selections as equal regardless of object identity', () => {
    expect(
      writeSelectionStatesEqual(
        { text: '', ranges: [], charCount: 0 },
        { text: '', ranges: [], charCount: 0 }
      )
    ).toBe(true)
  })

  it('treats identical non-empty selections as equal', () => {
    expect(writeSelectionStatesEqual(selection(), selection())).toBe(true)
  })

  it('detects differing range bounds', () => {
    expect(
      writeSelectionStatesEqual(selection(), selection({ ranges: [range({ to: 10, text: 'hello,' })] }))
    ).toBe(false)
  })

  it('detects differing text with same char count', () => {
    expect(
      writeSelectionStatesEqual(
        selection(),
        selection({ text: 'world', ranges: [range({ text: 'world' })] })
      )
    ).toBe(false)
  })

  it('detects anchor rect movement for the same range', () => {
    expect(
      writeSelectionStatesEqual(
        selection(),
        selection({ anchorRect: { left: 10, right: 60, top: 120, bottom: 136, width: 50, height: 16 } })
      )
    ).toBe(false)
  })

  it('treats missing and present anchor rects as different', () => {
    expect(writeSelectionStatesEqual(selection(), selection({ anchorRect: undefined }))).toBe(false)
  })
})
