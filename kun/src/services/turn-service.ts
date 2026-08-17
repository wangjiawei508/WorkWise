import type { ThreadRecord, ThreadStatus } from '../contracts/threads.js'
import type { CompactRequest, CompactResponse, StartTurnRequest, StartTurnResponse, Turn, TurnStatus } from '../contracts/turns.js'
import type { TurnItem } from '../contracts/items.js'
import type { UiActionAudit, UiActionStartResponse } from '../contracts/ui-actions.js'
import type { SessionStore } from '../ports/session-store.js'
import type { ThreadStore } from '../ports/thread-store.js'
import type { IdGenerator } from '../ports/id-generator.js'
import type { ApprovalGate } from '../ports/approval-gate.js'
import type { UserInputGate } from '../ports/user-input-gate.js'
import type { InflightTracker } from '../loop/inflight-tracker.js'
import type { SteeringQueue } from '../loop/steering-queue.js'
import { ContextCompactor } from '../loop/context-compactor.js'
import { makeUserItem, makeErrorItem, makeUiActionItem } from '../domain/item.js'
import { appendTurnItem, createTurnRecord, finishTurn, replaceTurnItem, startTurn as startTurnRecord } from '../domain/turn.js'
import { touchThread } from '../domain/thread.js'
import type { RuntimeEventRecorder } from './runtime-event-recorder.js'
import type { TaskController } from './task-controller.js'
import { WorkspaceReferenceService } from './workspace-reference-service.js'

export type TurnServiceDeps = {
  threadStore: ThreadStore
  sessionStore: SessionStore
  events: RuntimeEventRecorder
  inflight: InflightTracker
  steering: SteeringQueue
  compactor: ContextCompactor
  ids: IdGenerator
  nowIso: () => string
  tasks?: TaskController
  approvalGate?: ApprovalGate
  userInputGate?: UserInputGate
  workspaceReferences?: Pick<WorkspaceReferenceService, 'validateReferences'>
}

function terminalReason(status: Extract<TurnStatus, 'completed' | 'failed' | 'aborted'>, error?: string): 'completed' | 'error' | 'aborted' | 'blocked' | 'max_tokens' {
  if (status === 'completed') return 'completed'
  if (status === 'aborted') return 'aborted'
  const value = error?.toLowerCase() ?? ''
  if (value.includes('max_tokens') || value.includes('max tokens') || value.includes('token limit')) return 'max_tokens'
  if (value.includes('blocked') || value.includes('budget_limited') || value.includes('policy_blocked')) return 'blocked'
  return 'error'
}

/**
 * Turn service: owns the turn lifecycle (start, finish, abort, steer,
 * compact). The service is the only place that emits turn lifecycle
 * events; the agent loop calls into it instead of mutating state
 * directly.
 */
export class TurnService {
  private readonly deps: TurnServiceDeps
  private readonly workspaceReferences: Pick<WorkspaceReferenceService, 'validateReferences'>
  private readonly inflightTurns = new Map<string, AbortController>()
  private readonly terminalTurns = new Set<string>()
  private readonly threadMutationQueues = new Map<string, Promise<void>>()
  private readonly startQueues = new Map<string, Promise<void>>()
  private reservedTurnStarts = 0

  constructor(deps: TurnServiceDeps) {
    this.deps = deps
    this.workspaceReferences = deps.workspaceReferences ?? new WorkspaceReferenceService()
  }

  async startTurn(input: {
    threadId: string
    request: StartTurnRequest
  }): Promise<StartTurnResponse> {
    const previous = this.startQueues.get(input.threadId) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(() => this.startTurnInternal(input))
    const guard = run.then(() => undefined, () => undefined)
    this.startQueues.set(input.threadId, guard)
    try {
      return await run
    } finally {
      if (this.startQueues.get(input.threadId) === guard) this.startQueues.delete(input.threadId)
    }
  }

