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
        'Use the information already available, ask the user for a reachable source, or try a different non-web tool.'
    }
  }

  observe(call: ToolCallLike, isError: boolean): void {
    if (!isWebToolCall(call)) return
    if (!isError) {
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
