import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildWriteRichExtensions, parseWriteMarkdown } from '../markdown-manager'
import {
  createWriteRichTermPropagationPlugin,
  writeRichExternalSyncMeta,
  writeRichTermPropagationMeta
} from './term-propagation'

const schema = getSchema(buildWriteRichExtensions())

function docFromMarkdown(markdown: string): PMNode {
  return schema.nodeFromJSON(parseWriteMarkdown(markdown))
}

function stateFor(markdown: string): EditorState {
  return EditorState.create({
    schema,
    doc: docFromMarkdown(markdown),
    plugins: [createWriteRichTermPropagationPlugin()]
  })
}

function findText(doc: PMNode, phrase: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null
  doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return undefined
    const index = node.text.indexOf(phrase)
    if (index >= 0) found = { from: pos + index, to: pos + index + phrase.length }
    return undefined
  })
  if (!found) throw new Error(`phrase not found: ${phrase}`)
  return found
}

describe('write rich term propagation', () => {
  it('propagates a term replacement to other occurrences in the paragraph', () => {
    const state = stateFor('Alpha helps writers. Alpha keeps terminology aligned.\n')
    const range = findText(state.doc, 'Alpha')
    const tr = state.tr.insertText('Beta', range.from, range.to)
    const { state: nextState, transactions } = state.applyTransaction(tr)

    expect(nextState.doc.textContent).toBe('Beta helps writers. Beta keeps terminology aligned.')
    expect(
      transactions.some((transaction) => transaction.getMeta(writeRichTermPropagationMeta))
    ).toBe(true)
  })

  it('does not cascade on its own propagation transaction', () => {
    const state = stateFor('Alpha helps. Alpha aligns. Alpha repeats.\n')
    const range = findText(state.doc, 'Alpha')
    const { state: nextState } = state.applyTransaction(
      state.tr.insertText('Beta', range.from, range.to)
    )
    expect(nextState.doc.textContent).toBe('Beta helps. Beta aligns. Beta repeats.')
  })

  it('ignores external sync transactions', () => {
    const state = stateFor('Alpha helps writers. Alpha keeps terminology aligned.\n')
    const range = findText(state.doc, 'Alpha')
    const tr = state.tr.insertText('Beta', range.from, range.to)
    tr.setMeta(writeRichExternalSyncMeta, true)
    const { state: nextState } = state.applyTransaction(tr)
    expect(nextState.doc.textContent).toBe(
      'Beta helps writers. Alpha keeps terminology aligned.'
    )
  })

  it('ignores plain insertions without a deletion', () => {
    const state = stateFor('Alpha helps writers. Alpha keeps terminology aligned.\n')
    const { state: nextState } = state.applyTransaction(state.tr.insertText('x', 1, 1))
    expect(nextState.doc.textContent).toBe(
      'xAlpha helps writers. Alpha keeps terminology aligned.'
    )
  })
})
