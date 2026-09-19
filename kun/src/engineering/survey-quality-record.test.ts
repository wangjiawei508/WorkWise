import { describe, expect, it } from 'vitest'
import type { SurveyQualityEventV1 } from '../contracts/survey-standard-quality.js'
import { appendSurveyQualityEvent, verifySurveyQualityRecord } from './survey-quality-record.js'

type Input = Omit<SurveyQualityEventV1, 'sequence' | 'previousHash' | 'thisHash'>
const sha = '1'.repeat(64)
const corrected = '2'.repeat(64)
function input(id: string, event: Input['event'], updates: Partial<Input> = {}): Input {
  return { schemaVersion: 1, id, projectId: 'test-project', artifactSha256: sha,
    occurredAt: '2026-09-19T00:00:00Z', actor: { id: 'test-agent', kind: 'agent' },
    stage: 'local-project-review', event, ...updates }
}
function failingCheck() {
  return appendSurveyQualityEvent([], input('event-1', {
    kind: 'check', checkId: 'check-1', outcome: 'failed', evidenceSha256: sha
  }))
}
function opened() {
  return appendSurveyQualityEvent(failingCheck(), input('event-2', {
    kind: 'issue-opened', issueId: 'issue-1', checkId: 'check-1', evidenceSha256: sha
  }))
}
function correction() {
  return appendSurveyQualityEvent(opened(), input('event-3', {
    kind: 'correction-recorded', issueId: 'issue-1', correctionId: 'correction-1', correctedArtifactSha256: corrected,
    evidenceSha256: sha
  }))
}
function recheck(updates: Partial<Extract<Input['event'], { kind: 'issue-rechecked' }>> = {}) {
  return input('event-4', { kind: 'issue-rechecked', issueId: 'issue-1', correctionId: 'correction-1',
    recheckedArtifactSha256: corrected, outcome: 'resolved', evidenceSha256: sha, ...updates })
}

describe('survey quality record integrity', () => {
  it('records a correction and exact-artifact recheck without claiming standards compliance or human signature', () => {
    const original = correction(); const snapshot = JSON.stringify(original)
    const result = appendSurveyQualityEvent(original, recheck())
    expect(verifySurveyQualityRecord(result)).toEqual({ valid: true, errors: [], openIssueCount: 0,
      recordedCheckCount: 1, standardConformity: 'not-evaluated', humanSignatureVerification: 'not-evaluated' })
    expect(JSON.stringify(original)).toBe(snapshot)
    result[0]!.actor.id = 'mutated'
    expect(original[0]!.actor.id).toBe('test-agent')
  })

  it('keeps unresolved issues open and rejects rechecking an absent or superseded correction', () => {
    expect(verifySurveyQualityRecord(appendSurveyQualityEvent(correction(), recheck({ outcome: 'unresolved' }))).openIssueCount).toBe(1)
    expect(() => appendSurveyQualityEvent(opened(), recheck())).toThrow('recheck-without-current-correction')
    expect(() => appendSurveyQualityEvent(correction(), recheck({ correctionId: 'old' }))).toThrow('recheck-without-current-correction')
    expect(() => appendSurveyQualityEvent(correction(), recheck({ recheckedArtifactSha256: sha }))).toThrow('recheck-without-current-correction')
  })

  it('never permits unchanged-artifact corrections or a second closure', () => {
    expect(() => appendSurveyQualityEvent(opened(), input('event-3', {
      kind: 'correction-recorded', issueId: 'issue-1', correctionId: 'correction-1', correctedArtifactSha256: sha,
      evidenceSha256: sha
    }))).toThrow('correction-with-unchanged-artifact')
    const closed = appendSurveyQualityEvent(correction(), recheck())
    expect(() => appendSurveyQualityEvent(closed, { ...recheck(), id: 'event-5' })).toThrow('recheck-without-current-correction')
  })

  it('detects tampering, reordering, deletion and invalid schema without leaking evidence values', () => {
    const history = correction()
    const tampered = structuredClone(history); tampered[0]!.actor.id = 'PRIVATE'
    const report = verifySurveyQualityRecord(tampered)
    expect(report.valid).toBe(false)
    expect(JSON.stringify(report)).not.toContain('PRIVATE')
    expect(verifySurveyQualityRecord([...history].reverse()).valid).toBe(false)
    expect(verifySurveyQualityRecord(history.slice(1)).valid).toBe(false)
    expect(verifySurveyQualityRecord([{ private: 'PRIVATE' }]).errors).toEqual(['event[0]:invalid-schema'])
    expect(() => appendSurveyQualityEvent(tampered, recheck())).toThrow('Invalid quality record history')
  })

  it('rejects duplicate identifiers, cross-project/artifact binding and backwards times', () => {
    const next = input('event-2', { kind: 'check', checkId: 'check-2', outcome: 'not-evaluated', evidenceSha256: sha })
    for (const updates of [{ id: 'event-1' }, { projectId: 'other' }, { artifactSha256: corrected },
      { occurredAt: '2026-09-18T23:59:59Z' }]) {
      expect(() => appendSurveyQualityEvent(failingCheck(), { ...next, ...updates })).toThrow('Invalid quality event')
    }
    expect(() => appendSurveyQualityEvent(failingCheck(), input('event-2', {
      kind: 'check', checkId: 'check-1', outcome: 'failed', evidenceSha256: sha
    }))).toThrow('duplicate-check-id')
  })

  it('requires a prior nonpassing check before opening an issue', () => {
    const event = input('event-2', { kind: 'issue-opened', issueId: 'issue-1', checkId: 'absent', evidenceSha256: sha })
    expect(() => appendSurveyQualityEvent(failingCheck(), event)).toThrow('issue-without-nonpassing-check')
    const passed = appendSurveyQualityEvent([], input('event-1', { kind: 'check', checkId: 'passed', outcome: 'passed', evidenceSha256: sha }))
    expect(() => appendSurveyQualityEvent(passed, { ...event, event: { ...event.event, checkId: 'passed' } } as Input)).toThrow('issue-without-nonpassing-check')
  })

  it('accepts timezone-equivalent event times and keeps an empty record unevaluated', () => {
    const record = appendSurveyQualityEvent(failingCheck(), input('event-2', {
      kind: 'check', checkId: 'check-2', outcome: 'not-evaluated', evidenceSha256: sha
    }, { occurredAt: '2026-09-19T08:00:00+08:00' }))
    expect(verifySurveyQualityRecord(record).valid).toBe(true)
    expect(verifySurveyQualityRecord([])).toMatchObject({ valid: true, recordedCheckCount: 0, standardConformity: 'not-evaluated' })
  })

  it('detects tail truncation and substituted project records against an independent checkpoint', () => {
    const history = correction()
    const checkpoint = { projectId: 'test-project', artifactSha256: sha,
      eventCount: history.length, headHash: history.at(-1)!.thisHash }
    expect(verifySurveyQualityRecord(history, checkpoint).valid).toBe(true)
    expect(verifySurveyQualityRecord(history.slice(0, -1), checkpoint).errors).toContain('checkpoint-mismatch')
    expect(verifySurveyQualityRecord(history, { ...checkpoint, projectId: 'other' }).errors).toContain('checkpoint-mismatch')
    expect(verifySurveyQualityRecord([], checkpoint).errors).toContain('checkpoint-mismatch')
  })
})
