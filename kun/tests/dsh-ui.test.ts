import { describe, expect, it } from 'vitest'
import {
  findDshUiActionNode,
  fingerprintDshUiBlock,
  parseDshUiBlocks
} from '../src/contracts/dsh-ui.js'

describe('dsh-ui', () => {
  it('accepts a bounded declarative block and ignores surrounding text', () => {
    const blocks = parseDshUiBlocks('Before\n```dsh-ui\n{"id":"summary","root":{"id":"layout","type":"col","children":[{"id":"title","type":"text","text":"Status"},{"id":"send","type":"button","label":"Apply","actionId":"apply"}]}}\n```\nAfter')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.root.type).toBe('col')
  })

  it('rejects malformed, unknown, unsafe, duplicate, and oversized blocks', () => {
    expect(parseDshUiBlocks('```dsh-ui\n{bad json}\n```')).toEqual([])
    expect(parseDshUiBlocks('```dsh-ui\n{"id":"x","root":{"id":"n","type":"iframe","src":"https://evil.example"}}\n```')).toEqual([])
    expect(parseDshUiBlocks('```dsh-ui\n{"id":"x","root":{"id":"n","type":"text","text":"ok","style":"background:url(https://evil.example)"}}\n```')).toEqual([])
    expect(parseDshUiBlocks('```dsh-ui\n{"id":"x","root":{"id":"r","type":"col","children":[{"id":"same","type":"text","text":"a"},{"id":"same","type":"text","text":"b"}]}}\n```')).toEqual([])
    const rows = Array.from({ length: 51 }, () => ['x'])
    expect(parseDshUiBlocks(`\`\`\`dsh-ui\n${JSON.stringify({ id: 'x', root: { id: 't', type: 'table', columns: ['a'], rows } })}\n\`\`\``)).toEqual([])
  })

  it('binds an action to one stable, addressable persisted node', () => {
    const [block] = parseDshUiBlocks('```dsh-ui\n{"id":"filters","root":{"id":"layout","type":"col","children":[{"id":"kind","type":"select","label":"Kind","name":"kind","actionId":"choose-kind","options":[{"label":"One","value":"one"},{"label":"Two","value":"two"}]}]}}\n```')
    expect(block).toBeDefined()
    if (!block) throw new Error('expected a valid dsh-ui block')

    const fingerprint = fingerprintDshUiBlock(block)
    expect(fingerprint).toMatch(/^[a-f0-9]{16}$/)
    expect(fingerprintDshUiBlock(structuredClone(block))).toBe(fingerprint)
    expect(findDshUiActionNode(block, 'choose-kind')).toMatchObject({
      id: 'kind',
      type: 'select',
      actionId: 'choose-kind'
    })
    expect(findDshUiActionNode(block, 'missing')).toBeUndefined()
  })

  it('rejects ambiguous action ids within one persisted block', () => {
    expect(parseDshUiBlocks('```dsh-ui\n{"id":"x","root":{"id":"layout","type":"row","children":[{"id":"first","type":"button","label":"First","actionId":"same"},{"id":"second","type":"button","label":"Second","actionId":"same"}]}}\n```')).toEqual([])
  })

  it('rejects password controls that try to persist a default value', () => {
    expect(parseDshUiBlocks('```dsh-ui\n{"id":"secret","root":{"id":"password","type":"input","label":"Password","name":"password","actionId":"set-password","inputType":"password","value":"must-not-persist"}}\n```')).toEqual([])
  })

  it('caps parsed blocks at the persisted assistant item limit', () => {
    const blocks = Array.from({ length: 21 }, (_, index) => (
      `\`\`\`dsh-ui\n${JSON.stringify({
        id: `block_${index}`,
        root: { id: `text_${index}`, type: 'text', text: `Block ${index}` }
      })}\n\`\`\``
    )).join('\n')

    expect(parseDshUiBlocks(blocks)).toHaveLength(20)
  })
})