  /**
   * Starts a Runtime-validated structured UI action. Unlike startTurn it
   * records no generic user_message: the completed ui_action audit item is
   * the sole user-originated input for this turn.
   */
  async startUiActionTurn(input: {
    threadId: string
    action: UiActionAudit
    idempotencyKey: string
  }): Promise<UiActionStartResponse> {
    const previous = this.startQueues.get(input.threadId) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(() => this.startUiActionTurnInternal(input))
    const guard = run.then(() => undefined, () => undefined)
    this.startQueues.set(input.threadId, guard)
    try {
      return await run
    } finally {
      if (this.startQueues.get(input.threadId) === guard) this.startQueues.delete(input.threadId)
    }
  }

  private async startUiActionTurnInternal(input: {
    threadId: string
    action: UiActionAudit
    idempotencyKey: string
  }): Promise<UiActionStartResponse> {
    const thread = await this.deps.threadStore.get(input.threadId)
    if (!thread) throw new Error(`thread not found: ${input.threadId}`)
    const idempotencyKey = input.idempotencyKey.trim()
    const existing = thread.turns.find((turn) => turn.idempotencyKey === idempotencyKey)
    if (existing) {
      const item = existing.items.find((candidate) => candidate.kind === 'ui_action')
      if (!item || item.kind !== 'ui_action') {
        throw Object.assign(new Error('idempotency key is already bound to a non-UI turn'), {
          code: 'idempotency_conflict'
        })
      }
      if (
        item.messageId !== input.action.messageId ||
        item.blockId !== input.action.blockId ||
        item.actionId !== input.action.actionId ||
        item.specFingerprint !== input.action.specFingerprint ||
        item.nodeId !== input.action.nodeId ||
        item.nodeType !== input.action.nodeType ||
        item.fieldName !== input.action.fieldName ||
        item.value !== input.action.value
      ) {
        throw Object.assign(new Error('idempotency key is already bound to a different UI action'), {
          code: 'idempotency_conflict'
        })
      }
      return { threadId: input.threadId, turnId: existing.id, uiActionItemId: item.id }
    }
    if (thread.turns.some((turn) => turn.status === 'running')) {
      throw Object.assign(new Error('a turn is already running for this thread'), {
        code: 'turn_in_progress'
      })
    }
    const releaseReservation = this.reserveTurnSlot()
    let turnId: string | undefined
    let persisted = false

    try {
      turnId = this.deps.ids.next('turn')
      this.terminalTurns.delete(turnId)
      const turn = createTurnRecord({
        id: turnId,
        threadId: input.threadId,
        prompt: '',
        idempotencyKey,
        uiAction: input.action
      })
      const actionItem = makeUiActionItem({
        id: `item_${turnId}_ui_action`,
        turnId,
        threadId: input.threadId,
        action: input.action,
        createdAt: this.deps.nowIso()
      })
      const controller = new AbortController()
      await this.upsertThread(input.threadId, (current) => ({
        ...touchThread(current, this.deps.nowIso()),
        status: 'running',
        turns: [...current.turns, startTurnRecord(appendTurnItem(turn, actionItem))]
      }))
      persisted = true
      await this.deps.sessionStore.appendItem(input.threadId, actionItem)
      await this.deps.events.record({
        kind: 'ui_action',
        threadId: input.threadId,
        turnId,
        itemId: actionItem.id,
        item: actionItem
      })
      await this.deps.events.record({
        kind: 'turn_started',
        threadId: input.threadId,
        turnId
      })
      await this.deps.events.record({
        kind: 'item_created',
        threadId: input.threadId,
        turnId,
        itemId: actionItem.id,
        item: actionItem
      })
      this.inflightTurns.set(turnId, controller)
      this.deps.inflight.begin({ id: turnId, kind: 'model', threadId: input.threadId, turnId })
      this.deps.steering.setTurn(turnId)
      this.deps.tasks?.ensureTask({
        thread,
        turnId,
        // This is internal task metadata only. The model receives the
        // persisted structured ui_action item, never this label as a user
        // message or turn prompt.
        request: { prompt: uiActionTaskLabel(input.action), idempotencyKey }
      })
      return { threadId: input.threadId, turnId, uiActionItemId: actionItem.id }
    } catch (error) {
      if (persisted && turnId) {
        await this.compensateTurnStartFailure(input.threadId, turnId, error)
      }
      throw error
    } finally {
      releaseReservation()
    }
  }

