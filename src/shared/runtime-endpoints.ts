/**
 * WorkWise Agent Runtime HTTP endpoint path templates. The renderer and main
 * process IPC allow-list both derive their paths from this table, so
 * adding a new endpoint is a one-file change.
 *
 * `*TEMPLATE` constants carry the `{id}` / `{turn}` placeholders
 * literally. `*PATH(...)` builders perform the URL encoding and
 * return a concrete path for runtime use.
 */

export const RUNTIME_HEALTH_PATH = '/health'
export const RUNTIME_HEALTH_TEMPLATE = '/health'

export const RUNTIME_INFO_PATH = '/v1/runtime/info'
export const RUNTIME_INFO_TEMPLATE = '/v1/runtime/info'

export const RUNTIME_TOOLS_PATH = '/v1/runtime/tools'
export const RUNTIME_TOOLS_TEMPLATE = '/v1/runtime/tools'

export const RUNTIME_SKILLS_PATH = '/v1/skills'
export const RUNTIME_SKILLS_TEMPLATE = '/v1/skills'

export const RUNTIME_ATTACHMENTS_PATH = '/v1/attachments'
export const RUNTIME_ATTACHMENTS_TEMPLATE = '/v1/attachments'
export const RUNTIME_ATTACHMENT_DIAGNOSTICS_PATH = '/v1/attachments/diagnostics'
export const RUNTIME_ATTACHMENT_DIAGNOSTICS_TEMPLATE = '/v1/attachments/diagnostics'
export const RUNTIME_ATTACHMENT_TEMPLATE = '/v1/attachments/{id}'
export function runtimeAttachmentPath(attachmentId: string): string {
  return `/v1/attachments/${encodeURIComponent(attachmentId)}`
}
export const RUNTIME_ATTACHMENT_CONTENT_TEMPLATE = '/v1/attachments/{id}/content'
export function runtimeAttachmentContentPath(attachmentId: string): string {
  return `${runtimeAttachmentPath(attachmentId)}/content`
}

export const RUNTIME_MEMORY_PATH = '/v1/memory'
export const RUNTIME_MEMORY_TEMPLATE = '/v1/memory'
export const RUNTIME_MEMORY_DIAGNOSTICS_PATH = '/v1/memory/diagnostics'
export const RUNTIME_MEMORY_DIAGNOSTICS_TEMPLATE = '/v1/memory/diagnostics'
export const RUNTIME_MEMORY_RECORD_TEMPLATE = '/v1/memory/{id}'
export function runtimeMemoryRecordPath(memoryId: string): string {
  return `/v1/memory/${encodeURIComponent(memoryId)}`
}

export const RUNTIME_THREADS_PATH = '/v1/threads'
export const RUNTIME_THREADS_TEMPLATE = '/v1/threads'

export const RUNTIME_THREAD_TEMPLATE = '/v1/threads/{id}'
export function runtimeThreadPath(threadId: string): string {
  return `/v1/threads/${encodeURIComponent(threadId)}`
}

export const RUNTIME_THREAD_FORK_TEMPLATE = '/v1/threads/{id}/fork'
export function runtimeThreadForkPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/fork`
}

export const RUNTIME_THREAD_GOAL_TEMPLATE = '/v1/threads/{id}/goal'
export function runtimeThreadGoalPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/goal`
}

export const RUNTIME_THREAD_TODOS_TEMPLATE = '/v1/threads/{id}/todos'
export function runtimeThreadTodosPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/todos`
}

export const RUNTIME_THREAD_COMPACT_TEMPLATE = '/v1/threads/{id}/compact'
export function runtimeThreadCompactPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/compact`
}

export const RUNTIME_THREAD_REVIEW_TEMPLATE = '/v1/threads/{id}/review'
export function runtimeThreadReviewPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/review`
}

export const RUNTIME_THREAD_TURNS_TEMPLATE = '/v1/threads/{id}/turns'
export function runtimeThreadTurnsPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/turns`
}

export const RUNTIME_THREAD_STEER_TEMPLATE = '/v1/threads/{id}/turns/{turn}/steer'
export function runtimeThreadSteerPath(threadId: string, turnId: string): string {
  return `${runtimeThreadTurnsPath(threadId)}/${encodeURIComponent(turnId)}/steer`
}

export const RUNTIME_THREAD_INTERRUPT_TEMPLATE = '/v1/threads/{id}/turns/{turn}/interrupt'
export function runtimeThreadInterruptPath(threadId: string, turnId: string): string {
  return `${runtimeThreadTurnsPath(threadId)}/${encodeURIComponent(turnId)}/interrupt`
}

export const RUNTIME_THREAD_EVENTS_TEMPLATE = '/v1/threads/{id}/events'
export function runtimeThreadEventsPath(threadId: string): string {
  return `${runtimeThreadPath(threadId)}/events`
}

export const RUNTIME_APPROVAL_TEMPLATE = '/v1/approvals/{id}'
export function runtimeApprovalPath(approvalId: string): string {
  return `/v1/approvals/${encodeURIComponent(approvalId)}`
}

export const RUNTIME_USER_INPUT_TEMPLATE = '/v1/user-inputs/{id}'
export function runtimeUserInputPath(inputId: string): string {
  return `/v1/user-inputs/${encodeURIComponent(inputId)}`
}

export const RUNTIME_SESSION_RESUME_TEMPLATE = '/v1/sessions/{id}/resume-thread'
export function runtimeSessionResumePath(sessionId: string): string {
  return `/v1/sessions/${encodeURIComponent(sessionId)}/resume-thread`
}

export const RUNTIME_USAGE_PATH = '/v1/usage'
export const RUNTIME_USAGE_TEMPLATE = '/v1/usage'

/** Thread mode shared with the managed runtime contract. */
export type RuntimeThreadMode = 'agent' | 'plan'

const THREAD_MODES: ReadonlySet<RuntimeThreadMode> = new Set<RuntimeThreadMode>(['agent', 'plan'])

export function isRuntimeThreadMode(value: unknown): value is RuntimeThreadMode {
  return typeof value === 'string' && (THREAD_MODES as Set<string>).has(value)
}

export function normalizeThreadMode(value: unknown): RuntimeThreadMode {
  return value === 'plan' ? 'plan' : 'agent'
}
