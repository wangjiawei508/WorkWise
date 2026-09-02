import { z } from 'zod'

export const EngineeringAiSchemaVersion = 1 as const

export const EngineeringAiThreadMetaV1 = z.object({
  schemaVersion: z.literal(EngineeringAiSchemaVersion),
  threadId: z.string().min(1),
  projectId: z.string().min(1),
  workspace: z.string().min(1),
  projectRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict()
export type EngineeringAiThreadMetaV1 = z.infer<typeof EngineeringAiThreadMetaV1>

export const EngineeringContextSnapshotV1 = z.object({
  schemaVersion: z.literal(EngineeringAiSchemaVersion),
  projectId: z.string().min(1),
  projectRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  generatedAt: z.string().min(1),
  project: z.object({
    name: z.string(), monitoringType: z.string(), unit: z.string(),
    reportPeriod: z.object({ start: z.string().optional(), end: z.string().optional() }).strict(),
    thresholds: z.record(z.string(), z.number())
  }).strict(),
  datasets: z.array(z.object({
    id: z.string(), sourceFileName: z.string(), sourceFileHash: z.string(),
    rowCount: z.number().int().nonnegative(), observationCount: z.number().int().nonnegative(),
    status: z.string(), revision: z.number().int().positive(), findings: z.array(z.object({
      code: z.string(), severity: z.string(), status: z.string(), message: z.string(), row: z.number().int().positive().optional()
    }).strict()).max(200)
  }).strict()).max(20),
  analyses: z.array(z.object({ id: z.string(), datasetId: z.string(), algorithmVersion: z.string(), resultCount: z.number().int().nonnegative(), inputHash: z.string() }).strict()).max(20),
  runs: z.array(z.object({ id: z.string(), status: z.string(), datasetId: z.string(), analysisId: z.string().optional(), revision: z.number().int().nonnegative(), updatedAt: z.string() }).strict()).max(20),
  citations: z.array(z.object({ id: z.string(), source: z.string(), sourceType: z.string(), locator: z.string().optional() }).strict()).max(100),
  watchDrafts: z.array(z.object({
    id: z.string(), projectId: z.string(), name: z.string(), expression: z.string(), enabled: z.boolean(), revision: z.number().int().positive(), updatedAt: z.string()
  }).strict()).max(20).default([])
}).strict()
export type EngineeringContextSnapshotV1 = z.infer<typeof EngineeringContextSnapshotV1>

export const EngineeringPlanRiskV1 = z.enum(['read', 'write', 'export', 'threshold', 'archive'])
export const EngineeringPlanStepV1 = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  tool: z.string().min(1).max(120),
  risk: EngineeringPlanRiskV1,
  dependsOn: z.array(z.string().min(1)).max(32).default([]),
  inputHash: z.string().min(1),
  approval: z.enum(['pending', 'approved', 'rejected']).default('pending')
}).strict()
export type EngineeringPlanStepV1 = z.infer<typeof EngineeringPlanStepV1>

export const EngineeringRunPlanV1 = z.object({
  schemaVersion: z.literal(EngineeringAiSchemaVersion),
  id: z.string().min(1),
  threadId: z.string().min(1),
  projectId: z.string().min(1),
  contextHash: z.string().min(1),
  revision: z.number().int().positive(),
  goal: z.string().trim().min(1).max(4_000),
  steps: z.array(EngineeringPlanStepV1).min(1).max(32),
  status: z.enum(['draft', 'validating', 'awaiting_approval', 'approved', 'stale', 'started', 'queued', 'running', 'completed', 'failed', 'cancelled', 'needs_attention', 'rejected']),
  taskId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict()
export type EngineeringRunPlanV1 = z.infer<typeof EngineeringRunPlanV1>

export const EngineeringApprovalV1 = z.object({
  schemaVersion: z.literal(EngineeringAiSchemaVersion),
  planId: z.string().min(1),
  planRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  stepIds: z.array(z.string().min(1)).min(1).max(32),
  token: z.string().min(16),
  expiresAt: z.string().min(1)
}).strict()
export type EngineeringApprovalV1 = z.infer<typeof EngineeringApprovalV1>

export const EngineeringEvidenceCardV1 = z.object({
  schemaVersion: z.literal(EngineeringAiSchemaVersion),
  id: z.string().min(1),
  planId: z.string().min(1).optional(),
  kind: z.enum(['finding', 'metric', 'trend', 'citation', 'artifact', 'status']),
  title: z.string().min(1).max(200),
  summary: z.string().max(2_000),
  sourceHash: z.string().optional(),
  locator: z.string().optional(),
  createdAt: z.string().min(1)
}).strict()
export type EngineeringEvidenceCardV1 = z.infer<typeof EngineeringEvidenceCardV1>

export const EngineeringWatchRuleV1 = z.object({
  schemaVersion: z.literal(EngineeringAiSchemaVersion),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  expression: z.string().min(1).max(500),
  enabled: z.boolean(),
  revision: z.number().int().positive(),
  updatedAt: z.string().min(1)
}).strict()
export type EngineeringWatchRuleV1 = z.infer<typeof EngineeringWatchRuleV1>