  private async startTurnInternal(input: {
    threadId: string
    request: StartTurnRequest
  }): Promise<StartTurnResponse> {
    const thread = await this.deps.threadStore.get(input.threadId)
    if (!thread) throw new Error(`thread not found: ${input.threadId}`)
    const idempotencyKey = input.request.idempotencyKey?.trim()
    if (idempotencyKey) {
      const existing = thread.turns.find((turn) => turn.idempotencyKey === idempotencyKey)
      if (existing) {
        const userItem = existing.items.find((item) => item.kind === 'user_message')
        if (!userItem) {
          throw Object.assign(new Error('idempotency key is already bound to a UI action'), {
            code: 'idempotency_conflict'
          })
        }
        if (!sameIdempotentTurnRequest(existing, input.request)) {
          throw Object.assign(new Error('idempotency key is already bound to a different Turn request'), {
            code: 'idempotency_conflict'
          })
        }
        return {
          threadId: input.threadId,
          turnId: existing.id,
          userMessageItemId: userItem.id
        }
      }
    }
    if (thread.turns.some((turn) => turn.status === 'running')) {
      throw Object.assign(new Error('a turn is already running for this thread'), {
        code: 'turn_in_progress'
      })
    }
    const releaseReservation = this.reserveTurnSlot()
    let turnId: string | undefined
    let persisted = false
    try {
      const workspaceReferences = input.request.workspaceReferences?.length
        ? await this.workspaceReferences.validateReferences(
            thread.workspace,
            input.request.workspaceReferences
          )
        : []
      turnId = this.deps.ids.next('turn')
      this.terminalTurns.delete(turnId)
      const turn = createTurnRecord({
      id: turnId,
      threadId: input.threadId,
      prompt: input.request.prompt,
      model: input.request.model,
      reasoningEffort: input.request.reasoningEffort,
      attachmentIds: input.request.attachmentIds ?? [],
      workspaceReferences,
      guiPlan: input.request.guiPlan,
      guiDesign: input.request.guiDesign,
      mode: input.request.mode,
      disableUserInput: input.request.disableUserInput,
      idempotencyKey
      })
      const userItem = makeUserItem({
      id: `item_${turnId}_user`,
      turnId,
      threadId: input.threadId,
      text: input.request.prompt,
      displayText: input.request.displayText,
      attachmentIds: input.request.attachmentIds ?? [],
      workspaceReferences
      })
      const controller = new AbortController()
      await this.upsertThread(input.threadId, (current) => ({
      ...touchThread(current, this.deps.nowIso()),
      status: 'running',
      ...(input.request.approvalPolicy !== undefined
        ? { approvalPolicy: input.request.approvalPolicy }
        : {}),
      ...(input.request.sandboxMode !== undefined
        ? { sandboxMode: input.request.sandboxMode }
        : {}),
      turns: [...current.turns, startTurnRecord(appendTurnItem(turn, userItem))]
      }))
      persisted = true
      await this.deps.sessionStore.appendItem(input.threadId, userItem)
      await this.deps.events.record({
      kind: 'turn_started',
      threadId: input.threadId,
      turnId
      })
      await this.deps.events.record({
      kind: 'item_created',
      threadId: input.threadId,
      turnId,
      itemId: userItem.id,
      item: userItem
      })
      this.inflightTurns.set(turnId, controller)
      this.deps.inflight.begin({
      id: turnId,
      kind: 'model',
      threadId: input.threadId,
      turnId
      })
      this.deps.steering.setTurn(turnId)
      this.deps.tasks?.ensureTask({ thread, turnId, request: input.request })
      return { threadId: input.threadId, turnId, userMessageItemId: userItem.id }
    } catch (error) {
      if (persisted && turnId) {
        await this.compensateTurnStartFailure(input.threadId, turnId, error)
      }
      throw error
    } finally {
      releaseReservation()
    }
  }

