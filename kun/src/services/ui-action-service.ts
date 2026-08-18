import type { AssistantTextTurnItem } from '../contracts/items.js'
import {
  type UiActionAudit,
  type UiActionRequest,
  UiActionRequest as UiActionRequestSchema,
  type UiActionStartResponse
} from '../contracts/ui-actions.js'
import {
  findDshUiActionNode,
  fingerprintDshUiBlock,
  type DshUiActionNode,
  type DshUiBlock
} from '../contracts/dsh-ui.js'
import type { SessionStore } from '../ports/session-store.js'
import type { TurnService } from './turn-service.js'

export const UI_ACTION_TTL_MS = 24 * 60 * 60 * 1_000

export class UiActionError extends Error {
  readonly code:
    | 'ui_action_invalid'
    | 'ui_action_not_found'
    | 'ui_action_stale'
    | 'ui_action_expired'
    | 'ui_action_unavailable'

  constructor(
    code: UiActionError['code'],
    message: string
  ) {
    super(message)
    this.name = 'UiActionError'
    this.code = code
  }
}

export class UiActionService {
  constructor(private readonly deps: {
    sessionStore: SessionStore
    turns: TurnService
    now?: () => number
  }) {}

  /**
   * Resolves the target strictly from the persisted assistant card. Client
   * payload is untrusted and cannot choose a prompt, tool, or arbitrary
   * action payload.
   */
  async execute(input: {
    threadId: string
    request: UiActionRequest
  }): Promise<UiActionStartResponse> {
    const parsed = UiActionRequestSchema.safeParse(input.request)
    if (!parsed.success) {
      throw new UiActionError('ui_action_invalid', 'invalid UI action request')
    }
    const request = parsed.data
    const message = await this.findCompletedAssistantMessage(input.threadId, request.messageId)
    this.assertMessageFresh(message)
    const block = message.uiBlocks?.find((candidate) => candidate.id === request.blockId)
    if (!block) {
      throw new UiActionError('ui_action_not_found', 'the requested UI block was not found')
    }
    if (fingerprintDshUiBlock(block) !== request.specFingerprint) {
      throw new UiActionError('ui_action_stale', 'the requested UI block fingerprint is stale')
    }
    const node = findDshUiActionNode(block, request.actionId)
    if (!node) {
      throw new UiActionError('ui_action_not_found', 'the requested UI action was not found')
    }
    if (node.disabled === true) {
      throw new UiActionError('ui_action_unavailable', 'the requested UI action is disabled')
    }
    const action = validateAction(node, request, block)
    return this.deps.turns.startUiActionTurn({
      threadId: input.threadId,
      action,
      idempotencyKey: request.idempotencyKey
    })
  }

  private async findCompletedAssistantMessage(
    threadId: string,
    messageId: string
  ): Promise<AssistantTextTurnItem> {
    const items = await this.deps.sessionStore.loadItems(threadId)
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      if (item?.id !== messageId) continue
      if (item.kind !== 'assistant_text' || item.status !== 'completed') break
      return item
    }
    throw new UiActionError('ui_action_not_found', 'the requested completed assistant message was not found')
  }

  private assertMessageFresh(message: AssistantTextTurnItem): void {
    const createdAt = Date.parse(message.createdAt)
    const now = this.deps.now?.() ?? Date.now()
    if (!Number.isFinite(createdAt) || now - createdAt > UI_ACTION_TTL_MS) {
      throw new UiActionError('ui_action_expired', 'the requested UI block has expired')
    }
  }
}

function validateAction(
  node: DshUiActionNode,
  request: UiActionRequest,
  block: DshUiBlock
): UiActionAudit {
  if (request.password !== undefined) {
    if (node.type === 'input' && node.inputType === 'password') {
      throw new UiActionError('ui_action_unavailable', 'password UI actions are unavailable without an ephemeral secret transport')
    }
    throw new UiActionError('ui_action_invalid', 'password is not accepted for this UI action')
  }

  const common = {
    messageId: request.messageId,
    blockId: block.id,
    actionId: node.actionId,
    specFingerprint: request.specFingerprint,
    nodeId: node.id,
    nodeType: node.type
  } as const

  switch (node.type) {
    case 'button':
      if (request.value !== undefined) {
        throw new UiActionError('ui_action_invalid', 'button actions do not accept a value')
      }
      return common
    case 'input':
      if (node.inputType === 'password') {
        throw new UiActionError('ui_action_unavailable', 'password UI actions are unavailable without an ephemeral secret transport')
      }
      if (typeof request.value !== 'string') {
        throw new UiActionError('ui_action_invalid', 'text input actions require a string value')
      }
      return { ...common, fieldName: node.name, value: request.value }
    case 'select':
      if (typeof request.value !== 'string') {
        throw new UiActionError('ui_action_invalid', 'select actions require a string option value')
      }
      if (!node.options.some((option) => option.value === request.value)) {
        throw new UiActionError('ui_action_invalid', 'select action value is not one of the persisted options')
      }
      return { ...common, fieldName: node.name, value: request.value }
    case 'checkbox':
    case 'switch':
      if (typeof request.value !== 'boolean') {
        throw new UiActionError('ui_action_invalid', 'boolean UI actions require a boolean value')
      }
      return { ...common, fieldName: node.name, value: request.value }
  }
}
