import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SurveyStandardRegistry, surveyStandardRuleDigest, type SurveyStandardTrust } from './survey-standard-registry.js'
import type { SurveyRuleContextV1, SurveyStandardRuleV1 } from '../contracts/survey-standard-quality.js'

// Deliberately fictional rule. No number in this fixture is a normative survey limit.
const bytes = Buffer.from('Synthetic test standard: absolute sample value <= 7 test-units.')
const hash = (input: Uint8Array) => createHash('sha256').update(input).digest('hex')
function rule(): SurveyStandardRuleV1 {
  return { schemaVersion: 1, standardCode: 'TEST-ONLY', standardVersion: '2026', ruleId: 'sample-limit', ruleVersion: '1',
    locator: { clause: 'fixture-1', table: 'fixture-table' },
    source: { url: 'https://example.test/test-only', retrievedAt: '2026-09-19T00:00:00Z', kind: 'full-text',
      sha256: hash(bytes), excerpt: { byteOffset: 0, byteLength: bytes.length, sha256: hash(bytes) } },
    scope: { taskTypes: ['test-network'], grades: ['test-grade'], jurisdictions: ['test-region'] },
    effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: '2027-01-01T00:00:00Z',
    assertion: { metric: 'test-error', unit: 'test-units', operator: 'abs-lte', threshold: 7 } }
}
function context(): SurveyRuleContextV1 {
  return { taskType: 'test-network', grade: 'test-grade', jurisdiction: 'test-region', at: '2026-09-19T00:00:00Z',
    metric: 'test-error', unit: 'test-units', value: -7 }
}
function trust(rules: SurveyStandardRuleV1[] = [rule()]): SurveyStandardTrust {
  return { fullTextSha256: new Set([hash(bytes)]), reviewedRuleDigests: new Set(rules.map(surveyStandardRuleDigest)), readSource: () => bytes }
}

