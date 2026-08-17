import { z } from 'zod'

const UiActionId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const UiSpecFingerprint = z.string().regex(/^[a-f0-9]{16}$/)
const UiActionStringValue = z.string().max(2_000)

export const UiActionNodeType = z.enum(['button', 'input', 'select', 'checkbox', 'switch'])
export type UiActionNodeType = z.infer<typeof UiActionNodeType>

export const UiActionValue = z.union([UiActionStringValue, z.boolean()])
export type UiActionValue = z.infer<typeof UiActionValue>

/**
 * The untrusted client request. `password` is intentionally omitted from
 * every persisted type; Runtime currently rejects password actions until it
 * has a dedicated ephemeral secret transport.
 */
export const UiActionRequest = z.object({
  messageId: z.string().min(1).max(256),
  blockId: UiActionId,
  actionId: UiActionId,
  specFingerprint: UiSpecFingerprint,
  idempotencyKey: z.string().trim().min(1).max(256),
  value: UiActionValue.optional(),
  password: z.string().min(1).max(2_000).optional()
}).strict()
export type UiActionRequest = z.infer<typeof UiActionRequest>

/** Public, persisted audit shape. It is structurally incapable of holding a password. */
export const UiActionAudit = z.object({
  messageId: z.string().min(1).max(256),
  blockId: UiActionId,
  actionId: UiActionId,
  specFingerprint: UiSpecFingerprint,
  nodeId: UiActionId,
  nodeType: UiActionNodeType,
  fieldName: UiActionId.optional(),
  value: UiActionValue.optional()
}).strict()
export type UiActionAudit = z.infer<typeof UiActionAudit>

export const UiActionStartResponse = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  uiActionItemId: z.string().min(1)
})
export type UiActionStartResponse = z.infer<typeof UiActionStartResponse>
