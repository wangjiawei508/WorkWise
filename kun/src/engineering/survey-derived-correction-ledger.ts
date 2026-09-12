import { createHash } from 'node:crypto'
import {
  SURVEY_DERIVED_CORRECTION_SCHEMA_VERSION,
  SurveyDerivedCorrectionRecordV1,
  SurveyNetworkV1,
  type SurveyDerivedCorrectionActorV1,
  type SurveyDerivedCorrectionBasisV1,
  type SurveyDerivedCorrectionOperationV1,
  type SurveyDerivedCorrectionRecordV1 as SurveyDerivedCorrectionRecord,
  type SurveyNetworkV1 as SurveyNetwork,
  type SurveyObservationV1
} from '../contracts/survey.js'
import { rawAnchorDigest, verifyRawSourceLedger, type SurveyRawDataLedgerEntry } from './survey-raw-data-ledger.js'

/**
 * Generic, append-only derived-correction ledger.
 *
 * It purposefully has no tolerance tables, standards text, quality scoring,
 * signature workflow, or adjustment-policy logic. It only preserves the
 * evidence needed to replay a reviewed scalar observation-value correction
 * without overwriting the imported source network.
 */

export class SurveyDerivedCorrectionLedgerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SurveyDerivedCorrectionLedgerError'
  }
}

export type RecordDerivedObservationValueCorrectionInput = Readonly<{
  id: string
  networkId: string
  sequence: number
  initialRawSourceLedgerEntry: SurveyRawDataLedgerEntry
  previousHash: string
  observation: SurveyObservationV1
  beforeValue: number
  afterValue: number
  sourceAnchorId: string
  reason: string
  basis: SurveyDerivedCorrectionBasisV1
  operation: SurveyDerivedCorrectionOperationV1
  actor: SurveyDerivedCorrectionActorV1
  occurredAt: string
}>

export type SurveyDerivedCorrectionStep = Readonly<{
  recordId: string
  observationId: string
  beforeValue: number
  afterValue: number
  unit: string
}>

