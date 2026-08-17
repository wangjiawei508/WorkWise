export type TerminalNotificationReason =
  | 'completed'
  | 'error'
  | 'aborted'
  | 'blocked'
  | 'max_tokens'
  | 'waiting_approval'

export type TerminalNotificationInput = {
  reason: TerminalNotificationReason
  threadId?: string | null
  turnId?: string | null
  approvalId?: string | null
}

export type TerminalNotificationContext = {
  activeThreadId?: string | null
  currentTurnId?: string | null
  watched?: boolean
}

export function terminalNotificationDedupeKey(input: TerminalNotificationInput): string {
  const threadId = input.threadId?.trim() || 'unknown-thread'
  const identity = input.reason === 'waiting_approval'
    ? input.approvalId?.trim() || input.turnId?.trim() || 'unknown-approval'
    : input.turnId?.trim() || 'unknown-turn'
  return `terminal:${input.reason}:${threadId}:${identity}`
}

export function shouldProjectTerminalNotification(
  input: TerminalNotificationInput,
  context: TerminalNotificationContext
): boolean {
  const threadId = input.threadId?.trim()
  if (!threadId) return false
  if (input.reason === 'waiting_approval' && !input.approvalId?.trim()) return false
  if (context.watched === true) return true
  if (context.activeThreadId?.trim() !== threadId || !input.turnId?.trim()) return false
  return context.currentTurnId?.trim() === input.turnId?.trim()
}

export function terminalReasonForFailure(code?: string, message?: string): Exclude<TerminalNotificationReason, 'completed' | 'aborted' | 'waiting_approval'> {
  const value = `${code ?? ''} ${message ?? ''}`.toLowerCase()
  if (value.includes('max_tokens') || value.includes('max tokens') || value.includes('token limit')) return 'max_tokens'
  if (value.includes('blocked') || value.includes('budget_limited') || value.includes('policy_blocked')) return 'blocked'
  return 'error'
}
