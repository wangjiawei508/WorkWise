import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildWriteRichExtensions, parseWriteMarkdown } from './markdown-manager'
import {
  buildWriteRichMarkdownProjection,
  posForProjectedOffset,
  projectedOffsetForPos
} from './markdown-projection'

const schema = getSchema(buildWriteRichExtensions())

function docFromMarkdown(markdown: string): PMNode {
  return schema.nodeFromJSON(parseWriteMarkdown(markdown))
}

const SAMPLE = [
  '# 标题一',
  '',
  '正文段落，包含 **加粗** 文本。',
  '',
  '- 项目甲',
  '- 项目乙',
  '',
  '1. 第一步',
  '2. 第二步',
  '',
  '- [ ] 待办',
  '',
  '> 引用内容',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '| 列A | 列B |',
  '| --- | --- |',
  '| 甲 | 乙 |',
  ''
].join('\n')

describe('buildWriteRichMarkdownProjection', () => {
  it('renders markdown-shaped lines with structural prefixes', () => {
    const doc = docFromMarkdown(SAMPLE)
    const projection = buildWriteRichMarkdownProjection(doc)
    expect(projection.text).toContain('# 标题一')
    expect(projection.text).toContain('正文段落，包含 加粗 文本。')
    expect(projection.text).toContain('- 项目甲')
    expect(projection.text).toContain('1. 第一步')
    expect(projection.text).toContain('2. 第二步')
    expect(projection.text).toContain('- [ ] 待办')
    expect(projection.text).toContain('> 引用内容')
    expect(projection.text).toContain('```ts')
    expect(projection.text).toContain('const x = 1')
    expect(projection.text).toContain('| 列A | 列B |')
    expect(projection.text).toContain('| 甲 | 乙 |')
  })

  it('separates top-level blocks with blank lines', () => {
    const doc = docFromMarkdown('# A\n\nB\n\nC\n')
    const projection = buildWriteRichMarkdownProjection(doc)
    expect(projection.text).toBe('# A\n\nB\n\nC')
  })

  it('caches the projection per document instance', () => {
    const doc = docFromMarkdown(SAMPLE)
    expect(buildWriteRichMarkdownProjection(doc)).toBe(buildWriteRichMarkdownProjection(doc))
  })
})

describe('projection position mapping', () => {
  it('round-trips every text position in mapped blocks', () => {
    const doc = docFromMarkdown(SAMPLE)
    const projection = buildWriteRichMarkdownProjection(doc)
    for (const block of projection.blocks) {
      for (let pos = block.pmStart; pos <= block.pmEnd; pos += 1) {
        const offset = projectedOffsetForPos(doc, projection, pos)
        expect(offset).not.toBeNull()
        const roundTripped = posForProjectedOffset(doc, projection, offset as number)
        expect(roundTripped).toBe(pos)
      }
    }
  })

  it('maps the projected offset of a known phrase back to its PM position', () => {
    const doc = docFromMarkdown('# Title\n\nHello world\n')
    const projection = buildWriteRichMarkdownProjection(doc)
    const offset = projection.text.indexOf('world')
    const pos = posForProjectedOffset(doc, projection, offset)
    expect(pos).not.toBeNull()
    expect(doc.textBetween(pos as number, (pos as number) + 'world'.length)).toBe('world')
  })

  it('maps positions inside marked (bold) text without drift', () => {
    const doc = docFromMarkdown('Some **bold** tail\n')
    const projection = buildWriteRichMarkdownProjection(doc)
    expect(projection.text).toBe('Some bold tail')
    const offset = projection.text.indexOf('tail')
    const pos = posForProjectedOffset(doc, projection, offset)
    expect(doc.textBetween(pos as number, (pos as number) + 4)).toBe('tail')
  })

  it('returns null for offsets outside any mapped block', () => {
    const doc = docFromMarkdown('a\n\n---\n\nb\n')
    const projection = buildWriteRichMarkdownProjection(doc)
    const hrOffset = projection.text.indexOf('---')
    expect(posForProjectedOffset(doc, projection, hrOffset)).toBeNull()
  })
})
