import type { ApprovalGate } from '../ports/approval-gate.js'
import type { ApprovalRequest } from '../domain/approval.js'
import { resolveApprovalRequest } from '../domain/approval.js'
import { expireApprovalRequest } from '../domain/approval.js'

const APPROVAL_TIMEOUT_MS = 30 * 60_000

type PendingResolver = {
  resolve: (decision: 'allow' | 'deny') => void
  reject: (error: Error) => void
}

/**
 * In-memory approval gate. The HTTP layer posts decisions into
 * `decide`; the loop awaits the `request` promise to learn whether
 * the user allowed or denied the call.
 */
export class InMemoryApprovalGate implements ApprovalGate {
  private readonly approvals = new Map<string, ApprovalRequest>()
  private readonly resolvers = new Map<string, PendingResolver>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  request(approval: ApprovalRequest): Promise<'allow' | 'deny'> {
    this.approvals.set(approval.id, approval)
    return new Promise<'allow' | 'deny'>((resolve, reject) => {
      this.resolvers.set(approval.id, { resolve, reject })
      const timer = setTimeout(() => this.expire(approval.id, 'approval_timeout'), APPROVAL_TIMEOUT_MS)
      timer.unref?.()
      this.timers.set(approval.id, timer)
    })
  }

  decide(approvalId: string, decision: 'allow' | 'deny', reason?: string): boolean {
    const approval = this.approvals.get(approvalId)
    if (!approval || approval.status !== 'pending') return false
    const resolved = resolveApprovalRequest(approval, decision, reason)
    this.approvals.set(approvalId, resolved)
    const resolver = this.resolvers.get(approvalId)
    this.resolvers.delete(approvalId)
    const timer = this.timers.get(approvalId)
    if (timer) clearTimeout(timer)
    this.timers.delete(approvalId)
    resolver?.resolve(decision)
    return true
  }

  pending(threadId?: string): ApprovalRequest[] {
    return [...this.approvals.values()].filter(
      (approval) =>
        approval.status === 'pending' && (!threadId || approval.threadId === threadId)
    )
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.approvals.get(approvalId)
  }

  /** Used by tests to simulate an external decision and tear down the promise. */
  resolve(approvalId: string, decision: 'allow' | 'deny', reason?: string): boolean {
    return this.decide(approvalId, decision, reason)
  }

  expireTurn(turnId: string, reason = 'operation_cancelled'): number {
    let count = 0
    for (const approval of this.pending()) {
      if (approval.turnId === turnId && this.expire(approval.id, reason)) count += 1
    }
    return count
  }

  expireAll(reason = 'application_exit'): number {
    let count = 0
    for (const approval of this.pending()) {
      if (this.expire(approval.id, reason)) count += 1
    }
    return count
  }

  private expire(approvalId: string, reason: string): boolean {
    const approval = this.approvals.get(approvalId)
    if (!approval || approval.status !== 'pending') return false
    this.approvals.set(approvalId, {
      ...expireApprovalRequest(approval),
      reason
    })
    const resolver = this.resolvers.get(approvalId)
    this.resolvers.delete(approvalId)
    const timer = this.timers.get(approvalId)
    if (timer) clearTimeout(timer)
    this.timers.delete(approvalId)
    resolver?.resolve('deny')
    return true
  }
}
