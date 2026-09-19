import { createHash } from 'node:crypto'
import {
  SurveyRuleContextV1, SurveyStandardRuleRefV1, SurveyStandardRuleV1,
  type SurveyRuleContextV1 as Context, type SurveyStandardRuleRefV1 as RuleRef,
  type SurveyStandardRuleV1 as Rule
} from '../contracts/survey-standard-quality.js'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function surveyStandardRuleDigest(input: Rule): string {
  return createHash('sha256').update(canonical(SurveyStandardRuleV1.parse(input))).digest('hex')
}

function key(rule: RuleRef): string {
  return JSON.stringify([rule.standardCode, rule.standardVersion, rule.ruleId, rule.ruleVersion])
}

function applicable(rule: Rule, context: Context): boolean {
  const at = Date.parse(context.at)
  return rule.scope.taskTypes.includes(context.taskType) && rule.scope.grades.includes(context.grade)
    && rule.scope.jurisdictions.includes(context.jurisdiction)
    && (!rule.effectiveFrom || at >= Date.parse(rule.effectiveFrom))
    && (!rule.effectiveUntil || at < Date.parse(rule.effectiveUntil))
}

export type SurveyStandardRuleEvaluation = {
  rule: RuleRef
  outcome: 'passed' | 'failed' | 'not-evaluated'
  reason: string
  ruleDigest?: string
  /** Evaluating one predicate cannot establish compliance with an entire standard. */
  standardConformity: 'not-evaluated'
}

export type SurveyStandardTrust = {
  /** Supplied by a trusted, independent source/license verification boundary. */
  fullTextSha256: ReadonlySet<string>
  /** Digests of exact rules reviewed against their full-text clauses, not source URLs. */
  reviewedRuleDigests: ReadonlySet<string>
  readSource: (sha256: string) => Uint8Array | undefined
}

/** No built-in thresholds, auto-upgrade, network requests, or wildcard scope matching. */
export class SurveyStandardRegistry {
  private readonly rules: Map<string, Rule>
  private readonly fullTextSha256: Set<string>
  private readonly reviewedRuleDigests: Set<string>
  private readonly readSource: SurveyStandardTrust['readSource']

  constructor(inputs: readonly Rule[], trust: SurveyStandardTrust) {
    this.rules = new Map()
    for (const input of inputs) {
      const rule = SurveyStandardRuleV1.parse(input)
      if (this.rules.has(key(rule))) throw new Error('Duplicate exact standard rule version')
      this.rules.set(key(rule), rule)
    }
    this.fullTextSha256 = new Set(trust.fullTextSha256)
    this.reviewedRuleDigests = new Set(trust.reviewedRuleDigests)
    this.readSource = trust.readSource
  }

  evaluate(reference: RuleRef, input: Context): SurveyStandardRuleEvaluation {
    const ref = SurveyStandardRuleRefV1.parse({ standardCode: reference.standardCode,
      standardVersion: reference.standardVersion, ruleId: reference.ruleId, ruleVersion: reference.ruleVersion })
    const context = SurveyRuleContextV1.parse(input)
    const rule = this.rules.get(key(ref))
    const result = (outcome: SurveyStandardRuleEvaluation['outcome'], reason: string): SurveyStandardRuleEvaluation => ({
      rule: ref, outcome, reason, standardConformity: 'not-evaluated',
      ...(rule ? { ruleDigest: surveyStandardRuleDigest(rule) } : {})
    })
    if (!rule) return result('not-evaluated', 'exact-rule-version-unavailable')
    if (!applicable(rule, context)) return result('not-evaluated', 'outside-rule-scope-or-effective-period')
    if (!rule.assertion || rule.source.kind !== 'full-text') return result('not-evaluated', 'metadata-only')
    const assertion = rule.assertion
    if (assertion.metric !== context.metric || assertion.unit !== context.unit) return result('not-evaluated', 'metric-or-unit-mismatch')
    const hash = rule.source.sha256
    const excerpt = rule.source.excerpt
    if (!hash || !excerpt || !rule.locator) return result('not-evaluated', 'source-or-clause-evidence-missing')
    if (!this.fullTextSha256.has(hash)) return result('not-evaluated', 'source-not-independently-trusted')
    if (!this.reviewedRuleDigests.has(surveyStandardRuleDigest(rule))) return result('not-evaluated', 'exact-rule-not-reviewed')
    let bytes: Uint8Array | undefined
    try {
      const source = this.readSource(hash)
      if (source) bytes = Uint8Array.from(source)
    } catch { return result('not-evaluated', 'source-unavailable') }
    if (!bytes) return result('not-evaluated', 'source-unavailable')
    if (createHash('sha256').update(bytes).digest('hex') !== hash) return result('not-evaluated', 'source-hash-mismatch')
    if (excerpt.byteOffset > bytes.byteLength || excerpt.byteLength > bytes.byteLength - excerpt.byteOffset) {
      return result('not-evaluated', 'clause-evidence-out-of-range')
    }
    if (createHash('sha256').update(bytes.subarray(excerpt.byteOffset, excerpt.byteOffset + excerpt.byteLength)).digest('hex') !== excerpt.sha256) {
      return result('not-evaluated', 'clause-hash-mismatch')
    }
    // Never silently pick a looser/stricter candidate when overlapping registrations disagree.
    const conflict = [...this.rules.values()].some(other => other !== rule
      && other.standardCode === rule.standardCode && other.standardVersion === rule.standardVersion
      && applicable(other, context) && other.assertion?.metric === assertion.metric
      && (other.assertion.unit !== assertion.unit || other.assertion.operator !== assertion.operator
        || other.assertion.threshold !== assertion.threshold))
    if (conflict) return result('not-evaluated', 'conflicting-applicable-rules')
    const observed = assertion.operator === 'abs-lte' ? Math.abs(context.value) : context.value
    const passed = assertion.operator === 'gte' ? observed >= assertion.threshold : observed <= assertion.threshold
    return result(passed ? 'passed' : 'failed', 'exact-reviewed-predicate-evaluated')
  }
}
