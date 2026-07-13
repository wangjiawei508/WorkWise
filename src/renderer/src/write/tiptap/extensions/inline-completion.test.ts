import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildWriteRichExtensions, parseWriteMarkdown } from '../markdown-manager'
import { buildWriteRichMarkdownProjection } from '../markdown-projection'
import {
  buildRichCompletionContext,
  insertCompletionText,
  writeRichInlineCompletionTestInternals
} from './inline-completion'

const schema = getSchema(buildWriteRichExtensions())

function docFromMarkdown(markdown: string): PMNode {
  return schema.nodeFromJSON(parseWriteMarkdown(markdown))
}

function stateWithCursorAfter(markdown: string, phrase: string): EditorState {
  const doc = docFromMarkdown(markdown)
  let cursor = -1
  doc.descendants((node, pos) => {
    if (cursor >= 0 || !node.isText || !node.text) return undefined
    const index = node.text.indexOf(phrase)
    if (index >= 0) cursor = pos + index + phrase.length
    return undefined
  })
  if (cursor < 0) throw new Error(`phrase not found: ${phrase}`)
  return EditorState.create({ doc, selection: TextSelection.create(doc, cursor) })
}

describe('buildRichCompletionContext', () => {
  it('produces a markdown-shaped context at the cursor', () => {
    const state = stateWithCursorAfter(
      '# 草稿\n\n- 第一项内容\n- 第二项继续写',
      '第二项继续写'
    )
    const context = buildRichCompletionContext(state, '/tmp/draft.md')
    expect(context).not.toBeNull()
    expect(context?.filePath).toBe('/tmp/draft.md')
    expect(context?.currentLinePrefix).toBe('- 第二项继续写')
    expect(context?.hasListContext).toBe(true)
    expect(context?.isAtLineEnd).toBe(true)
    expect(context?.prefixWindow).toContain('# 草稿')
  })

  it('returns null for non-empty selections', () => {
    const doc = docFromMarkdown('hello world')
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 6)
    })
    expect(buildRichCompletionContext(state, '/tmp/a.md')).toBeNull()
  })
})

describe('insertCompletionText', () => {
  function apply(markdown: string, phrase: string, completion: string): EditorState {
    let state = stateWithCursorAfter(markdown, phrase)
    const dispatch = (tr: Transaction): void => {
      state = state.apply(tr)
    }
    const inserted = insertCompletionText(state, dispatch, state.selection.head, completion)
    expect(inserted).toBe(true)
    return state
  }

  it('inserts plain prose as text', () => {
    const state = apply('写到一半的句子', '一半的', '内容就这样补全了。')
    expect(state.doc.textContent).toBe('写到一半的内容就这样补全了。句子')
  })

  it('parses markdown completions into real inline marks', () => {
    const state = apply('start ', 'start ', 'with **bold** tail')
    expect(state.doc.textContent).toContain('with bold tail')
    let boldFound = false
    state.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === 'bold')) boldFound = true
      return undefined
    })
    expect(boldFound).toBe(true)
  })

  it('parses multi-line completions into block nodes', () => {
    const state = apply('引子', '引子', '继续。\n\n- 列表一\n- 列表二')
    const projection = buildWriteRichMarkdownProjection(state.doc)
    expect(projection.text).toContain('- 列表一')
    expect(projection.text).toContain('- 列表二')
  })
})

describe('mapEditActionToDoc', () => {
  const { mapEditActionToDoc } = writeRichInlineCompletionTestInternals

  it('maps projected edit offsets back to the document and validates the original', () => {
    const doc = docFromMarkdown('Alpha helps writers stay aligned.')
    const state = EditorState.create({ doc })
    const projection = buildWriteRichMarkdownProjection(doc)
    const from = projection.text.indexOf('helps')
    const action = {
      kind: 'edit' as const,
      from,
      to: from + 'helps'.length,
      original: 'helps',
      replacement: 'guides',
      scopeKind: 'selection' as const
    }
    const mapped = mapEditActionToDoc(state, action)
    expect(mapped).not.toBeNull()
    expect(doc.textBetween(mapped!.from, mapped!.to)).toBe('helps')
  })

  it('rejects stale actions whose original text no longer matches', () => {
    const doc = docFromMarkdown('Alpha helps writers stay aligned.')
    const state = EditorState.create({ doc })
    const action = {
      kind: 'edit' as const,
      from: 0,
      to: 5,
      original: 'Bravo',
      replacement: 'x',
      scopeKind: 'selection' as const
    }
    expect(mapEditActionToDoc(state, action)).toBeNull()
  })
})