  async steerTurn(input: { threadId: string; turnId: string; text: string }): Promise<void> {
    this.deps.steering.enqueue(input.turnId, input.text)
    await this.deps.events.record({
      kind: 'turn_steered',
      threadId: input.threadId,
      turnId: input.turnId,
      text: input.text
    })
  }

  async interruptTurn(input: { threadId: string; turnId: string; discard?: boolean }): Promise<{ status: TurnStatus }> {
    if (this.terminalTurns.has(input.turnId)) return { status: 'aborted' }
    this.terminalTurns.add(input.turnId)
    try {
      const controller = this.inflightTurns.get(input.turnId)
      if (controller) controller.abort('operation_cancelled')
      this.deps.approvalGate?.expireTurn(input.turnId, 'operation_cancelled')
      for (const pending of this.deps.userInputGate?.pending(input.threadId) ?? []) {
        if (pending.turnId === input.turnId) {
          this.deps.userInputGate?.resolve(pending.id, { status: 'cancelled' })
        }
      }
      this.deps.steering.clear()
      this.inflightTurns.delete(input.turnId)
      this.deps.inflight.end(input.turnId)
      this.deps.tasks?.cancel(input.threadId, '用户取消了任务。')
      await this.deps.events.record({
        kind: 'turn_aborted',
        threadId: input.threadId,
        turnId: input.turnId,
        reason: 'aborted'
      })
      if (input.discard) {
        await this.discardTurnItems(input.threadId, input.turnId)
      } else {
        await this.finalizePersistedOpenItems(input.threadId, input.turnId, 'aborted')
      }
      await this.upsertThread(input.threadId, (current) => {
        const turn = current.turns.find((t) => t.id === input.turnId)
        if (!turn) return current
        const next = current.turns.map((t) =>
          t.id === input.turnId
            ? this.finalizeOpenItems(
                finishTurn(input.discard ? { ...t, items: this.keepUserItems(t.items) } : t, 'aborted'),
                'aborted'
              )
            : t
        )
        return { ...touchThread(current, this.deps.nowIso()), turns: next, status: 'idle' }
      })
      return { status: 'aborted' }
    } catch (error) {
      this.terminalTurns.delete(input.turnId)
      throw error
    }
  }

  async compact(input: { threadId: string; turnId?: string; request: CompactRequest }): Promise<CompactResponse> {
    const thread = await this.deps.threadStore.get(input.threadId)
    if (!thread) throw new Error(`thread not found: ${input.threadId}`)
    const turnId = input.turnId ?? thread.turns[thread.turns.length - 1]?.id ?? this.deps.ids.next('turn')
    const items = await this.deps.sessionStore.loadItems(input.threadId)
    const history = items.filter((item) => !this.isSystemOnly(item))
    const prefix = {
      systemPrompt: '',
      tools: [],
      pinnedConstraints: ['user: preserve recent turns'],
      fewShots: [],
      fingerprint: 'compact',
      revision: 0
    }
    const result = this.deps.compactor.compact({
      threadId: input.threadId,
      turnId,
      history,
      prefix,
      budgetTokens: input.request.budgetTokens,
      reason: input.request.reason
    })
    if (result.replacedTokens > 0) {
      await this.appendItem(input.threadId, result.summaryItem)
    }
    await this.deps.events.record({
      kind: 'compaction_completed',
      threadId: input.threadId,
      turnId,
      itemId: result.summaryItem.id,
      summary: result.summaryItem.kind === 'compaction' ? result.summaryItem.summary : '',
      replacedTokens: result.replacedTokens,
      pinnedConstraints: prefix.pinnedConstraints,
      ...(result.summaryItem.kind === 'compaction' && result.summaryItem.sourceDigest
        ? { sourceDigest: result.summaryItem.sourceDigest }
        : {}),
      ...(result.summaryItem.kind === 'compaction' && result.summaryItem.digestMarker
        ? { digestMarker: result.summaryItem.digestMarker }
        : {}),
      ...(result.summaryItem.kind === 'compaction' && result.summaryItem.sourceItemIds
        ? { sourceItemIds: result.summaryItem.sourceItemIds }
        : {})
    })
    return {
      threadId: input.threadId,
      replacedTokens: result.replacedTokens,
      summary: result.summaryItem.kind === 'compaction' ? result.summaryItem.summary : '',
      pinnedConstraints: prefix.pinnedConstraints,
      ...(result.summaryItem.kind === 'compaction' && result.summaryItem.sourceDigest
        ? { sourceDigest: result.summaryItem.sourceDigest }
        : {}),
      ...(result.summaryItem.kind === 'compaction' && result.summaryItem.digestMarker
        ? { digestMarker: result.summaryItem.digestMarker }
        : {}),
      ...(result.summaryItem.kind === 'compaction' && result.summaryItem.sourceItemIds
        ? { sourceItemIds: result.summaryItem.sourceItemIds }
        : {})
    }
  }

