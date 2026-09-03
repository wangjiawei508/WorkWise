import { z } from 'zod'

/** Versioned contracts for deterministic engineering-survey processing. */
export const SURVEY_SCHEMA_VERSION = 1 as const

export const SurveyNetworkTypeV1 = z.enum([
  'leveling',
  'height-control',
  'traverse',
  'plane-control',
  'triangulation',
  'cpiii-free-station',
  'cpiii-resection',
  'coordinate-transform',
  'gnss'
])
export type SurveyNetworkTypeV1 = z.infer<typeof SurveyNetworkTypeV1>

export const SurveyProjectV1 = z.object({
  schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  discipline: z.string().min(1).default('survey'),
  coordinateSystem: z.string().min(1).default('CGCS2000'),
  projection: z.string().min(1).default('Gauss-Kruger'),
  centralMeridian: z.number().finite().optional(),
  ellipsoid: z.string().min(1).default('CGCS2000'),
  verticalDatum: z.string().min(1).default('1985 National Height Datum'),
  unit: z.string().min(1).default('m'),
  signConvention: z.string().min(1).default('positive-up'),
  accuracyClass: z.string().min(1).default('engineering'),
  revision: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict()
export type SurveyProjectV1 = z.infer<typeof SurveyProjectV1>

export const SurveyPointV1 = z.object({
  id: z.string().min(1),
  pointClass: z.enum(['known', 'unknown', 'check', 'station']).default('unknown'),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  height: z.number().finite().optional(),
  known: z.boolean().default(false),
  sourceRow: z.number().int().positive().optional()
}).strict()
export type SurveyPointV1 = z.infer<typeof SurveyPointV1>

export const SurveyObservationV1 = z.object({
  id: z.string().min(1),
  type: z.enum(['height-difference', 'distance', 'direction', 'angle', 'zenith', 'slope-distance', 'gnss-baseline']),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  station: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  left: z.string().min(1).optional(),
  right: z.string().min(1).optional(),
  value: z.number().finite(),
  unit: z.string().min(1).default('m'),
  /** Optional target coordinates used when fitting a coordinate transform. */
  targetX: z.number().finite().optional(),
  targetY: z.number().finite().optional(),
  targetHeight: z.number().finite().optional(),
  sigma: z.number().positive().optional(),
  /** Unit of sigma. Length observations default to the observation unit;
   * angular observations default to arc-seconds for legacy compatibility. */
  sigmaUnit: z.string().min(1).optional(),
  covariance: z.array(z.number().finite()).optional(),
  routeLength: z.number().positive().optional(),
  face: z.enum(['left', 'right', 'single']).optional(),
  timestamp: z.string().optional(),
  sourceRow: z.number().int().positive().optional(),
  sourceLocator: z.string().optional()
}).strict()
export type SurveyObservationV1 = z.infer<typeof SurveyObservationV1>

export const SurveyQualityFindingV1 = z.object({
  schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
  id: z.string().min(1),
  networkId: z.string().min(1),
  code: z.enum([
    'missing_point', 'disconnected_network', 'unit_conflict', 'rank_deficient',
    'closure_exceeded', 'outlier_candidate', 'missing_covariance', 'missing_datum',
    'invalid_observation', 'dimension_limit', 'missing_baseline'
  ]),
  severity: z.enum(['blocking', 'warning', 'info']),
  message: z.string().min(1),
  suggestion: z.string().min(1),
  row: z.number().int().positive().optional(),
  status: z.enum(['open', 'resolved', 'accepted']).default('open'),
  createdAt: z.string().min(1)
}).strict()
export type SurveyQualityFindingV1 = z.infer<typeof SurveyQualityFindingV1>

export const SurveyNetworkV1 = z.object({
  schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  networkType: SurveyNetworkTypeV1,
  /** Survey reference metadata is persisted with the network so a result can
   * be reviewed without relying on the current project form state. Defaults
   * keep older stored networks readable during migration. */
  coordinateSystem: z.string().min(1).default('待确认'),
  projection: z.string().min(1).default('待确认'),
  centralMeridian: z.number().finite().optional(),
  ellipsoid: z.string().min(1).default('待确认'),
  verticalDatum: z.string().min(1).default('待确认'),
  /** Legacy renderer/fixture alias; normalized responses use verticalDatum. */
  heightDatum: z.string().min(1).optional(),
  unit: z.string().min(1).default('m'),
  knownPoints: z.array(SurveyPointV1).max(10_000),
  unknownPoints: z.array(SurveyPointV1).max(10_000),
  observations: z.array(SurveyObservationV1).max(100_000),
  instrumentParameters: z.record(z.string(), z.number().finite()).default({}),
  observationEpoch: z.string().optional(),
  inputAttachmentHash: z.string().min(1).optional(),
  qualityStatus: z.enum(['imported', 'validated', 'blocked', 'ready']).default('imported'),
  findings: z.array(SurveyQualityFindingV1).max(2_000).default([]),
  revision: z.number().int().positive(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
}).strict()
export type SurveyNetworkV1 = z.infer<typeof SurveyNetworkV1>

export const AdjustmentStatusV1 = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'needs_attention'])
export type AdjustmentStatusV1 = z.infer<typeof AdjustmentStatusV1>

export const AdjustmentRunV1 = z.object({
  schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  networkId: z.string().min(1),
  method: z.enum(['weighted-least-squares', 'conditional', 'helmert-seven-parameter', 'height-fit']),
  constraint: z.enum(['fixed-known-points', 'free', 'minimum-constraint']).default('fixed-known-points'),
  algorithmVersion: z.string().min(1),
  inputHash: z.string().min(1),
  status: AdjustmentStatusV1,
  revision: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
  cancellationReason: z.string().optional(),
  resumeCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  completedAt: z.string().optional()
}).strict()
export type AdjustmentRunV1 = z.infer<typeof AdjustmentRunV1>

export const AdjustmentPointResultV1 = z.object({
  id: z.string().min(1),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  height: z.number().finite().optional(),
  correctionX: z.number().finite().optional(),
  correctionY: z.number().finite().optional(),
  correctionHeight: z.number().finite().optional(),
  standardError: z.number().nonnegative().optional(),
  covariance: z.array(z.number().finite()).optional()
}).strict()

export const AdjustmentObservationResultV1 = z.object({
  observationId: z.string().min(1),
  correction: z.number().finite(),
  residual: z.number().finite(),
  /** Corrections and residuals are emitted in canonical Runtime units.
   * Optional for adjustment records created before 0.5.0. */
  unit: z.enum(['m', 'rad']).optional(),
  standardizedResidual: z.number().finite().optional(),
  outlier: z.boolean().default(false),
  sourceRow: z.number().int().positive().optional()
}).strict()

export const AdjustmentDisplacementV1 = z.object({
  pointId: z.string().min(1),
  dX: z.number().finite().optional(),
  dY: z.number().finite().optional(),
  dH: z.number().finite().optional(),
  magnitude: z.number().nonnegative(),
  kind: z.enum(['horizontal', 'vertical', 'three-dimensional']).default('horizontal')
}).strict()
export type AdjustmentDisplacementV1 = z.infer<typeof AdjustmentDisplacementV1>

export const AdjustmentResultV1 = z.object({
  schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
  id: z.string().min(1),
  runId: z.string().min(1),
  networkId: z.string().min(1),
  observationCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  redundancy: z.number().int().nonnegative(),
  degreesOfFreedom: z.number().int().nonnegative(),
  /** Coordinates, heights, corrections, displacements and point standard
   * errors are normalized to metres before entering the numeric kernel. */
  linearUnit: z.literal('m').default('m'),
  /** Direction and angle residuals are normalized to radians. */
  angularUnit: z.literal('rad').default('rad'),
  closure: z.record(z.string(), z.number().finite()).default({}),
  /** Per-key units avoid assigning a linear unit to mixed-network angular
   * residual norms or to dimensionless relative closures. */
  closureUnits: z.record(z.string(), z.enum(['m', 'rad', 'ppm', 'ratio'])).default({}),
  unitWeightStdDev: z.number().nonnegative(),
  varianceFactor: z.number().nonnegative(),
  /** False means the a-priori unit variance is retained because the network
   * has no redundancy; older records default to false rather than claiming
   * a posterior estimate. */
  varianceFactorEstimated: z.boolean().default(false),
  points: z.array(AdjustmentPointResultV1),
  observations: z.array(AdjustmentObservationResultV1),
  displacements: z.array(AdjustmentDisplacementV1).default([]),
  covariance: z.array(z.array(z.number().finite())).optional(),
  precision: z.object({ maxPointStdDev: z.number().nonnegative(), relativePrecision: z.number().nonnegative().optional(), passed: z.boolean() }).strict(),
  qualityFindings: z.array(SurveyQualityFindingV1),
  inputHash: z.string().min(1),
  algorithmVersion: z.string().min(1),
  validation: z.enum(['valid', 'invalid', 'pending']),
  /** Explicit deterministic strategy used for this run. Kept optional so
   * results written by 0.4.x remain readable during migration. */
  strategyId: SurveyNetworkTypeV1.optional(),
  solverDiagnostics: z.object({
    iterations: z.number().int().nonnegative().optional(),
    rank: z.number().int().nonnegative().optional(),
    conditionEstimate: z.number().nonnegative().optional(),
    unsupportedReason: z.string().optional()
  }).strict().optional(),
  createdAt: z.string().min(1)
}).strict()
export type AdjustmentResultV1 = z.infer<typeof AdjustmentResultV1>

export const SkillProvenanceV1 = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceRepository: z.string().min(1),
  commit: z.string().min(1),
  license: z.string().min(1),
  fileHashes: z.record(z.string(), z.string()).default({}),
  scripts: z.array(z.string()).default([]),
  networkAccess: z.enum(['none', 'controlled', 'external']).default('none'),
  credentialAccess: z.enum(['none', 'reference-only', 'read']).default('none'),
  packaged: z.boolean(),
  status: z.enum(['available', 'blocked', 'review']).default('review'),
  reason: z.string().optional()
}).strict()
export type SkillProvenanceV1 = z.infer<typeof SkillProvenanceV1>