export type SurveyDerivedCorrectionReplay = Readonly<{
  valid: boolean
  errors: readonly string[]
  correctionCount: number
  rawSourceLedgerInitialHash?: string
  correctionLedgerHeadHash?: string
  steps: readonly SurveyDerivedCorrectionStep[]
  /** An in-memory view only. The original SurveyNetworkV1 is never written. */
  derivedNetwork?: SurveyNetwork
}>

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Stable JSON for hashable evidence, without relying on object insertion order. */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SurveyDerivedCorrectionLedgerError('canonical evidence cannot contain a non-finite number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, field]) => field !== undefined)
      // Hash evidence must not depend on host locale or collation settings.
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${fields.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(',')}}`
  }
  throw new SurveyDerivedCorrectionLedgerError(`canonical evidence cannot contain ${typeof value}`)
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

function sourceEvidence(network: SurveyNetwork): { sha256: string; fileSize: number; originalPreserved: boolean; records: Array<{ id: string; rawOffset: number; rawLength: number; rawLineNo?: number }> } | null {
  const source = network.sourceFile
  if (!source) return null
  return {
    sha256: source.sha256,
    fileSize: source.fileSize,
    originalPreserved: source.originalPreserved,
    records: source.records
      .filter((record) => record.rawLength > 0)
      .map((record) => ({
        id: record.id,
        rawOffset: record.rawOffset,
        rawLength: record.rawLength,
        ...(record.rawLineNo === undefined ? {} : { rawLineNo: record.rawLineNo })
      }))
  }
}

/** A fingerprint of the persisted raw observation, including its original value. */
export function surveyObservationSnapshotHash(observation: SurveyObservationV1): string {
  return sha256(canonicalJson(observation))
}

type HashableRecord = Omit<SurveyDerivedCorrectionRecord, 'thisHash'>

function hashableRecord(record: HashableRecord): HashableRecord {
  return {
    schemaVersion: record.schemaVersion,
    id: record.id,
    networkId: record.networkId,
    sequence: record.sequence,
    target: {
      kind: record.target.kind,
      observationId: record.target.observationId,
      sourceRecordId: record.target.sourceRecordId,
      sourceAnchorId: record.target.sourceAnchorId
    },
    rawSource: {
      sourceSha256: record.rawSource.sourceSha256,
      rawSourceLedgerInitialHash: record.rawSource.rawSourceLedgerInitialHash,
      rawAnchorDigest: record.rawSource.rawAnchorDigest
    },
    before: {
      value: record.before.value,
      unit: record.before.unit,
      observationSnapshotHash: record.before.observationSnapshotHash
    },
    after: { value: record.after.value, unit: record.after.unit },
    delta: record.delta,
    reason: record.reason,
    basis: {
      kind: record.basis.kind,
      referenceId: record.basis.referenceId,
      ...(record.basis.evidenceHash === undefined ? {} : { evidenceHash: record.basis.evidenceHash })
    },
    operation: {
      id: record.operation.id,
      version: record.operation.version,
      ...(record.operation.implementationHash === undefined ? {} : { implementationHash: record.operation.implementationHash })
    },
    actor: { id: record.actor.id, kind: record.actor.kind },
    occurredAt: record.occurredAt,
    previousHash: record.previousHash
  }
}

export function surveyDerivedCorrectionHash(record: HashableRecord): string {
  return sha256(canonicalJson(hashableRecord(record)))
}

function assertInitialRawSourceEntry(entry: SurveyRawDataLedgerEntry): void {
  if (entry.event !== 'source-recorded' || entry.sequence !== 1 || entry.previousHash !== null) {
    throw new SurveyDerivedCorrectionLedgerError('derived corrections must anchor the initial source-recorded ledger entry')
  }
  if (!isSha256(entry.thisHash) || !isSha256(entry.sourceSha256) || !isSha256(entry.rawAnchorDigest)) {
    throw new SurveyDerivedCorrectionLedgerError('initial raw-source ledger identity is invalid')
  }
}

/**
 * Create one immutable scalar correction. The caller supplies the effective
 * prior value; the delta and all hashes are calculated here rather than being
 * accepted from a renderer or external client.
 */
export function recordDerivedObservationValueCorrection(input: RecordDerivedObservationValueCorrectionInput): SurveyDerivedCorrectionRecord {
  assertInitialRawSourceEntry(input.initialRawSourceLedgerEntry)
  if (!input.networkId.trim() || input.networkId !== input.initialRawSourceLedgerEntry.networkId) throw new SurveyDerivedCorrectionLedgerError('correction network must match its initial raw-source ledger entry')
  if (!input.id.trim()) throw new SurveyDerivedCorrectionLedgerError('derived correction id is required')
  if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0) throw new SurveyDerivedCorrectionLedgerError('derived correction sequence must be a positive safe integer')
  if (!Number.isFinite(input.beforeValue) || !Number.isFinite(input.afterValue)) throw new SurveyDerivedCorrectionLedgerError('derived correction values must be finite')
  if (!input.observation.sourceRecordId || input.observation.sourceRecordId !== input.sourceAnchorId) throw new SurveyDerivedCorrectionLedgerError('derived correction requires an observation linked to its raw source anchor')
  if (!isSha256(input.previousHash)) throw new SurveyDerivedCorrectionLedgerError('derived correction previousHash must be a SHA-256 digest')

  const candidate: HashableRecord = {
    schemaVersion: SURVEY_DERIVED_CORRECTION_SCHEMA_VERSION,
    id: input.id,
    networkId: input.networkId,
    sequence: input.sequence,
    target: {
      kind: 'observation-value',
      observationId: input.observation.id,
      sourceRecordId: input.observation.sourceRecordId,
      sourceAnchorId: input.sourceAnchorId
    },
    rawSource: {
      sourceSha256: input.initialRawSourceLedgerEntry.sourceSha256,
      rawSourceLedgerInitialHash: input.initialRawSourceLedgerEntry.thisHash,
      rawAnchorDigest: input.initialRawSourceLedgerEntry.rawAnchorDigest
    },
    before: {
      value: input.beforeValue,
      unit: input.observation.unit,
      observationSnapshotHash: surveyObservationSnapshotHash(input.observation)
    },
    after: { value: input.afterValue, unit: input.observation.unit },
    delta: input.afterValue - input.beforeValue,
    reason: input.reason,
    basis: input.basis,
    operation: input.operation,
    actor: input.actor,
    occurredAt: input.occurredAt,
    previousHash: input.previousHash
  }
  return SurveyDerivedCorrectionRecordV1.parse({ ...candidate, thisHash: surveyDerivedCorrectionHash(candidate) })
}

function initialRawLedgerFor(network: SurveyNetwork, rawLedger: readonly SurveyRawDataLedgerEntry[], errors: string[]): SurveyRawDataLedgerEntry | undefined {
  const verification = verifyRawSourceLedger(rawLedger)
  if (!verification.valid) errors.push(...verification.errors.map((error) => `raw source ledger: ${error}`))
  const initial = rawLedger[0]
  if (!initial) return undefined
  try {
    assertInitialRawSourceEntry(initial)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
    return undefined
  }
  const evidence = sourceEvidence(network)
  if (!evidence) {
    errors.push('network is missing source evidence for the derived-correction ledger')
    return undefined
  }
  try {
    const digest = rawAnchorDigest(evidence)
    if (evidence.sha256 !== initial.sourceSha256 || evidence.fileSize !== initial.sourceSize || digest !== initial.rawAnchorDigest) {
      errors.push('network source evidence does not match the initial raw-source ledger identity')
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  return initial
}

/**
 * Verify the combined raw-source and derived-correction evidence chain, then
 * build an in-memory corrected view. It neither persists data nor mutates the
 * supplied source network.
 */
export function replayDerivedCorrections(input: Readonly<{
  network: SurveyNetwork
  rawLedger: readonly SurveyRawDataLedgerEntry[]
  corrections: readonly unknown[]
}>): SurveyDerivedCorrectionReplay {
  const errors: string[] = []
  const initial = initialRawLedgerFor(input.network, input.rawLedger, errors)
 if (!initial || errors.length) {
   return Object.freeze({ valid: false, errors: Object.freeze(errors), correctionCount: input.corrections.length, steps: Object.freeze([]) })
 }

  const observationIds = new Set<string>()
  for (const observation of input.network.observations) {
    if (observationIds.has(observation.id)) errors.push(`network has a duplicate observation id: ${observation.id}`)
    observationIds.add(observation.id)
  }
  const sourceAnchorIds = new Set<string>()
  for (const sourceRecord of input.network.sourceFile?.records ?? []) {
    if (sourceRecord.rawLength <= 0) continue
    if (sourceAnchorIds.has(sourceRecord.id)) errors.push(`network has a duplicate raw-source anchor id: ${sourceRecord.id}`)
    sourceAnchorIds.add(sourceRecord.id)
  }
  if (errors.length) {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(errors),
      correctionCount: input.corrections.length,
      rawSourceLedgerInitialHash: initial.thisHash,
      steps: Object.freeze([])
    })
  }

 const observations = new Map(input.network.observations.map((observation) => [observation.id, observation]))
  const effectiveValues = new Map(input.network.observations.map((observation) => [observation.id, observation.value]))
  const sourceAnchors = new Map((input.network.sourceFile?.records ?? []).filter((record) => record.rawLength > 0).map((record) => [record.id, record]))
  const ids = new Set<string>()
  const steps: SurveyDerivedCorrectionStep[] = []
  let previousHash = initial.thisHash
  const parsed: SurveyDerivedCorrectionRecord[] = []

  for (const [index, raw] of input.corrections.entries()) {
    const result = SurveyDerivedCorrectionRecordV1.safeParse(raw)
    if (!result.success) {
      errors.push(`derived correction at sequence ${index + 1} has an invalid schema: ${result.error.issues.map((issue) => issue.message).join('; ')}`)
      continue
    }
    const record = result.data
    parsed.push(record)
    if (ids.has(record.id)) errors.push(`derived correction ${record.id} has a duplicate id`)
    ids.add(record.id)
    if (record.networkId !== input.network.id) errors.push(`derived correction ${record.id} targets another network`)
    if (record.sequence !== index + 1) errors.push(`derived correction ${record.id} has a non-contiguous sequence`)
    if (record.previousHash !== previousHash) errors.push(`derived correction ${record.id} does not link to the prior evidence head`)
    if (record.rawSource.sourceSha256 !== initial.sourceSha256 || record.rawSource.rawSourceLedgerInitialHash !== initial.thisHash || record.rawSource.rawAnchorDigest !== initial.rawAnchorDigest) {
      errors.push(`derived correction ${record.id} does not anchor the initial raw-source identity`)
    }
    if (record.thisHash !== surveyDerivedCorrectionHash(record)) errors.push(`derived correction ${record.id} hash does not match its payload`)

    const observation = observations.get(record.target.observationId)
    const sourceAnchor = sourceAnchors.get(record.target.sourceAnchorId)
    if (!observation) errors.push(`derived correction ${record.id} references a missing observation`)
    else {
      if (observation.sourceRecordId !== record.target.sourceRecordId || observation.sourceRecordId !== record.target.sourceAnchorId) {
        errors.push(`derived correction ${record.id} does not match the observation raw-source anchor`)
      }
      if (surveyObservationSnapshotHash(observation) !== record.before.observationSnapshotHash) {
        errors.push(`derived correction ${record.id} original observation snapshot has changed`)
      }
      if (observation.unit !== record.before.unit || record.before.unit !== record.after.unit) {
        errors.push(`derived correction ${record.id} changes or mismatches the observation unit`)
      }
      const effectiveValue = effectiveValues.get(observation.id)
      if (effectiveValue !== record.before.value) {
        errors.push(`derived correction ${record.id} before value does not match the effective prior value`)
      }
      effectiveValues.set(observation.id, record.after.value)
    }
    if (!sourceAnchor || sourceAnchor.id !== record.target.sourceRecordId) errors.push(`derived correction ${record.id} references a missing raw-source anchor`)
    steps.push(Object.freeze({ recordId: record.id, observationId: record.target.observationId, beforeValue: record.before.value, afterValue: record.after.value, unit: record.after.unit }))
    previousHash = record.thisHash
  }

  if (errors.length) {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(errors),
      correctionCount: input.corrections.length,
      rawSourceLedgerInitialHash: initial.thisHash,
      correctionLedgerHeadHash: previousHash,
      steps: Object.freeze(steps)
    })
  }

  const derivedNetwork = SurveyNetworkV1.parse({
    ...input.network,
    observations: input.network.observations.map((observation) => ({ ...observation, value: effectiveValues.get(observation.id) ?? observation.value }))
  })
  return Object.freeze({
    valid: true,
    errors: Object.freeze([]),
    correctionCount: parsed.length,
    rawSourceLedgerInitialHash: initial.thisHash,
    correctionLedgerHeadHash: previousHash,
    steps: Object.freeze(steps),
    derivedNetwork
  })
}
