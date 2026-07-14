import { z } from 'zod'

export const RuntimeResourceLimitsV1 = z.object({
  jsonRequestBodyBytes: z.number().int().positive(), attachmentRequestBodyBytes: z.number().int().positive(),
  attachmentFileBytes: z.number().int().positive(), attachmentsPerTurn: z.number().int().positive(),
  promptBytes: z.number().int().positive(), displayTextBytes: z.number().int().positive(), steerBytes: z.number().int().positive(),
  sseEventBytes: z.number().int().positive(), sseBufferBytes: z.number().int().positive(), sseBatchEvents: z.number().int().positive(),
  sseBatchBytes: z.number().int().positive(), ssePerRenderer: z.number().int().positive(), sseApplication: z.number().int().positive(),
  sseReplayEvents: z.number().int().positive(), sseReplayBytes: z.number().int().positive(), modelFrameBytes: z.number().int().positive(),
  modelTextBytes: z.number().int().positive(), toolArgumentsBytes: z.number().int().positive(), modelStepsPerTurn: z.number().int().positive(),
  streamIdleMs: z.number().int().positive(), turnTotalMs: z.number().int().positive(), injectedToolResultBytes: z.number().int().positive(),
  injectedToolResultLines: z.number().int().positive(), injectedToolResultTokens: z.number().int().positive(), shellDisplayBytes: z.number().int().positive(),
  shellRawBytes: z.number().int().positive(), turnsPerThread: z.number().int().positive(), turnsApplication: z.number().int().positive(),
  processesPerWorkspace: z.number().int().positive(), processesApplication: z.number().int().positive(), temporaryToolOutputBytes: z.number().int().positive(),
  cleanableCacheBytes: z.number().int().positive(), knowledgeCacheBytes: z.number().int().positive()
}).strict()
export type RuntimeResourceLimitsV1 = z.infer<typeof RuntimeResourceLimitsV1>

export const RUNTIME_RESOURCE_LIMITS_V1: RuntimeResourceLimitsV1 = Object.freeze({
  jsonRequestBodyBytes: 2 * 1024 * 1024, attachmentRequestBodyBytes: 8 * 1024 * 1024,
  attachmentFileBytes: 5 * 1024 * 1024, attachmentsPerTurn: 8, promptBytes: 256 * 1024,
  displayTextBytes: 64 * 1024, steerBytes: 32 * 1024, sseEventBytes: 512 * 1024,
  sseBufferBytes: 1024 * 1024, sseBatchEvents: 128, sseBatchBytes: 512 * 1024,
  ssePerRenderer: 8, sseApplication: 16, sseReplayEvents: 10_000, sseReplayBytes: 10 * 1024 * 1024,
  modelFrameBytes: 512 * 1024, modelTextBytes: 8 * 1024 * 1024, toolArgumentsBytes: 1024 * 1024,
  modelStepsPerTurn: 64, streamIdleMs: 45_000, turnTotalMs: 30 * 60_000,
  injectedToolResultBytes: 32 * 1024, injectedToolResultLines: 320, injectedToolResultTokens: 8_000,
  shellDisplayBytes: 50 * 1024, shellRawBytes: 50 * 1024 * 1024, turnsPerThread: 1,
  turnsApplication: 4, processesPerWorkspace: 4, processesApplication: 8,
  temporaryToolOutputBytes: 200 * 1024 * 1024, cleanableCacheBytes: 256 * 1024 * 1024,
  knowledgeCacheBytes: 20 * 1024 * 1024
})
