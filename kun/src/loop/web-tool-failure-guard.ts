import type { ToolCallLike } from '../ports/tool-host.js'

export type WebToolFailureGuardOptions = {
  threshold?: number
}

const DEFAULT_THRESHOLD = 2
const WEB_TOOL_NAMES = new Set(['web_fetch', 'web_search'])

export class WebToolFailureGuard {
  private readonly threshold: number
  private consecutiveFailures = 0
  private blocked = false
  private successfulResult = false

  constructor(options: WebToolFailureGuardOptions = {}) {
    this.threshold = Math.max(1, Math.floor(options.threshold ?? DEFAULT_THRESHOLD))
  }

  inspect(call: ToolCallLike): { suppress: boolean; reason?: string } {
    if (!isWebToolCall(call)) return { suppress: false }
    if (!this.blocked) return { suppress: false }
    return {
      suppress: true,
      reason:
        'web tools were blocked for the rest of this turn after consecutive failures. ' +
        'Do not guess URLs or claim current information was verified. Give a clear degraded response instead.'
    }
  }

  isBlocked(): boolean {
    return this.blocked
  }

  shouldFailDegradedCompletion(): boolean {
    return this.blocked && !this.successfulResult
  }

  recoveryInstruction(): string | null {
    if (!this.blocked) return null
    return [
      'Web access failed repeatedly and web tools are blocked for the rest of this turn.',
      'This is your final recovery opportunity: do not call another web tool, do not guess URLs, and do not claim that current information was verified.',
      'Use only already verified tool results. If they are insufficient, clearly tell the user in their language that live web information could not be verified and ask them to retry later or provide a reachable source.'
    ].join(' ')
  }

  observe(call: ToolCallLike, isError: boolean): void {
    if (!isWebToolCall(call)) return
    if (!isError) {
      this.successfulResult = true
      this.consecutiveFailures = 0
      this.blocked = false
      return
    }
    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= this.threshold) {
      this.blocked = true
    }
  }
}

function isWebToolCall(call: ToolCallLike): boolean {
  return WEB_TOOL_NAMES.has(call.toolName)
}
