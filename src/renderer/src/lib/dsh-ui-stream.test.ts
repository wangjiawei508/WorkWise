import { describe, expect, it } from 'vitest'
import { parseDshUiBlocks } from '../../../../kun/src/contracts/dsh-ui'
import { projectDshUiText } from './dsh-ui-stream'

function fence(value: unknown): string {
  return `\`\`\`dsh-ui\n${JSON.stringify(value)}\n\`\`\``
}

function block(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'status_card',
    root: { id: 'summary', type: 'stat', label: '状态', value: '完成' },
    ...overrides
  }
}

describe('streaming dsh-ui projection', () => {
  it('renders only complete safe prefixes while preserving an incomplete trailing fence', () => {
    const partial = '```dsh-ui\n{"id":"partial","root":'
    const result = projectDshUiText(`开始\n${fence(block())}\n继续\n${partial}`, { settled: false })

    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]).toMatchObject({ id: 'status_card', specFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/) })
    expect(result.markdown).not.toContain('status_card')
    expect(result.markdown).toContain(partial)
    expect(result.diagnostics).toEqual([])
  })

  it('keeps unsafe and oversized blocks as raw code and reports them only after settlement', () => {
    const unsafe = fence(block({
      root: {
        id: 'summary',
        type: 'text',
        text: '结果',
        style: 'background-image:url(https://attacker.example/pixel)'
      }
    }))
    const oversized = fence(block({
      id: 'oversized_card',
      root: { id: 'summary', type: 'text', text: 'x'.repeat(2_001) }
    }))

    const streaming = projectDshUiText(`${unsafe}\n${oversized}`, { settled: false })
    expect(streaming.blocks).toEqual([])
    expect(streaming.markdown).toContain('attacker.example')
    expect(streaming.markdown).toContain('oversized_card')
    expect(streaming.diagnostics).toEqual([])

    const settled = projectDshUiText(`${unsafe}\n${oversized}`, { settled: true })
    expect(settled.markdown).toContain('attacker.example')
    expect(settled.diagnostics.map((item) => item.code)).toEqual(['invalid_block', 'invalid_block'])
  })

  it('keeps incomplete settled fences visible and diagnoses the missing terminator', () => {
    const raw = '结果\n```dsh-ui\n{"id":"partial","root":'
    const result = projectDshUiText(raw, { settled: true })

    expect(result.blocks).toEqual([])
    expect(result.markdown).toBe(raw)
    expect(result.diagnostics).toEqual([{ code: 'unclosed_fence' }])
  })

  it('hides settled UI source only when the Runtime persisted the same block id', () => {
    const raw = fence(block())
    const rejected = projectDshUiText(raw, { settled: true, persistedBlockIds: [] })
    expect(rejected.markdown).toContain('status_card')
    expect(rejected.diagnostics).toEqual([{ code: 'runtime_rejected', blockId: 'status_card' }])

    const persisted = projectDshUiText(raw, { settled: true, persistedBlockIds: ['status_card'] })
    expect(persisted.markdown).not.toContain('status_card')
    expect(persisted.diagnostics).toEqual([])
  })

  it('uses the same normalized fingerprint as the Runtime parser', () => {
    const raw = fence(block())
    const runtime = parseDshUiBlocks(raw)[0]
    const streaming = projectDshUiText(raw, { settled: false }).blocks[0]

    expect(streaming?.specFingerprint).toBe(runtime?.specFingerprint)
  })
})
