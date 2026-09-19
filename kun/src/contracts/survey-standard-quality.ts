import { z } from 'zod'

const identity = z.string().trim().min(1).max(200)
const digest = z.string().regex(/^[0-9a-f]{64}$/)
const timestamp = z.iso.datetime({ offset: true })

export const SurveyStandardRuleRefV1 = z.object({
  standardCode: identity, standardVersion: identity, ruleId: identity, ruleVersion: identity
}).strict()
export type SurveyStandardRuleRefV1 = z.infer<typeof SurveyStandardRuleRefV1>

/** Descriptive registration is permitted without licensing or acquiring full text. */
export const SurveyStandardRuleV1 = SurveyStandardRuleRefV1.extend({
  schemaVersion: z.literal(1),
  locator: z.object({ clause: identity, table: identity.optional() }).strict().optional(),
  source: z.object({
    url: z.url().refine(value => new URL(value).protocol === 'https:', 'HTTPS source required'),
    retrievedAt: timestamp,
    kind: z.enum(['official-metadata', 'full-text']),
    sha256: digest.optional(),
    excerpt: z.object({
      byteOffset: z.number().int().nonnegative(), byteLength: z.number().int().positive(), sha256: digest
    }).strict().optional()
  }).strict(),
  scope: z.object({
    taskTypes: z.array(identity).min(1), grades: z.array(identity).min(1), jurisdictions: z.array(identity).min(1)
  }).strict(),
  effectiveFrom: timestamp.optional(), effectiveUntil: timestamp.optional(),
  assertion: z.object({
    metric: identity, unit: identity, operator: z.enum(['lte', 'gte', 'abs-lte']), threshold: z.number().finite()
  }).strict().optional()
}).strict().refine(rule => !rule.effectiveFrom || !rule.effectiveUntil
  || Date.parse(rule.effectiveFrom) < Date.parse(rule.effectiveUntil), 'Invalid effective interval')
export type SurveyStandardRuleV1 = z.infer<typeof SurveyStandardRuleV1>

export const SurveyRuleContextV1 = z.object({
  taskType: identity, grade: identity, jurisdiction: identity, at: timestamp,
  metric: identity, unit: identity, value: z.number().finite()
}).strict()
export type SurveyRuleContextV1 = z.infer<typeof SurveyRuleContextV1>

export const SurveyQualityEventV1 = z.object({
  schemaVersion: z.literal(1), id: identity, projectId: identity, artifactSha256: digest,
  sequence: z.number().int().positive(), previousHash: digest, thisHash: digest,
  occurredAt: timestamp,
  actor: z.object({ id: identity, kind: z.enum(['human', 'agent', 'system']) }).strict(),
  // Local process labels only; this schema does not assert a normative stage order.
  stage: identity,
  event: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('check'), checkId: identity, rule: SurveyStandardRuleRefV1.optional(),
      outcome: z.enum(['passed', 'failed', 'not-evaluated']), evidenceSha256: digest }).strict(),
    z.object({ kind: z.literal('issue-opened'), issueId: identity, checkId: identity,
      evidenceSha256: digest }).strict(),
    z.object({ kind: z.literal('correction-recorded'), issueId: identity, correctionId: identity,
      correctedArtifactSha256: digest, evidenceSha256: digest }).strict(),
    z.object({ kind: z.literal('issue-rechecked'), issueId: identity, correctionId: identity,
      recheckedArtifactSha256: digest, outcome: z.enum(['resolved', 'unresolved']), evidenceSha256: digest }).strict()
  ])
}).strict()
export type SurveyQualityEventV1 = z.infer<typeof SurveyQualityEventV1>

/** Persist independently to detect replacement of a whole chain or truncation of its tail. */
export const SurveyQualityCheckpointV1 = z.object({
  projectId: identity, artifactSha256: digest, eventCount: z.number().int().nonnegative(), headHash: digest
}).strict()
export type SurveyQualityCheckpointV1 = z.infer<typeof SurveyQualityCheckpointV1>
