import { z } from 'zod'

export const FLOW_SCHEMA_VERSION = 1 as const
export const FLOW_INVOCATION_DEPTH_LIMIT = 3

export const FlowPortTypeV1 = z.enum([
  'string', 'number', 'boolean', 'json', 'table', 'file', 'document', 'image', 'agent_message'
])
export type FlowPortTypeV1 = z.infer<typeof FlowPortTypeV1>

export const FlowPortV1 = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: FlowPortTypeV1,
  required: z.boolean().default(false),
  multiple: z.boolean().default(false)
}).strict()
export type FlowPortV1 = z.infer<typeof FlowPortV1>

export const FlowBindingV1 = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.unknown() }).strict(),
  z.object({ kind: z.literal('variable'), variable: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('port'), nodeId: z.string().min(1), portId: z.string().min(1) }).strict()
])
export type FlowBindingV1 = z.infer<typeof FlowBindingV1>

export const FlowNodePolicyV1 = z.object({
  timeoutMs: z.number().int().min(100).max(3_600_000).default(120_000),
  retryAttempts: z.number().int().min(0).max(10).default(0),
  retryBackoffMs: z.number().int().min(0).max(300_000).default(1000),
  errorBehavior: z.enum(['fail', 'error_edge', 'continue']).default('fail'),
  concurrencyLimit: z.number().int().min(1).max(64).default(1),
  resumable: z.boolean().default(false),
  breakpoint: z.boolean().default(false)
}).strict()
export type FlowNodePolicyV1 = z.infer<typeof FlowNodePolicyV1>

export const FlowNodeV1 = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }).strict(),
  bindings: z.record(z.string(), FlowBindingV1).default({}),
  config: z.record(z.string(), z.unknown()).default({}),
  policy: FlowNodePolicyV1,
  disabled: z.boolean().default(false)
}).strict()
export type FlowNodeV1 = z.infer<typeof FlowNodeV1>

export const FlowEdgeV1 = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  sourcePortId: z.string().min(1),
  targetNodeId: z.string().min(1),
  targetPortId: z.string().min(1),
  conversionId: z.string().min(1).optional(),
  branch: z.enum(['normal', 'error']).default('normal')
}).strict()
export type FlowEdgeV1 = z.infer<typeof FlowEdgeV1>

export const FlowDefinitionV1 = z.object({
  schemaVersion: z.literal(FLOW_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  revision: z.number().int().positive(),
  nodes: z.array(FlowNodeV1),
  edges: z.array(FlowEdgeV1),
  variables: z.record(z.string(), z.unknown()).default({}),
  workspace: z.string().optional(),
  publishedVersionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()
export type FlowDefinitionV1 = z.infer<typeof FlowDefinitionV1>

export const FlowRunStatusV1 = z.enum([
  'queued', 'running', 'waiting_approval', 'paused', 'interrupted', 'succeeded', 'failed', 'cancelled'
])
export type FlowRunStatusV1 = z.infer<typeof FlowRunStatusV1>
export const FlowNodeRunStatusV1 = z.enum([
  'pending', 'running', 'waiting_approval', 'paused', 'interrupted', 'succeeded', 'failed', 'skipped', 'cancelled'
])

export const FlowRunV1 = z.object({
  id: z.string().min(1),
  flowId: z.string().min(1),
  versionId: z.string().min(1),
  status: FlowRunStatusV1,
  input: z.unknown(),
  output: z.unknown().optional(),
  invocationStack: z.array(z.string()).max(FLOW_INVOCATION_DEPTH_LIMIT),
  checkpoint: z.record(z.string(), z.unknown()).optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional()
}).strict()
export type FlowRunV1 = z.infer<typeof FlowRunV1>

export const FlowNodeRunV1 = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  nodeId: z.string().min(1),
  attempt: z.number().int().positive(),
  status: FlowNodeRunStatusV1,
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional()
}).strict()
export type FlowNodeRunV1 = z.infer<typeof FlowNodeRunV1>

export const FlowEventV1 = z.object({
  id: z.string().min(1), runId: z.string().min(1), nodeId: z.string().optional(),
  type: z.string().min(1), payload: z.unknown(), createdAt: z.string()
}).strict()
export type FlowEventV1 = z.infer<typeof FlowEventV1>

export const FlowTriggerStateV1 = z.object({
  flowId: z.string().min(1), nodeId: z.string().min(1), enabled: z.boolean(),
  nextRunAt: z.string().optional(), lastRunAt: z.string().optional(), state: z.record(z.string(), z.unknown()).default({})
}).strict()
export type FlowTriggerStateV1 = z.infer<typeof FlowTriggerStateV1>

export const FlowCredentialReferenceV1 = z.object({
  id: z.string().min(1), provider: z.string().min(1), safeStorageKey: z.string().min(1), createdAt: z.string()
}).strict()
export type FlowCredentialReferenceV1 = z.infer<typeof FlowCredentialReferenceV1>

export const FlowNodeRegistryEntryV1 = z.object({
  type: z.string().min(1), category: z.enum(['trigger', 'intelligence', 'tool', 'control', 'human', 'output', 'integration']),
  label: z.string().min(1), inputs: z.array(FlowPortV1), outputs: z.array(FlowPortV1),
  requiredCapabilities: z.array(z.string()).default([]), available: z.boolean(),
  disabledReason: z.string().optional(), configurationRoute: z.string().optional()
}).strict()
export type FlowNodeRegistryEntryV1 = z.infer<typeof FlowNodeRegistryEntryV1>

export const FlowValidationIssueV1 = z.object({
  code: z.string().min(1), severity: z.enum(['error', 'warning']), message: z.string().min(1),
  nodeId: z.string().optional(), edgeId: z.string().optional(), path: z.array(z.string()).optional()
}).strict()
export type FlowValidationIssueV1 = z.infer<typeof FlowValidationIssueV1>

export const FlowValidationResultV1 = z.object({
  valid: z.boolean(), issues: z.array(FlowValidationIssueV1)
}).strict()

export const FlowApiContractsV1 = {
  create: z.object({ definition: FlowDefinitionV1.omit({ revision: true, createdAt: true, updatedAt: true }) }).strict(),
  update: z.object({ definition: FlowDefinitionV1, expectedRevision: z.number().int().positive() }).strict(),
  validate: z.object({ definition: FlowDefinitionV1 }).strict(),
  run: z.object({ flowId: z.string().min(1), versionId: z.string().optional(), input: z.unknown(), invocationStack: z.array(z.string()).max(3).default([]) }).strict(),
  nodeTest: z.object({ flowId: z.string().min(1), nodeId: z.string().min(1), mockInput: z.unknown() }).strict(),
  decision: z.object({ runId: z.string().min(1), nodeId: z.string().min(1), decision: z.enum(['approve', 'reject']), note: z.string().max(4000).optional() }).strict()
} as const
