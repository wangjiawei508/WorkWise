export const CANCELLATION_SCOPES = [
  'app', 'window', 'workspace', 'thread', 'turn', 'approval', 'subtask', 'schedule', 'im', 'shell'
] as const
export type CancellationScope = typeof CANCELLATION_SCOPES[number]
export type CancellationRef = { scope: CancellationScope; id: string }
export type CancelOperationRequest = CancellationRef & { reason?: string }
export type CancelOperationResult = { ok: true; cancelled: number }
