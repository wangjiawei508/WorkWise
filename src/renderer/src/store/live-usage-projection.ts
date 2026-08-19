import type { ThreadUsageSnapshot } from '../agent/types'

export type LiveUsageProjection = {
  turnId: string
  estimatedOutputCharacters: number
  estimatedOutputTokens: number
  estimatedOutputTokensAtExactUsage: number | null
  exactUsageSeq: number | null
  exactTotalTokens: number | null
  exactOutputTokens: number | null
  firstOutputAt: number | null
  lastOutputAt: number | null
  tokensPerSecond: number | null
}

export function emptyLiveUsageProjection(turnId: string): LiveUsageProjection {
  return {
    turnId,
    estimatedOutputCharacters: 0,
    estimatedOutputTokens: 0,
    estimatedOutputTokensAtExactUsage: null,
    exactUsageSeq: null,
    exactTotalTokens: null,
    exactOutputTokens: null,
    firstOutputAt: null,
    lastOutputAt: null,
    tokensPerSecond: null
  }
}

function estimatedTokens(characters: number): number {
  return characters > 0 ? Math.max(1, Math.ceil(characters / 4)) : 0
}

export function applyLiveUsageDelta(
  current: LiveUsageProjection | undefined,
  turnId: string,
  text: string,
  now = Date.now()
): LiveUsageProjection {
  const base = current?.turnId === turnId ? current : emptyLiveUsageProjection(turnId)
  const addedCharacters = Array.from(text).length
  if (addedCharacters === 0) return base
  const firstOutputAt = base.firstOutputAt ?? now
  const estimatedOutputCharacters = base.estimatedOutputCharacters + addedCharacters
  const total = estimatedTokens(estimatedOutputCharacters)
  const elapsedSeconds = Math.max(0.25, (now - firstOutputAt) / 1000)
  return {
    ...base,
    estimatedOutputCharacters,
    estimatedOutputTokens: total,
    firstOutputAt,
    lastOutputAt: now,
    tokensPerSecond: total / elapsedSeconds
  }
}

export function applyExactLiveUsage(
  current: LiveUsageProjection | undefined,
  turnId: string,
  usage: ThreadUsageSnapshot,
  seq?: number
): LiveUsageProjection {
  const base = current?.turnId === turnId ? current : emptyLiveUsageProjection(turnId)
  if (seq !== undefined && base.exactUsageSeq !== null && seq <= base.exactUsageSeq) return base
  return {
    ...base,
    estimatedOutputTokensAtExactUsage: base.estimatedOutputTokens,
    exactUsageSeq: seq ?? base.exactUsageSeq,
    exactTotalTokens: usage.totalTokens,
    exactOutputTokens: usage.outputTokens
  }
}

export function resolveUsageTokenDisplay(
  threadTotalTokens: number | null,
  liveUsage: LiveUsageProjection | null | undefined,
  activeTurn = false
): { tokens: number; estimated: boolean } | null {
  if (liveUsage?.exactTotalTokens != null) {
    const estimatedAfterExact = Math.max(
      0,
      liveUsage.estimatedOutputTokens - (
        liveUsage.estimatedOutputTokensAtExactUsage ?? liveUsage.estimatedOutputTokens
      )
    )
    if (estimatedAfterExact > 0) {
      return { tokens: liveUsage.exactTotalTokens + estimatedAfterExact, estimated: true }
    }
    return { tokens: liveUsage.exactTotalTokens, estimated: false }
  }
  if (threadTotalTokens != null) {
    if (activeTurn && liveUsage?.estimatedOutputTokens) {
      return { tokens: threadTotalTokens + liveUsage.estimatedOutputTokens, estimated: true }
    }
    return { tokens: threadTotalTokens, estimated: false }
  }
  if (liveUsage) {
    return { tokens: liveUsage.estimatedOutputTokens, estimated: true }
  }
  return null
}