describe('versioned standard rule registry', () => {
  it('evaluates a reviewed predicate at the equality boundary without claiming overall conformity', () => {
    const registry = new SurveyStandardRegistry([rule()], trust())
    expect(registry.evaluate(rule(), context())).toMatchObject({ outcome: 'passed', standardConformity: 'not-evaluated' })
    expect(registry.evaluate(rule(), { ...context(), value: -7.001 }).outcome).toBe('failed')
  })

  it.each(['lte', 'gte'] as const)('evaluates the %s operator', operator => {
    const r = rule(); r.assertion!.operator = operator
    const registry = new SurveyStandardRegistry([r], trust([r]))
    expect(registry.evaluate(r, { ...context(), value: 7 }).outcome).toBe('passed')
    expect(registry.evaluate(r, { ...context(), value: operator === 'lte' ? 8 : 6 }).outcome).toBe('failed')
  })

  it('never substitutes standard or rule versions', () => {
    const registry = new SurveyStandardRegistry([rule()], trust())
    expect(registry.evaluate({ ...rule(), standardVersion: '2025' }, context()).reason).toBe('exact-rule-version-unavailable')
    expect(registry.evaluate({ ...rule(), ruleVersion: '2' }, context()).reason).toBe('exact-rule-version-unavailable')
  })

  it('isolates incompatible standard editions and rejects duplicate exact versions', () => {
    const other = rule(); other.standardVersion = '2025'; other.assertion!.threshold = 3
    const registry = new SurveyStandardRegistry([rule(), other], trust([rule(), other]))
    expect(registry.evaluate(rule(), context()).outcome).toBe('passed')
    expect(registry.evaluate(other, context()).outcome).toBe('failed')
    expect(() => new SurveyStandardRegistry([rule(), rule()], trust())).toThrow('Duplicate')
  })

  it('cannot promote official metadata to an executable rule even if it contains a threshold', () => {
    const r = rule(); r.source.kind = 'official-metadata'; delete r.locator
    let reads = 0
    const registry = new SurveyStandardRegistry([r], { ...trust([r]), readSource: () => { reads++; return bytes } })
    expect(registry.evaluate(r, context()).reason).toBe('metadata-only')
    expect(reads).toBe(0)
  })

  it('requires scope, exact units, metric and a half-open effective period', () => {
    const registry = new SurveyStandardRegistry([rule()], trust())
    for (const update of [{ grade: 'other' }, { jurisdiction: 'other' }, { taskType: 'other' },
      { at: '2025-12-31T23:59:59Z' }, { at: '2027-01-01T08:00:00+08:00' }]) {
      expect(registry.evaluate(rule(), { ...context(), ...update }).outcome).toBe('not-evaluated')
    }
    expect(registry.evaluate(rule(), { ...context(), at: '2026-01-01T00:00:00Z' }).outcome).toBe('passed')
    expect(registry.evaluate(rule(), { ...context(), unit: 'mm' }).reason).toBe('metric-or-unit-mismatch')
    expect(registry.evaluate(rule(), { ...context(), metric: 'other' }).reason).toBe('metric-or-unit-mismatch')
  })

  it('fails closed when source, full-text approval or exact rule approval is absent', () => {
    expect(new SurveyStandardRegistry([rule()], { ...trust(), fullTextSha256: new Set() })
      .evaluate(rule(), context()).reason).toBe('source-not-independently-trusted')
    expect(new SurveyStandardRegistry([rule()], { ...trust(), reviewedRuleDigests: new Set() })
      .evaluate(rule(), context()).reason).toBe('exact-rule-not-reviewed')
    for (const readSource of [() => undefined, () => { throw new Error('PRIVATE path') }]) {
      const result = new SurveyStandardRegistry([rule()], { ...trust(), readSource }).evaluate(rule(), context())
      expect(result.reason).toBe('source-unavailable')
      expect(JSON.stringify(result)).not.toContain('PRIVATE')
    }
    const r = rule(); delete r.source.excerpt
    expect(new SurveyStandardRegistry([r], trust([r])).evaluate(r, context()).reason).toBe('source-or-clause-evidence-missing')
    const noLocator = rule(); delete noLocator.locator
    expect(new SurveyStandardRegistry([noLocator], trust([noLocator])).evaluate(noLocator, context()).reason).toBe('source-or-clause-evidence-missing')
  })

  it('verifies the full bytes and bounded clause byte range independently', () => {
    expect(new SurveyStandardRegistry([rule()], { ...trust(), readSource: () => Buffer.from('tampered') })
      .evaluate(rule(), context()).reason).toBe('source-hash-mismatch')
    const r = rule(); r.source.excerpt!.byteOffset = bytes.length
    expect(new SurveyStandardRegistry([r], trust([r])).evaluate(r, context()).reason).toBe('clause-evidence-out-of-range')
    r.source.excerpt!.byteOffset = 0; r.source.excerpt!.sha256 = '1'.repeat(64)
    expect(new SurveyStandardRegistry([r], trust([r])).evaluate(r, context()).reason).toBe('clause-hash-mismatch')
  })

  it('refuses conflicting applicable rules without choosing a preferred threshold', () => {
    const other = rule(); other.ruleId = 'second-rule'; other.assertion!.threshold = 9
    const registry = new SurveyStandardRegistry([rule(), other], trust([rule(), other]))
    expect(registry.evaluate(rule(), context()).reason).toBe('conflicting-applicable-rules')
    expect(registry.evaluate(other, context()).reason).toBe('conflicting-applicable-rules')
  })

  it('does not let callers mutate a registration or trust set after construction', () => {
    const r = rule(); const t = trust([r]); const registry = new SurveyStandardRegistry([r], t)
    r.assertion!.threshold = 0
    ;(t.reviewedRuleDigests as Set<string>).clear()
    expect(registry.evaluate(rule(), context()).outcome).toBe('passed')
  })

  it('invalidates review when the exact rule changes and rejects invalid numeric inputs', () => {
    const r = rule(); r.assertion!.threshold = 8
    expect(new SurveyStandardRegistry([r], trust()).evaluate(r, context()).reason).toBe('exact-rule-not-reviewed')
    expect(() => new SurveyStandardRegistry([rule()], trust()).evaluate(rule(), { ...context(), value: NaN })).toThrow()
  })
})
