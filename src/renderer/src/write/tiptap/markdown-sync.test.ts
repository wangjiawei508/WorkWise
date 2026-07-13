import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildWriteRichExtensions, parseWriteMarkdown } from './markdown-manager'
import { computeBlockSyncReplacement } from './markdown-sync'

const schema = getSchema(buildWriteRichExtensions())

function docFromMarkdown(markdown: string): PMNode {
  return schema.nodeFromJSON(parseWriteMarkdown(markdown))
}

function applySync(current: PMNode, next: PMNode): { doc: PMNode; mappedPos: (pos: number) => number } {
  const replacement = computeBlockSyncReplacement(current, next)
  if (!replacement) return { doc: current, mappedPos: (pos) => pos }
  const state = EditorState.create({ schema, doc: current })
  const tr = state.tr
  if (replacement.nodes.length > 0) {
    tr.replaceWith(replacement.from, replacement.to, replacement.nodes)
  } else {
    tr.delete(replacement.from, replacement.to)
  }
  return { doc: tr.doc, mappedPos: (pos) => tr.mapping.map(pos) }
}

describe('computeBlockSyncReplacement', () => {
  it('returns null for identical documents', () => {
    const a = docFromMarkdown('# A\n\nB\n')
    const b = docFromMarkdown('# A\n\nB\n')
    expect(computeBlockSyncReplacement(a, b)).toBeNull()
  })

  it('replaces only the changed middle block', () => {
    const current = docFromMarkdown('# Title\n\nold paragraph\n\nfooter\n')
    const next = docFromMarkdown('# Title\n\nnew paragraph rewritten\n\nfooter\n')
    const replacement = computeBlockSyncReplacement(current, next)
    expect(replacement).not.toBeNull()
    expect(replacement!.nodes).toHaveLength(1)
    expect(replacement!.nodes[0].textContent).toBe('new paragraph rewritten')
    const { doc } = applySync(current, next)
    expect(doc.eq(next)).toBe(true)
  })

  it('handles appended blocks', () => {
    const current = docFromMarkdown('para one\n')
    const next = docFromMarkdown('para one\n\npara two\n')
    const { doc } = applySync(current, next)
    expect(doc.eq(next)).toBe(true)
  })

  it('handles removed blocks', () => {
    const current = docFromMarkdown('para one\n\npara two\n\npara three\n')
    const next = docFromMarkdown('para one\n\npara three\n')
    const { doc } = applySync(current, next)
    expect(doc.eq(next)).toBe(true)
  })

  it('keeps a cursor in an untouched leading block stable', () => {
    const current = docFromMarkdown('stable lead\n\ntail to change\n')
    const next = docFromMarkdown('stable lead\n\ncompletely different tail\n')
    const state = EditorState.create({
      schema,
      doc: current,
      selection: TextSelection.create(current, 5)
    })
    const replacement = computeBlockSyncReplacement(current, next)!
    const tr = state.tr.replaceWith(replacement.from, replacement.to, replacement.nodes)
    const nextState = state.apply(tr)
    expect(nextState.selection.from).toBe(5)
    expect(nextState.doc.eq(next)).toBe(true)
  })
})