export const EngineeringCapabilityV1 = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(['survey', 'monitoring', 'documents', 'standards', 'cad-bim']),
  skillIds: z.array(z.string()),
  toolIds: z.array(z.string()),
  available: z.boolean(),
  reason: z.string().optional()
}).strict()
export type EngineeringCapabilityV1 = z.infer<typeof EngineeringCapabilityV1>

export const SurveyNetworkImportRequest = z.object({
  projectId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
  networkType: SurveyNetworkTypeV1.optional(),
  network: SurveyNetworkV1.partial().optional(),
  name: z.string().min(1).optional(),
  dataBase64: z.string().min(1).optional(),
  inputAttachmentHash: z.string().min(1).optional()
}).strict().refine((value) => Boolean(value.network || (value.name && value.dataBase64)), { message: 'network or name/dataBase64 is required' })
export type SurveyNetworkImportRequest = z.infer<typeof SurveyNetworkImportRequest>

export const SurveyNetworkValidateRequest = z.object({ expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(200) }).strict()
export const AdjustmentRequestV1 = z.object({ networkId: z.string().min(1), expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(200), method: AdjustmentRunV1.shape.method.optional(), constraint: AdjustmentRunV1.shape.constraint.optional() }).strict()
export const AdjustmentMutationRequestV1 = z.object({ expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(200), reason: z.string().max(500).optional() }).strict()