  /**
   * Persist a final turn state (running -> completed/failed/aborted).
   * Called by the agent loop when a model stream finishes.
   */
  async finishTurn(input: {
    threadId: string
    turnId: string
    status: Extract<TurnStatus, 'completed' | 'failed' | 'aborted'>
    error?: string
  }): Promise<void> {
    if (this.terminalTurns.has(input.turnId)) return
    this.terminalTurns.add(input.turnId)
    try {
    this.inflightTurns.delete(input.turnId)
    this.deps.inflight.end(input.turnId)
    this.deps.steering.clear()
    await this.finalizePersistedOpenItems(input.threadId, input.turnId, input.status)
    await this.upsertThread(input.threadId, (current) => {
      const next = current.turns.map((t) => {
        if (t.id !== input.turnId) return t
        const finished = this.finalizeOpenItems(finishTurn(t, input.status), input.status)
        return input.error ? { ...finished, error: input.error } : finished
      })
      return { ...touchThread(current, this.deps.nowIso()), turns: next, status: 'idle' }
    })
    await this.deps.events.record({
      kind: input.status === 'completed' ? 'turn_completed' : input.status === 'aborted' ? 'turn_aborted' : 'turn_failed',
      threadId: input.threadId,
      turnId: input.turnId,
      reason: terminalReason(input.status, input.error),
      ...(input.error ? { message: input.error } : {})
    })
    if (input.error) {
      await this.appendItem(input.threadId, makeErrorItem({
        id: `item_${input.turnId}_error`,
        turnId: input.turnId,
        threadId: input.threadId,
        message: input.error
      }))
    }
    } catch (error) {
      this.terminalTurns.delete(input.turnId)
      throw error
    }
  }

  getAbortController(turnId: string): AbortSignal | undefined {
    return this.inflightTurns.get(turnId)?.signal
  }

  abortTurn(turnId: string, reason = 'operation_cancelled'): boolean {
    const controller = this.inflightTurns.get(turnId)
    if (!controller || controller.signal.aborted) return false
    controller.abort(reason)
    return true
  }

  abortAll(reason = 'application_exit'): number {
    let count = 0
    for (const [turnId, controller] of this.inflightTurns) {
      if (controller.signal.aborted) continue
      controller.abort(reason)
      count += 1
      this.deps.inflight.end(turnId)
    }
    return count
  }

  async getTurn(threadId: string, turnId: string): Promise<Turn | null> {
    const thread = await this.deps.threadStore.get(threadId)
    return thread?.turns.find((turn) => turn.id === turnId) ?? null
  }

