export type RuntimeResourceLimitsV1 = Readonly<{
  jsonRequestBodyBytes: number
  attachmentRequestBodyBytes: number
  attachmentFileBytes: number
  attachmentsPerTurn: number
  promptBytes: number
  displayTextBytes: number
  steerBytes: number
  sseEventBytes: number
  sseBufferBytes: number
  sseBatchEvents: number
  sseBatchBytes: number
  ssePerRenderer: number
  sseApplication: number
  sseReplayEvents: number
  sseReplayBytes: number
  modelFrameBytes: number
  modelTextBytes: number
  toolArgumentsBytes: number
  modelStepsPerTurn: number
  streamIdleMs: number
  turnTotalMs: number
  injectedToolResultBytes: number
  injectedToolResultLines: number
  injectedToolResultTokens: number
  shellDisplayBytes: number
  shellRawBytes: number
  turnsPerThread: number
  turnsApplication: number
  processesPerWorkspace: number
  processesApplication: number
  temporaryToolOutputBytes: number
  cleanableCacheBytes: number
  knowledgeCacheBytes: number
}>

export const RUNTIME_RESOURCE_LIMITS_V1: RuntimeResourceLimitsV1 = Object.freeze({
  jsonRequestBodyBytes: 2 * 1024 * 1024,
  attachmentRequestBodyBytes: 8 * 1024 * 1024,
  attachmentFileBytes: 5 * 1024 * 1024,
  attachmentsPerTurn: 8,
  promptBytes: 256 * 1024,
  displayTextBytes: 64 * 1024,
  steerBytes: 32 * 1024,
  sseEventBytes: 512 * 1024,
  sseBufferBytes: 1024 * 1024,
  sseBatchEvents: 128,
  sseBatchBytes: 512 * 1024,
  ssePerRenderer: 8,
  sseApplication: 16,
  sseReplayEvents: 10_000,
  sseReplayBytes: 10 * 1024 * 1024,
  modelFrameBytes: 512 * 1024,
  modelTextBytes: 8 * 1024 * 1024,
  toolArgumentsBytes: 1024 * 1024,
  modelStepsPerTurn: 64,
  streamIdleMs: 45_000,
  turnTotalMs: 30 * 60_000,
  injectedToolResultBytes: 32 * 1024,
  injectedToolResultLines: 320,
  injectedToolResultTokens: 8_000,
  shellDisplayBytes: 50 * 1024,
  shellRawBytes: 50 * 1024 * 1024,
  turnsPerThread: 1,
  turnsApplication: 4,
  processesPerWorkspace: 4,
  processesApplication: 8,
  temporaryToolOutputBytes: 200 * 1024 * 1024,
  cleanableCacheBytes: 256 * 1024 * 1024,
  knowledgeCacheBytes: 20 * 1024 * 1024
})
