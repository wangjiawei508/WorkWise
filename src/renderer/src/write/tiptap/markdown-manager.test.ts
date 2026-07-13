import { describe, expect, it } from 'vitest'
import {
  WRITE_RICH_MAX_CHARS,
  auditWriteMarkdownFidelity,
  parseWriteMarkdown,
  serializeWriteMarkdown
} from './markdown-manager'

const SIMPLE_DOC = [
  '# 需求草稿',
  '',
  '这是一段包含 **加粗** 和 *斜体* 的中文说明。',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '- [ ] 待办事项',
  '- [x] 已完成事项',
  '',
  '| 字段 | 说明 |',
  '| --- | --- |',
  '| `id` | 主键 |',
  '',
  '```ts',
  'const a = 1',
  '```',
  '',
  '![架构图](images/arch.png)',
  ''
].join('\n')

describe('write markdown round-trip', () => {
  it('round-trips LLM-style markdown losslessly after normalization', () => {
    const doc = parseWriteMarkdown(SIMPLE_DOC)
    const firstPass = serializeWriteMarkdown(doc)
    const secondPass = serializeWriteMarkdown(parseWriteMarkdown(firstPass))
    expect(secondPass).toBe(firstPass)
  })

  it('keeps GFM task list and table content across the round trip', () => {
    const firstPass = serializeWriteMarkdown(parseWriteMarkdown(SIMPLE_DOC))
    expect(firstPass).toContain('- [ ] 待办事项')
    expect(firstPass).toContain('- [x] 已完成事项')
    expect(firstPass).toContain('`id`')
    expect(firstPass).toContain('主键')
    expect(firstPass).toContain('![架构图](images/arch.png)')
  })
})

describe('auditWriteMarkdownFidelity', () => {
  it('accepts simple generated markdown', () => {
    const fidelity = auditWriteMarkdownFidelity(SIMPLE_DOC)
    expect(fidelity.eligible).toBe(true)
  })

  it('accepts an empty document', () => {
    expect(auditWriteMarkdownFidelity('').eligible).toBe(true)
  })

  it('rejects ordered-list hard-wrapped continuations that lose characters', () => {
    const doc = [
      '1. Add protocol fields in `kun/src/contracts/`.',
      '2. Add agent behavior in `kun/src/loop/`, or a',
      '   new port/adapter under `kun/src/ports/`.',
      ''
    ].join('\n')
    const fidelity = auditWriteMarkdownFidelity(doc)
    expect(fidelity.eligible).toBe(false)
  })

  it('rejects raw HTML blocks that keep mutating across passes', () => {
    const doc = [
      '<a href="https://github.com/x/y">',
      '  <img src="https://contrib.rocks/image?repo=x/y" />',
      '</a>',
      ''
    ].join('\n')
    const fidelity = auditWriteMarkdownFidelity(doc)
    expect(fidelity.eligible).toBe(false)
  })

  it('rejects documents above the rich-mode size limit', () => {
    const fidelity = auditWriteMarkdownFidelity('a'.repeat(WRITE_RICH_MAX_CHARS + 1))
    expect(fidelity).toMatchObject({ eligible: false })
  })
})
