import { describe, expect, it } from 'vitest'
import type { ThreadTodoList } from '../agent/types'
import { todoContentHash } from '../plan/plan-todo-sync'
import { computeSddTrace } from './sdd-trace-compute'

const REQUIREMENT = [
  '### R-1: 导出按钮 {planned}',
  '- [ ] 按钮可见',
  '',
  '### R-2: CSV 完整 {planned}',
  '- [ ] 全部列',
  ''
].join('\n')

const PLAN = [
  '- [ ] 添加导出按钮 (covers: R-1)',
  '- [ ] 实现 CSV 导出器 (covers: R-2)',
  ''
].join('\n')

const PLAN_PATH = '.workwise/plans/sdd-x.md'

function todosWith(status: 'pending' | 'in_progress' | 'completed', rawText: string): ThreadTodoList {
  return {
    threadId: 't1',
    updatedAt: '2026-06-10T00:00:00Z',
    items: [
      {
        id: 'todo-1',
        content: rawText,
        status,
        source: {
          kind: 'plan',
          planId: 'p1',
          relativePath: PLAN_PATH,
          ordinal: 0,
          contentHash: todoContentHash(rawText)
        },
        createdAt: '2026-06-10T00:00:00Z',
        updatedAt: '2026-06-10T00:00:00Z'
      }
    ]
  }
}

describe('computeSddTrace', () => {
  it('reports coverage from plan covers tags alone', () => {
    const result = computeSddTrace({
      requirementMarkdown: REQUIREMENT,
      planMarkdown: PLAN,
      planRelativePath: PLAN_PATH
    })
    expect(result.uncoveredIds).toEqual([])
    expect(result.perRequirement).toEqual([
      { id: 'R-1', totalSteps: 1, doneSteps: 0 },
      { id: 'R-2', totalSteps: 1, doneSteps: 0 }
    ])
    expect(result.derivedStatuses).toEqual({})
  })

  it('marks a requirement as building when its thread todo is in progress', () => {
    const result = computeSddTrace({
      requirementMarkdown: REQUIREMENT,
      planMarkdown: PLAN,
      planRelativePath: PLAN_PATH,
      threadTodos: todosWith('in_progress', '添加导出按钮 (covers: R-1)')
    })
    expect(result.derivedStatuses).toEqual({ 'R-1': 'building' })
  })

  it('counts completed thread todos as done steps', () => {
    const result = computeSddTrace({
      requirementMarkdown: REQUIREMENT,
      planMarkdown: PLAN,
      planRelativePath: PLAN_PATH,
      threadTodos: todosWith('completed', '添加导出按钮 (covers: R-1)')
    })
    expect(result.perRequirement[0]).toEqual({ id: 'R-1', totalSteps: 1, doneSteps: 1 })
    expect(result.derivedStatuses).toEqual({ 'R-1': 'done' })
  })

  it('ignores todos from other plan files', () => {
    const todos = todosWith('completed', '添加导出按钮 (covers: R-1)')
    todos.items[0].source = { ...todos.items[0].source!, relativePath: '.workwise/plans/other.md' }
    const result = computeSddTrace({
      requirementMarkdown: REQUIREMENT,
      planMarkdown: PLAN,
      planRelativePath: PLAN_PATH,
      threadTodos: todos
    })
    expect(result.derivedStatuses).toEqual({})
  })

  it('flags every requirement as uncovered without a plan', () => {
    const result = computeSddTrace({
      requirementMarkdown: REQUIREMENT,
      planMarkdown: null,
      planRelativePath: PLAN_PATH
    })
    expect(result.uncoveredIds).toEqual(['R-1', 'R-2'])
  })
})
