import type {
  WriteEditorSelectionState,
  WriteSelectionAnchorRect,
  WriteSelectionRange
} from '../components/write/WriteMarkdownEditor'

function anchorRectsEqual(
  a: WriteSelectionAnchorRect | undefined,
  b: WriteSelectionAnchorRect | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.left === b.left &&
    a.right === b.right &&
    a.top === b.top &&
    a.bottom === b.bottom
  )
}

function rangesEqual(a: WriteSelectionRange, b: WriteSelectionRange): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.startLine === b.startLine &&
    a.startColumn === b.startColumn &&
    a.endLine === b.endLine &&
    a.endColumn === b.endColumn &&
    a.text === b.text
  )
}

/**
 * Semantic equality for editor selection snapshots. Typing emits a fresh
 * (usually empty) selection object on every keystroke; comparing before
 * publishing keeps the store reference stable so subscribers do not
 * re-render for no-op selection updates.
 */
export function writeSelectionStatesEqual(
  a: WriteEditorSelectionState,
  b: WriteEditorSelectionState
): boolean {
  if (a === b) return true
  if (a.charCount !== b.charCount || a.text !== b.text) return false
  if (a.ranges.length !== b.ranges.length) return false
  for (let index = 0; index < a.ranges.length; index += 1) {
    if (!rangesEqual(a.ranges[index], b.ranges[index])) return false
  }
  return anchorRectsEqual(a.anchorRect, b.anchorRect)
}
