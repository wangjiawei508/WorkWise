import { describe, expect, it } from 'vitest'
import {
  applySddDerivedStatuses,
  buildSddTraceSnapshot,
  computeSddCoverage,
  deriveSddStatuses,
  diffSddRequirementChanges,
  parseSddPlanCovers,
  parseSddRequirementBlocks,
  setSddRequirementStatus
} from './sdd-trace'

const DRAFT = [
  '# 导出功能需求',
  '',
  '背景说明，不属于任何需求块。',
  '',
  '### R-1: 工具栏导出按钮 {planned}',
  '用户在工具栏看到导出入口。',
  '- [ ] 按钮在工具栏可见',
  '- [x] 禁用态有提示',
  '',
  '### R-2: CSV 内容完整',
  '',
  '```md',
  '### R-9: 围栏里的假标题 {done}',
  '```',
  '',
  '- [ ] 包含全部列',
  '',
  '## 其他备注',
  '与需求无关的内容。',
  ''
].join('\n')

describe('parseSddRequirementBlocks', () => {
  it('parses ids, titles, statuses, and acceptance items', () => {
    const blocks = parseSddRequirementBlocks(DRAFT)
    expect(blocks.map((b) => b.id)).toEqual(['R-1', 'R-2'])
    expect(blocks[0]).toMatchObject({
      title: '工具栏导出按钮',
      status: 'planned',
      headingLevel: 3
    })
    expect(blocks[0].acceptance).toEqual([
      { text: '按钮在工具栏可见', checked: false, lineIndex: 6 },
      { text: '禁用态有提示', checked: true, lineIndex: 7 }
    ])
    expect(blocks[1].status).toBe('draft')
    expect(blocks[1].acceptance.map((a) => a.text)).toEqual(['包含全部列'])
  })

  it('ignores requirement-looking headings inside code fences', () => {
    const blocks = parseSddRequirementBlocks(DRAFT)
    expect(blocks.some((b) => b.id === 'R-9')).toBe(false)
  })

  it('ends a block at the next same-or-higher heading', () => {
    const blocks = parseSddRequirementBlocks(DRAFT)
    const r2 = blocks[1]
    expect(DRAFT.split('\n')[r2.endLineIndex]).toBe('## 其他备注')
  })
})

describe('setSddRequirementStatus', () => {
  it('rewrites only the heading status token', () => {
    const next = setSddRequirementStatus(DRAFT, 'R-2', 'building')
    expect(next).toContain('### R-2: CSV 内容完整 {building}')
    expect(next).toContain('### R-1: 工具栏导出按钮 {planned}')
    expect(next.split('\n').length).toBe(DRAFT.split('\n').length)
  })

  it('replaces an existing token instead of stacking', () => {
    const next = setSddRequirementStatus(DRAFT, 'R-1', 'done')
    expect(next).toContain('### R-1: 工具栏导出按钮 {done}')
    expect(next).not.toContain('{planned}')
  })

  it('returns input unchanged for unknown ids', () => {
    expect(setSddRequirementStatus(DRAFT, 'R-7', 'done')).toBe(DRAFT)
  })
})

const PLAN = [
  '# 实施计划',
  '- [x] 在工具栏添加导出按钮 (covers: R-1)',
  '- [ ] 按钮禁用态与提示 (covers: R-1)',
  '- [x] 导出器输出全部列（covers: R-2, R-1）',
  '- [ ] 与需求无关的杂项步骤',
  ''
].join('\n')

describe('parseSddPlanCovers / computeSddCoverage', () => {
  it('parses covers tags including full-width punctuation', () => {
    const items = parseSddPlanCovers(PLAN)
    expect(items).toHaveLength(3)
    expect(items[2].requirementIds).toEqual(['R-2', 'R-1'])
    expect(items[2].checked).toBe(true)
    expect(items[2].text).toBe('导出器输出全部列')
  })

  it('computes per-requirement progress and uncovered ids', () => {
    const blocks = parseSddRequirementBlocks(DRAFT)
    const { perRequirement, uncoveredIds } = computeSddCoverage(blocks, parseSddPlanCovers(PLAN))
    expect(perRequirement).toEqual([
      { id: 'R-1', totalSteps: 3, doneSteps: 2 },
      { id: 'R-2', totalSteps: 1, doneSteps: 1 }
    ])
    expect(uncoveredIds).toEqual([])
  })
})

describe('deriveSddStatuses', () => {
  it('moves statuses forward but never backward', () => {
    const blocks = parseSddRequirementBlocks(DRAFT)
    const coverage = computeSddCoverage(blocks, parseSddPlanCovers(PLAN)).perRequirement
    const derived = deriveSddStatuses(blocks, coverage)
    expect(derived).toEqual({ 'R-1': 'building', 'R-2': 'done' })

    const verified = setSddRequirementStatus(DRAFT, 'R-2', 'verified')
    const verifiedBlocks = parseSddRequirementBlocks(verified)
    expect(deriveSddStatuses(verifiedBlocks, coverage)).toEqual({ 'R-1': 'building' })
  })

  it('applies derived statuses onto the markdown', () => {
    const blocks = parseSddRequirementBlocks(DRAFT)
    const coverage = computeSddCoverage(blocks, parseSddPlanCovers(PLAN)).perRequirement
    const next = applySddDerivedStatuses(DRAFT, deriveSddStatuses(blocks, coverage))
    expect(next).toContain('R-1: 工具栏导出按钮 {building}')
    expect(next).toContain('R-2: CSV 内容完整 {done}')
  })
})

describe('trace snapshot diffing', () => {
  it('detects changed and added requirement blocks', () => {
    const snapshot = buildSddTraceSnapshot(DRAFT, '.kunplan/sdd-x.md')
    const edited = `${DRAFT.replace('用户在工具栏看到导出入口。', '入口移到右键菜单。')}\n### R-3: 新增需求\n- [ ] 新验收\n`
    const diff = diffSddRequirementChanges(edited, snapshot)
    expect(diff.changedIds).toEqual(['R-1'])
    expect(diff.addedIds).toEqual(['R-3'])
  })

  it('treats status-only changes as unchanged content', () => {
    const snapshot = buildSddTraceSnapshot(DRAFT, '.kunplan/sdd-x.md')
    const statusOnly = setSddRequirementStatus(DRAFT, 'R-1', 'done')
    expect(diffSddRequirementChanges(statusOnly, snapshot).changedIds).toEqual([])
  })
})
