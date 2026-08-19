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

  it('produces the same estimate regardless of stream chunk boundaries', () => {
    const whole = applyLiveUsageDelta(undefined, 'turn-1', 'abcdefgh', 1_000)
    const fragmented = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].reduce(
      (projection, text, index) => applyLiveUsageDelta(
        projection,
        'turn-1',
        text,
        1_000 + index * 100
      ),
      undefined as ReturnType<typeof applyLiveUsageDelta> | undefined
    )

    expect(fragmented?.estimatedOutputTokens).toBe(whole.estimatedOutputTokens)
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

  it('adds the active turn estimate to the last exact thread total', () => {
    expect(resolveUsageTokenDisplay(
      100,
      applyLiveUsageDelta(undefined, 'turn-1', 'abcdefgh', 1_000),
      true
    )).toEqual({ tokens: 102, estimated: true })
  })

  it('continues projecting deltas received after an intermediate exact usage event', () => {
    const beforeExact = applyLiveUsageDelta(undefined, 'turn-1', 'abcdefgh', 1_000)
    const exact = applyExactLiveUsage(beforeExact, 'turn-1', {
      inputTokens: 20,
      outputTokens: 2,
      reasoningTokens: 0,
      cachedTokens: 0,
      cacheMissTokens: 20,
      cacheHitRate: 0,
      totalTokens: 22,
      costUsd: 0.01,
      costCny: null,
      cacheSavingsUsd: 0,
      cacheSavingsCny: null,
      tokenEconomySavingsTokens: 0,
      tokenEconomySavingsUsd: 0,
      tokenEconomySavingsCny: null,
      turns: 1
    })
    const afterExact = applyLiveUsageDelta(exact, 'turn-1', 'ijkl', 2_000)

    expect(resolveUsageTokenDisplay(null, exact)).toEqual({ tokens: 22, estimated: false })
    expect(resolveUsageTokenDisplay(null, afterExact)).toEqual({ tokens: 23, estimated: true })
  })
})
