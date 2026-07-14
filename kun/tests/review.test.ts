import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ReviewOutputSchema,
  StartReviewRequest,
  TurnItem
} from '../src/contracts/index.js'
import { parseReviewOutput, renderReviewOutput } from '../src/review/review-output.js'
import { resolveReviewTargetPrompt } from '../src/review/git-review-target.js'

describe('review contracts', () => {
  it('accepts review start requests and persisted review items', () => {
    const request = StartReviewRequest.parse({
      target: { kind: 'baseBranch', branch: 'main' },
      model: 'deepseek-chat'
    })
    expect(request.target).toEqual({ kind: 'baseBranch', branch: 'main' })

    const item = TurnItem.parse({
      id: 'item_review_1',
      turnId: 'turn_1',
      threadId: 'thr_1',
      role: 'assistant',
      status: 'completed',
      createdAt: '2026-06-04T00:00:00.000Z',
      finishedAt: '2026-06-04T00:00:01.000Z',
      kind: 'review',
      title: 'Review current changes',
      target: { kind: 'uncommittedChanges' },
      reviewText: 'No review findings.',
      output: {
        findings: [],
        overallCorrectness: 'patch is correct',
        overallExplanation: 'No blocking issues found.',
        overallConfidenceScore: 0.8
      }
    })
    expect(item.kind).toBe('review')
  })
})

describe('review output parsing', () => {
  it('parses Codex-style snake_case JSON and renders review text', () => {
    const output = parseReviewOutput(JSON.stringify({
      findings: [{
        title: '[P1] Missing bounds check',
        body: 'The new index can exceed the array length.',
        confidence_score: 0.9,
        priority: 1,
        code_location: {
          absolute_file_path: '/tmp/project/src/a.ts',
          line_range: { start: 10, end: 10 }
        }
      }],
      overall_correctness: 'patch is incorrect',
      overall_explanation: 'One correctness bug should be fixed.',
      overall_confidence_score: 0.85
    }))

    expect(ReviewOutputSchema.parse(output).findings).toHaveLength(1)
    expect(renderReviewOutput(output)).toContain('/tmp/project/src/a.ts:10-10')
  })

  it('falls back to plain text when the reviewer returns prose', () => {
    const output = parseReviewOutput('No obvious issues.')
    expect(output.findings).toEqual([])
    expect(output.overallExplanation).toBe('No obvious issues.')
  })
})

describe('review target prompt resolution', () => {
  it('resolves custom review instructions without requiring a git workspace', async () => {
    const resolved = await resolveReviewTargetPrompt({
      target: { kind: 'custom', instructions: 'Review src/auth.ts for regressions.' },
      workspace: '/tmp/not-a-git-workspace'
    })

    expect(resolved.title).toBe('Custom code review')
    expect(resolved.prompt).toContain('Review src/auth.ts for regressions.')
  })

  it('reviews only an explicitly selected nested repository', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-review-'))
    try {
      const nested = join(workspace, 'nested')
      await mkdir(nested)
      execFileSync('git', ['init', workspace], { stdio: 'pipe' })
      execFileSync('git', ['init', nested], { stdio: 'pipe' })
      await writeFile(join(workspace, 'outer.txt'), 'outer')
      await writeFile(join(nested, 'inner.txt'), 'inner')

      const resolved = await resolveReviewTargetPrompt({
        target: { kind: 'uncommittedChanges', repositoryRoot: nested },
        workspace
      })

      expect(resolved.prompt).toContain('inner.txt')
      expect(resolved.prompt).not.toContain('outer.txt')
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })

  it('rejects a repository root outside the canonical workspace', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-review-'))
    const outside = await mkdtemp(join(tmpdir(), 'workwise-review-outside-'))
    try {
      execFileSync('git', ['init', outside], { stdio: 'pipe' })
      await expect(resolveReviewTargetPrompt({
        target: { kind: 'uncommittedChanges', repositoryRoot: outside },
        workspace
      })).rejects.toThrow(/inside the workspace/)
    } finally {
      await Promise.all([
        rm(workspace, { recursive: true, force: true }),
        rm(outside, { recursive: true, force: true })
      ])
    }
  })
})
