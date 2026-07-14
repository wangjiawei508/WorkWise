import { z } from 'zod'
import { ApprovalPolicySchema, SandboxModeSchema } from './policy.js'
import { RuntimeCapabilityManifest } from './capabilities.js'
import { MODEL_ENDPOINT_FORMATS } from './model-endpoint-format.js'
import { RuntimeResourceLimitsV1 } from './resource-limits.js'

export const RuntimeInfoResponse = z
  .object({
    host: z.string(),
    port: z.number().int().min(0).max(65_535),
    dataDir: z.string().min(1),
    configPath: z.string().optional(),
    model: z.string().optional(),
    endpointFormat: z.enum(MODEL_ENDPOINT_FORMATS).optional(),
    approvalPolicy: ApprovalPolicySchema.optional(),
    sandboxMode: SandboxModeSchema.optional(),
    tokenEconomyMode: z.boolean().optional(),
    insecure: z.boolean().optional(),
    startedAt: z.string(),
    pid: z.number().int().positive().optional(),
    capabilities: RuntimeCapabilityManifest,
    resourceLimits: RuntimeResourceLimitsV1
  })
  .strict()
export type RuntimeInfoResponse = z.infer<typeof RuntimeInfoResponse>