  async updateTurnMetadata(
    threadId: string,
    turnId: string,
    patch: Pick<
      Partial<Turn>,
      | 'activeSkillIds'
      | 'injectedMemoryIds'
      | 'skillInjectionBytes'
      | 'toolCatalogFingerprint'
      | 'toolCatalogToolCount'
      | 'toolCatalogDrift'
    >
  ): Promise<void> {
    await this.upsertThread(threadId, (current) => ({
      ...current,
      turns: current.turns.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              ...(patch.activeSkillIds ? { activeSkillIds: [...patch.activeSkillIds] } : {}),
              ...(patch.injectedMemoryIds ? { injectedMemoryIds: [...patch.injectedMemoryIds] } : {}),
              ...(patch.skillInjectionBytes !== undefined ? { skillInjectionBytes: patch.skillInjectionBytes } : {}),
              ...(patch.toolCatalogFingerprint ? { toolCatalogFingerprint: patch.toolCatalogFingerprint } : {}),
              ...(patch.toolCatalogToolCount !== undefined ? { toolCatalogToolCount: patch.toolCatalogToolCount } : {}),
              ...(patch.toolCatalogDrift !== undefined ? { toolCatalogDrift: patch.toolCatalogDrift } : {})
            }
          : turn
      )
    }))
  }

  /**
   * Apply a tool or assistant item to the current turn. The agent loop
   * calls this after each chunk so SSE consumers see live updates.
   */
  async applyItem(threadId: string, item: TurnItem): Promise<void> {
    await this.appendItem(threadId, item)
    await this.deps.events.record({
      kind: 'item_created',
      threadId,
      turnId: item.turnId,
      itemId: item.id,
      item
    })
  }

  async updateItem(
    threadId: string,
    itemId: string,
    patch: Partial<TurnItem>
  ): Promise<TurnItem | null> {
    const updatedInSession = await this.deps.sessionStore.updateItem(threadId, itemId, patch)
    const updatedItems: TurnItem[] = []
    await this.upsertThread(threadId, (current) => {
      const turns = current.turns.map((turn) => {
        const existing = turn.items.find((item) => item.id === itemId)
        if (!existing) return turn
        updatedItems[0] = { ...existing, ...patch } as TurnItem
        return replaceTurnItem(turn, itemId, patch)
      })
      return { ...current, turns }
    })
    const updated = updatedItems[0] ?? updatedInSession
    if (!updated) return null
    await this.deps.events.record({
      kind: 'item_updated',
      threadId,
      turnId: updated.turnId,
      itemId: updated.id,
      item: updated
    })
    return updated
  }

  private async appendItem(threadId: string, item: TurnItem): Promise<void> {
    await this.deps.sessionStore.appendItem(threadId, item)
    await this.upsertThread(threadId, (current) => {
      const turn = current.turns.find((t) => t.id === item.turnId)
      if (!turn) return current
      const nextTurn = appendTurnItem(turn, item)
      const turns = current.turns.map((t) => (t.id === item.turnId ? nextTurn : t))
      return { ...current, turns }
    })
  }

  private reserveTurnSlot(): () => void {
    if (this.inflightTurns.size + this.reservedTurnStarts >= 4) {
      throw Object.assign(new Error('the application turn concurrency limit has been reached'), {
        code: 'resource_limit'
      })
    }
    this.reservedTurnStarts += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.reservedTurnStarts -= 1
    }
  }

  /**
   * A Turn is written before its session/event fan-out. If that fan-out
   * fails, leave an explicit terminal record instead of a non-runnable
   * `running` Turn that blocks every later request on the thread.
   */
  private async compensateTurnStartFailure(
    threadId: string,
    turnId: string,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    this.terminalTurns.add(turnId)
    this.inflightTurns.delete(turnId)
    this.deps.inflight.end(turnId)
    this.deps.steering.clear()
    try {
      await this.upsertThread(threadId, (current) => {
        const turns = current.turns.map((turn) =>
          turn.id === turnId
            ? {
                // The turn was persisted before its start fan-out completed.
                // It is terminal bookkeeping, not a successfully claimed
                // idempotent request, so a retry must be allowed to create a
                // fresh runnable turn with the same key.
                ...this.finalizeOpenItems(finishTurn(turn, 'failed'), 'failed'),
                idempotencyKey: undefined,
                error: message
              }
            : turn
        )
        const status = turns.some((turn) => turn.status === 'running') ? 'running' : 'idle'
        return { ...touchThread(current, this.deps.nowIso()), turns, status }
      })
    } catch {
      // The original start failure is more actionable. A later recovery pass
      // will still see this failed fan-out as an interrupted persisted turn.
    }
  }

  private async upsertThread(
    threadId: string,
    mutator: (current: ThreadRecord) => ThreadRecord
  ): Promise<void> {
    const previous = this.threadMutationQueues.get(threadId) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(async () => {
      const current = await this.deps.threadStore.get(threadId)
      if (!current) return
      const next = mutator(current)
      await this.deps.threadStore.upsert({ ...next, updatedAt: this.deps.nowIso() })
    })
    const guard = run.then(() => undefined, () => undefined)
    this.threadMutationQueues.set(threadId, guard)
    try {
      await run
    } finally {
      if (this.threadMutationQueues.get(threadId) === guard) {
        this.threadMutationQueues.delete(threadId)
      }
    }
  }

  private finalizeOpenItems(
    turn: Turn,
    status: Extract<TurnStatus, 'completed' | 'failed' | 'aborted'>
  ): Turn {
    const finishedAt = this.deps.nowIso()
    let changed = false
    const items = turn.items.map((item) => {
      const next = this.finalizeOpenItem(item, status, finishedAt)
      if (next !== item) changed = true
      return next
    })
    return changed ? { ...turn, items } : turn
  }

  private async discardTurnItems(threadId: string, turnId: string): Promise<void> {
    const items = await this.deps.sessionStore.loadItems(threadId)
    await this.deps.sessionStore.rewriteItems(
      threadId,
      items.filter((item) => item.turnId !== turnId || item.kind === 'user_message')
    )
  }

  private async finalizePersistedOpenItems(
    threadId: string,
    turnId: string,
    status: Extract<TurnStatus, 'completed' | 'failed' | 'aborted'>
  ): Promise<void> {
    const items = await this.deps.sessionStore.loadItems(threadId)
    const finishedAt = this.deps.nowIso()
    for (const item of items) {
      if (item.turnId !== turnId) continue
      const finalized = this.finalizeOpenItem(item, status, finishedAt)
      if (finalized === item) continue
      await this.updateItem(threadId, item.id, finalized)
    }
  }

  private keepUserItems(items: TurnItem[]): TurnItem[] {
    return items.filter((item) => item.kind === 'user_message')
  }

  private finalizeOpenItem(
    item: TurnItem,
    status: Extract<TurnStatus, 'completed' | 'failed' | 'aborted'>,
    finishedAt: string
  ): TurnItem {
    if (item.status !== 'pending' && item.status !== 'running') return item
    if (item.kind === 'approval') {
      return { ...item, status: 'expired', finishedAt }
    }
    if (item.kind === 'user_input') {
      return { ...item, status: 'cancelled', finishedAt }
    }
    const itemStatus = status === 'completed' ? 'completed' : status
    return { ...item, status: itemStatus, finishedAt } as TurnItem
  }

  private isSystemOnly(item: TurnItem): boolean {
    return item.kind === 'compaction' || item.kind === 'error'
  }
}

