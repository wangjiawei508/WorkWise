import { describe, expect, it } from 'vitest'
import type { AgentProfileV1 } from '@shared/agent-workbench'
import { cloneAgentProfile } from './agent-profile-center'

describe('cloneAgentProfile', () => {
  it('creates an editable independent clone without mutating the built-in profile', () => {
    const source: AgentProfileV1 = {
      id: 'review',
      name: 'Review',
      role: '审查',
      color: '#f59e0b',
      systemPrompt: 'Review carefully.',
      toolAllowlist: ['read'],
      mcpAllowlist: [],
      trustLevel: 'read-only',
      budget: { maxAttempts: 5, maxDurationMs: 1_000 },
      builtIn: true,
      source: 'built-in',
      revision: 1
    }

    const clone = cloneAgentProfile(source)
    clone.toolAllowlist.push('grep')

    expect(clone.id).toBe('review-custom')
    expect(clone.revision).toBe(0)
    expect(source.toolAllowlist).toEqual(['read'])
  })
})
