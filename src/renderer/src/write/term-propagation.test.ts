import { describe, expect, it } from 'vitest'
import {
  buildWriteCanonicalTermPropagationChanges,
  buildWriteTermPropagationChanges
} from './term-propagation'

function applyChanges(
  content: string,
  changes: Array<{ from: number; to: number; insert: string }>
): string {
  let next = content
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    next = `${next.slice(0, change.from)}${change.insert}${next.slice(change.to)}`
  }
  return next
}

describe('write term propagation', () => {
  it('propagates a case-only phrase replacement within the same paragraph', () => {
    const content = [
      'i build WORKGPT, li is amazing ui production.',
      'workgpt can write paper, also can code. workgpt is use',
      'deepseek api, but it not only that.',
      '',
      'workgpt in another paragraph stays untouched.'
    ].join('\n')
    const seedFrom = content.indexOf('WORKGPT')

    const changes = buildWriteTermPropagationChanges(content, {
      from: seedFrom,
      to: seedFrom + 'WORKGPT'.length,
      deletedText: 'workgpt',
      insertedText: 'WORKGPT'
    })

    expect(changes).toHaveLength(2)
    expect(applyChanges(content, changes)).toBe([
      'i build WORKGPT, li is amazing ui production.',
      'WORKGPT can write paper, also can code. WORKGPT is use',
      'deepseek api, but it not only that.',
      '',
      'workgpt in another paragraph stays untouched.'
    ].join('\n'))
  })

  it('propagates a term rename such as workgpt to DXGUI', () => {
    const content = 'DXGUI is here. workgpt is there. workgpt again.'
    const changes = buildWriteTermPropagationChanges(content, {
      from: 0,
      to: 'DXGUI'.length,
      deletedText: 'workgpt',
      insertedText: 'DXGUI'
    })

    expect(applyChanges(content, changes)).toBe('DXGUI is here. DXGUI is there. DXGUI again.')
  })

  it('does not replace partial word matches', () => {
    const content = 'WORKGPT works. myworkgpt should not. workgpt should.'
    const seedFrom = content.indexOf('WORKGPT')

    const changes = buildWriteTermPropagationChanges(content, {
      from: seedFrom,
      to: seedFrom + 'WORKGPT'.length,
      deletedText: 'workgpt',
      insertedText: 'WORKGPT'
    })

    expect(applyChanges(content, changes)).toBe(
      'WORKGPT works. myworkgpt should not. WORKGPT should.'
    )
  })

  it('propagates canonical casing after an incremental case edit', () => {
    const content = 'WORKGPT works. workgpt should follow. deepseek api should not.'
    const seedFrom = content.indexOf('WORKGPT')

    const changes = buildWriteCanonicalTermPropagationChanges(content, {
      from: seedFrom,
      to: seedFrom + 1,
      deletedText: 'd',
      insertedText: 'D'
    })

    expect(applyChanges(content, changes)).toBe(
      'WORKGPT works. WORKGPT should follow. deepseek api should not.'
    )
  })
})
