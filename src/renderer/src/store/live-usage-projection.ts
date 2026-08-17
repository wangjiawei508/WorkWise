import type { ThreadUsageSnapshot } from '../agent/types'

export type LiveUsageProjection = {
  turnId: string
  estimatedOutputTokens: number
  exactTotalTokens: number | null
  exactOutputTokens: number | null
  firstOutputAt: number | null
  lastOutputAt: number | null
  tokensPerSecond: number | null
}

export function emptyLiveUsageProjection(turnId: string): LiveUsageProjection {
  return {
    turnId,
    estimatedOutputTokens: 0,
    exactTotalTokens: null,
    exactOutputTokens: null,
    firstOutputAt: null,
    lastOutputAt: null,
    tokensPerSecond: null
  }
}

function estimatedTokens(text: string): number {
  const characters = Array.from(text).length
  return characters > 0 ? Math.max(1, Math.ceil(characters / 4)) : 0
}

export function applyLiveUsageDelta(
  current: LiveUsageProjection | undefined,
  turnId: string,
  text: string,
  now = Date.now()
): LiveUsageProjection {
  const base = current?.turnId === turnId ? current : emptyLiveUsageProjection(turnId)
  const added = estimatedTokens(text)
  if (added === 0) return base
  const firstOutputAt = base.firstOutputAt ?? now
  const total = base.estimatedOutputTokens + added
  const elapsedSeconds = Math.max(0.25, (now - firstOutputAt) / 1000)
  return {
    ...base,
    estimatedOutputTokens: total,
    firstOutputAt,
    lastOutputAt: now,
    tokensPerSecond: total / elapsedSeconds
  }
}

export function applyExactLiveUsage(
  current: LiveUsageProjection | undefined,
  turnId: string,
  usage: ThreadUsageSnapshot
): LiveUsageProjection {
  const base = current?.turnId === turnId ? current : emptyLiveUsageProjection(turnId)
  return {
    ...base,
    exactTotalTokens: usage.totalTokens,
    exactOutputTokens: usage.outputTokens
  }
}

export function resolveUsageTokenDisplay(
  threadTotalTokens: number | null,
  liveUsage: LiveUsageProjection | null | undefined
): { tokens: number; estimated: boolean } | null {
  if (liveUsage?.exactTotalTokens != null) {
    return { tokens: liveUsage.exactTotalTokens, estimated: false }
  }
  if (threadTotalTokens != null) {
    return { tokens: threadTotalTokens, estimated: false }
  }
  if (liveUsage) {
    return { tokens: liveUsage.estimatedOutputTokens, estimated: true }
  }
  return null
}
