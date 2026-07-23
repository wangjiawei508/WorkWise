import type { WriteEditorSelectionState } from '../components/write/WriteMarkdownEditor'

export type DesignWriteInsertionResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'stale_selection' }

function markdownBlock(content: string, offset: number, reference: string): string {
  const before = content.slice(0, offset).replace(/[ \t]+$/u, '')
  const after = content.slice(offset).replace(/^[ \t]+/u, '')
  const beforeSpacing = before.length > 0 && !before.endsWith('\n\n')
    ? before.endsWith('\n') ? '\n' : '\n\n'
    : ''
  const afterSpacing = after.length === 0
    ? '\n'
    : after.startsWith('\n\n')
      ? ''
      : after.startsWith('\n')
        ? '\n'
        : '\n\n'
  return `${before}${beforeSpacing}${reference}${afterSpacing}${after}`
}

/**
 * Inserts a Design image reference at the last Write caret/selection.
 * A non-empty selection is preserved and the reference is placed after its
 * paragraph. If the selection no longer matches the saved content, insertion
 * is rejected instead of writing to an unexpected location.
 */
export function insertDesignMarkdownIntoWrite(
  content: string,
  selection: WriteEditorSelectionState,
  reference: string
): DesignWriteInsertionResult {
  const range = selection.ranges[0]
  if (!range) {
    return { ok: true, content: markdownBlock(content, content.length, reference) }
  }

  const from = Math.max(0, Math.min(content.length, Math.floor(range.from)))
  const to = Math.max(from, Math.min(content.length, Math.floor(range.to)))
  if (range.text && content.slice(from, to) !== range.text) {
    return { ok: false, reason: 'stale_selection' }
  }

  if (from === to) {
    return { ok: true, content: markdownBlock(content, from, reference) }
  }

  const lineEnd = content.indexOf('\n', to)
  return {
    ok: true,
    content: markdownBlock(content, lineEnd === -1 ? content.length : lineEnd + 1, reference)
  }
}