function uiActionTaskLabel(action: UiActionAudit): string {
  return `Structured UI action ${action.actionId} (${action.nodeType})`
}

function sameIdempotentTurnRequest(
  existing: {
    prompt: string
    model?: string
    reasoningEffort?: string
    attachmentIds: string[]
    workspaceReferences?: unknown
    guiPlan?: unknown
    guiDesign?: unknown
    mode?: string
    disableUserInput?: boolean
  },
  request: StartTurnRequest
): boolean {
  // These fields are persisted on the Turn and define the work a retry would
  // execute. displayText is intentionally excluded because it is presentation
  // metadata and does not change the requested operation.
  return existing.prompt === request.prompt
    && (existing.model ?? '') === (request.model ?? '')
    && (existing.reasoningEffort ?? 'auto') === (request.reasoningEffort ?? 'auto')
    && JSON.stringify(existing.attachmentIds ?? []) === JSON.stringify(request.attachmentIds ?? [])
    && JSON.stringify(existing.workspaceReferences ?? []) === JSON.stringify(request.workspaceReferences ?? [])
    && JSON.stringify(existing.guiPlan ?? null) === JSON.stringify(request.guiPlan ?? null)
    && JSON.stringify(existing.guiDesign ?? null) === JSON.stringify(request.guiDesign ?? null)
    && (existing.mode ?? '') === (request.mode ?? '')
    && Boolean(existing.disableUserInput) === Boolean(request.disableUserInput)
}
