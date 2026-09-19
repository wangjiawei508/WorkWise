import { createHash } from 'node:crypto'
import { SurveyQualityCheckpointV1, SurveyQualityEventV1, type SurveyQualityCheckpointV1 as Checkpoint,
  type SurveyQualityEventV1 as QualityEvent } from '../contracts/survey-standard-quality.js'

export const SURVEY_QUALITY_CHAIN_GENESIS = '0'.repeat(64)

function digest(event: Omit<QualityEvent, 'thisHash'>): string {
  // Zod parsing gives a fixed schema field order, including discriminated event fields.
  const { thisHash: _hash, ...parsed } = SurveyQualityEventV1.parse({ ...event, thisHash: SURVEY_QUALITY_CHAIN_GENESIS })
  return createHash('sha256').update(JSON.stringify(parsed)).digest('hex')
}

export type SurveyQualityIntegrity = {
  valid: boolean
  errors: string[]
  openIssueCount: number
  recordedCheckCount: number
  standardConformity: 'not-evaluated'
  humanSignatureVerification: 'not-evaluated'
}

/** Internal workflow integrity only, not GB/T 24356 sampling/scoring or acceptance. */
export function verifySurveyQualityRecord(inputs: readonly unknown[], checkpoint?: Checkpoint): SurveyQualityIntegrity {
  const errors: string[] = []
  const ids = new Set<string>()
  const checks = new Map<string, 'passed' | 'failed' | 'not-evaluated'>()
  const issues = new Map<string, { correctionId?: string; correctedArtifactSha256?: string; resolved: boolean }>()
  const corrections = new Set<string>()
  let previousHash = SURVEY_QUALITY_CHAIN_GENESIS
  let previousTime = -Infinity
  let binding: { projectId: string; artifactSha256: string } | undefined
  for (const [index, input] of inputs.entries()) {
    const parsed = SurveyQualityEventV1.safeParse(input)
    if (!parsed.success) { errors.push(`event[${index}]:invalid-schema`); continue }
    const item = parsed.data
    const error = (reason: string): void => { errors.push(`event[${index}]:${reason}`) }
    if (ids.has(item.id)) error('duplicate-event-id')
    ids.add(item.id)
    if (item.sequence !== index + 1) error('noncontiguous-sequence')
    if (item.previousHash !== previousHash || item.thisHash !== digest(item)) error('hash-chain-mismatch')
    if (Date.parse(item.occurredAt) < previousTime) error('backwards-time')
    if (binding && (item.projectId !== binding.projectId || item.artifactSha256 !== binding.artifactSha256)) error('cross-project-or-artifact')
    binding ??= { projectId: item.projectId, artifactSha256: item.artifactSha256 }
    const event = item.event
    if (event.kind === 'check') {
      if (checks.has(event.checkId)) error('duplicate-check-id')
      else checks.set(event.checkId, event.outcome)
    } else if (event.kind === 'issue-opened') {
      if (issues.has(event.issueId)) error('duplicate-issue-id')
      if (!checks.has(event.checkId) || checks.get(event.checkId) === 'passed') error('issue-without-nonpassing-check')
      if (!issues.has(event.issueId)) issues.set(event.issueId, { resolved: false })
    } else if (event.kind === 'correction-recorded') {
      const issue = issues.get(event.issueId)
      if (!issue || issue.resolved) error('correction-without-open-issue')
      if (corrections.has(event.correctionId)) error('duplicate-correction-id')
      if (event.correctedArtifactSha256 === item.artifactSha256) error('correction-with-unchanged-artifact')
      corrections.add(event.correctionId)
      if (issue && !issue.resolved) {
        issue.correctionId = event.correctionId
        issue.correctedArtifactSha256 = event.correctedArtifactSha256
      }
    } else {
      const issue = issues.get(event.issueId)
      if (!issue || issue.resolved || issue.correctionId !== event.correctionId
        || issue.correctedArtifactSha256 !== event.recheckedArtifactSha256) error('recheck-without-current-correction')
      else issue.resolved = event.outcome === 'resolved'
    }
    previousHash = item.thisHash
    previousTime = Date.parse(item.occurredAt)
  }
  if (checkpoint) {
    const parsed = SurveyQualityCheckpointV1.safeParse(checkpoint)
    if (!parsed.success) errors.push('invalid-checkpoint')
    else if (parsed.data.eventCount !== inputs.length || parsed.data.headHash !== previousHash
      || (binding && (parsed.data.projectId !== binding.projectId || parsed.data.artifactSha256 !== binding.artifactSha256))) {
      errors.push('checkpoint-mismatch')
    }
  }
  return { valid: errors.length === 0, errors, openIssueCount: [...issues.values()].filter(issue => !issue.resolved).length,
    recordedCheckCount: checks.size, standardConformity: 'not-evaluated', humanSignatureVerification: 'not-evaluated' }
}

/** Creates a new array; rejects broken history and invalid transitions before returning. */
export function appendSurveyQualityEvent(history: readonly QualityEvent[], input: Omit<QualityEvent, 'sequence' | 'previousHash' | 'thisHash'>): QualityEvent[] {
  if (!verifySurveyQualityRecord(history).valid) throw new Error('Invalid quality record history')
  const event = SurveyQualityEventV1.parse({ ...input, sequence: history.length + 1,
    previousHash: history.at(-1)?.thisHash ?? SURVEY_QUALITY_CHAIN_GENESIS, thisHash: SURVEY_QUALITY_CHAIN_GENESIS })
  event.thisHash = digest(event)
  const result = [...history.map(item => SurveyQualityEventV1.parse(item)), event]
  const verification = verifySurveyQualityRecord(result)
  if (!verification.valid) throw new Error(`Invalid quality event: ${verification.errors.join(', ')}`)
  return result
}
