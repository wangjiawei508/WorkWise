import { z } from 'zod'

const id = z.string().min(1).max(200).refine(value => value.trim() === value && Buffer.from(value, 'utf8').toString('utf8') === value, 'identifier must be nonblank, exact and valid Unicode')
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const SurveyQualitySamplingRequestV1 = z.object({
  schemaVersion: z.literal(1), projectId: id, populationId: id,
  /** Caller-defined unit products, never inferred from raw observations. */
  productType: id, unitProductType: id, definitionEvidenceSha256: hash,
  orderedUnitProductIds: z.array(id).min(1).max(100_000),
  populationHash: hash,
  stage: z.enum(['process', 'final-office', 'final-field', 'acceptance']),
  inspectionMode: z.enum(['census', 'table-1-simple-random']),
  round: z.number().int().positive().max(1_000_000),
  previousPlanHash: hash.optional(),
  randomSource: z.object({
    seedHex: hash, sourceDescription: z.string().trim().min(1).max(500), receiptSha256: hash,
    trust: z.literal('caller-declared-not-authenticated')
  }).strict().optional()
}).strict().superRefine((input, context) => {
  if (new Set(input.orderedUnitProductIds).size !== input.orderedUnitProductIds.length) context.addIssue({ code: 'custom', path: ['orderedUnitProductIds'], message: 'unit product IDs must be unique' })
  if (['process', 'final-office'].includes(input.stage) && input.inspectionMode !== 'census') context.addIssue({ code: 'custom', path: ['inspectionMode'], message: 'this inspection stage requires all units' })
  if ((input.round === 1) !== (input.previousPlanHash === undefined)) context.addIssue({ code: 'custom', path: ['previousPlanHash'], message: 'later rounds require a previous plan binding; first round must not supply one' })
  if (input.inspectionMode === 'table-1-simple-random' && !input.randomSource) context.addIssue({ code: 'custom', path: ['randomSource'], message: 'replayable random-source evidence is required' })
  if (input.inspectionMode === 'census' && input.randomSource) context.addIssue({ code: 'custom', path: ['randomSource'], message: 'census does not use randomness' })
})
export type SurveyQualitySamplingRequestV1 = z.infer<typeof SurveyQualitySamplingRequestV1>
