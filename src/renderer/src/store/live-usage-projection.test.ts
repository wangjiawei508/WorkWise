import { describe, expect, it } from 'vitest'
import {
  applyExactLiveUsage,
  applyLiveUsageDelta,
  resolveUsageTokenDisplay
} from './live-usage-projection'

describe('live usage projection', () => {
  it('estimates incremental output and keeps TPS stable without a new chunk', () => {
    const first = applyLiveUsageDelta(undefined, 'turn-1', 'abcdefgh', 1_000)
    const second = applyLiveUsageDelta(first, 'turn-1', 'ijkl', 2_000)
    const unchanged = applyLiveUsageDelta(second, 'turn-1', '', 10_000)
    expect(second.estimatedOutputTokens).toBe(3)
    expect(unchanged.tokensPerSecond).toBe(second.tokensPerSecond)
  })

  it('resets estimates for a new turn and replaces them with exact usage', () => {
    const first = applyLiveUsageDelta(undefined, 'turn-1', 'abcdefgh', 1_000)
    const nextTurn = applyLiveUsageDelta(first, 'turn-2', 'abcd', 2_000)
    expect(nextTurn.estimatedOutputTokens).toBe(1)
    const exact = applyExactLiveUsage(nextTurn, 'turn-2', {
      inputTokens: 20,
      outputTokens: 8,
      reasoningTokens: 2,
      cachedTokens: 0,
      cacheMissTokens: 20,
      cacheHitRate: 0,
      totalTokens: 28,
      costUsd: 0.01,
      costCny: null,
      cacheSavingsUsd: 0,
      cacheSavingsCny: null,
      tokenEconomySavingsTokens: 0,
      tokenEconomySavingsUsd: 0,
      tokenEconomySavingsCny: null,
      turns: 1
    })
    expect(exact.exactTotalTokens).toBe(28)
    expect(exact.exactOutputTokens).toBe(8)
  })

  it('shows live exact totals before the thread usage refresh resolves', () => {
    expect(resolveUsageTokenDisplay(null, {
      ...applyLiveUsageDelta(undefined, 'turn-1', 'estimated output', 1_000),
      exactTotalTokens: 144
    })).toEqual({ tokens: 144, estimated: false })
    expect(resolveUsageTokenDisplay(null, applyLiveUsageDelta(
      undefined,
      'turn-1',
      'estimated output',
      1_000
    ))).toEqual({ tokens: 4, estimated: true })
  })
})
