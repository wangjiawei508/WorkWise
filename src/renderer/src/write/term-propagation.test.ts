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
      'i build WorkWise, li is amazing ui production.',
      'workwise can write paper, also can code. workwise is use',
      'deepseek api, but it not only that.',
      '',
      'workwise in another paragraph stays untouched.'
    ].join('\n')
    const seedFrom = content.indexOf('WorkWise')

    const changes = buildWriteTermPropagationChanges(content, {
      from: seedFrom,
      to: seedFrom + 'WorkWise'.length,
      deletedText: 'workwise',
      insertedText: 'WorkWise'
    })

    expect(changes).toHaveLength(2)
    expect(applyChanges(content, changes)).toBe([
      'i build WorkWise, li is amazing ui production.',
      'WorkWise can write paper, also can code. WorkWise is use',
      'deepseek api, but it not only that.',
      '',
      'workwise in another paragraph stays untouched.'
    ].join('\n'))
  })

  it('propagates a term rename such as workwise to DXGUI', () => {
    const content = 'DXGUI is here. workwise is there. workwise again.'
    const changes = buildWriteTermPropagationChanges(content, {
      from: 0,
      to: 'DXGUI'.length,
      deletedText: 'workwise',
      insertedText: 'DXGUI'
    })

    expect(applyChanges(content, changes)).toBe('DXGUI is here. DXGUI is there. DXGUI again.')
  })

  it('does not replace partial word matches', () => {
    const content = 'WorkWise works. myworkwise should not. workwise should.'
    const seedFrom = content.indexOf('WorkWise')

    const changes = buildWriteTermPropagationChanges(content, {
      from: seedFrom,
      to: seedFrom + 'WorkWise'.length,
      deletedText: 'workwise',
      insertedText: 'WorkWise'
    })

    expect(applyChanges(content, changes)).toBe(
      'WorkWise works. myworkwise should not. WorkWise should.'
    )
  })

  it('propagates canonical casing after an incremental case edit', () => {
    const content = 'WorkWise works. workwise should follow. deepseek api should not.'
    const seedFrom = content.indexOf('WorkWise')

    const changes = buildWriteCanonicalTermPropagationChanges(content, {
      from: seedFrom,
      to: seedFrom + 1,
      deletedText: 'd',
      insertedText: 'D'
    })

    expect(applyChanges(content, changes)).toBe(
      'WorkWise works. WorkWise should follow. deepseek api should not.'
    )
  })
})
