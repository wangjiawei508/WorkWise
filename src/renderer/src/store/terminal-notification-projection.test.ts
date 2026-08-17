import { describe, expect, it } from 'vitest'
import {
  shouldProjectTerminalNotification,
  terminalNotificationDedupeKey,
  terminalReasonForFailure
} from './terminal-notification-projection'

describe('terminal notification projection', () => {
  it('dedupes by reason, thread, and turn, with approvals keyed by approval id', () => {
    expect(terminalNotificationDedupeKey({ reason: 'error', threadId: 't1', turnId: 'r1' }))
      .toBe('terminal:error:t1:r1')
    expect(terminalNotificationDedupeKey({ reason: 'waiting_approval', threadId: 't1', turnId: 'r1', approvalId: 'a1' }))
      .toBe('terminal:waiting_approval:t1:a1')
  })

  it('projects only the current or explicitly watched turn', () => {
    const input = { reason: 'completed' as const, threadId: 't1', turnId: 'r1' }
    expect(shouldProjectTerminalNotification(input, { activeThreadId: 't1', currentTurnId: 'r1' })).toBe(true)
    expect(shouldProjectTerminalNotification(input, { activeThreadId: 't2', currentTurnId: 'r1' })).toBe(false)
    expect(shouldProjectTerminalNotification(input, { activeThreadId: 't2', watched: true })).toBe(true)
  })

  it('keeps approval waiting separate and classifies terminal failures', () => {
    expect(shouldProjectTerminalNotification(
      { reason: 'waiting_approval', threadId: 't1', turnId: 'r1', approvalId: 'a1' },
      { activeThreadId: 't1', currentTurnId: 'r1' }
    )).toBe(true)
    expect(shouldProjectTerminalNotification(
      { reason: 'waiting_approval', threadId: 't1', turnId: 'r1', approvalId: 'a1' },
      { activeThreadId: 't2', currentTurnId: 'r1' }
    )).toBe(false)
    expect(terminalReasonForFailure('budget_limited', 'blocked by budget')).toBe('blocked')
    expect(terminalReasonForFailure('provider_unavailable', 'max tokens reached')).toBe('max_tokens')
    expect(terminalReasonForFailure('provider_unavailable', 'network failed')).toBe('error')
  })
})
