import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getSurveyStandardBasisCatalog, resolveSurveyStandardBasis, surveyStandardBasisDigest } from './survey-standard-basis.js'
import { SurveyStandardBasisCatalogV1, SurveyStandardBasisResolvedV1, type SurveyStandardBasisReferenceV1 } from '../contracts/survey-standard-basis.js'
import { QUALITY_PROFILE_VERSION } from '../contracts/survey-quality-scoring.js'
import { createQualitySamplingPlan, qualitySamplingPopulationHash } from './survey-quality-sampling.js'
import { scoreSurveyQualityV1 } from './survey-quality-scoring.js'
import { qualityScoringTestRequest } from './survey-quality-scoring-test-helpers.js'

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
function references(): SurveyStandardBasisReferenceV1[] {
  return getSurveyStandardBasisCatalog().rules.flatMap(({ rule }) => rule.profiles.map(profile => ({
    standardCode: rule.standardCode, standardVersion: rule.standardVersion, ruleId: rule.ruleId, ruleVersion: rule.ruleVersion,
    sourceSha256: rule.source.sha256, algorithmVersion: rule.executor.algorithmVersion, profileId: profile.profileId, profileVersion: profile.profileVersion
  })))
}
describe('immutable, limited standard basis catalog', () => {
  it('resolves every exact binding without claiming trust or professional acceptance', () => {
    const catalog = SurveyStandardBasisCatalogV1.parse(getSurveyStandardBasisCatalog())
    expect(catalog.rules).toHaveLength(9)
    expect(catalog.catalogDigest).toBe('fdd63562eca13a7fd7ae0f6827b0c249f0c7c3342b96ad57ee4eff73b2bf76c3')
    expect(references()).toHaveLength(16)
    expect(catalog.catalogDigest).toBe(digest(JSON.stringify(catalog.rules.map(entry => entry.ruleDigest))))
    for (const reference of references()) {
      const resolved = SurveyStandardBasisResolvedV1.parse(resolveSurveyStandardBasis(reference))
      expect(resolved.status).toBe('resolved-basis-only')
      expect(resolved.reference).toEqual(reference)
      expect(resolved.entry.ruleDigest).toBe(surveyStandardBasisDigest(resolved.entry.rule))
      expect(resolved.entry.rule).toMatchObject({ reviewIdentity: 'agent-reviewed-not-professional-signoff', standardConformity: 'not-evaluated',
        humanSignatureVerification: 'not-evaluated', projectApplicability: 'not-evaluated', formalResultsModified: false })
      expect(resolved.entry.rule).not.toHaveProperty('trusted')
      expect(resolved.entry.rule).not.toHaveProperty('assertion')
    }
  })
  it.each([
    [{ ruleVersion: 'latest' }, 'exact-rule-version-unavailable'], [{ ruleVersion: '2' }, 'exact-rule-version-unavailable'],
    [{ ruleId: 'gbt24356-2023.unimplemented-clause-4.3.4' }, 'exact-rule-version-unavailable'],
    [{ standardVersion: '2009' }, 'standard-version-mismatch'], [{ standardCode: 'GB/T 24356-2009' }, 'standard-version-mismatch'],
    [{ sourceSha256: 'a'.repeat(64) }, 'source-mismatch'], [{ algorithmVersion: 'future-2' }, 'algorithm-mismatch'],
    [{ profileId: 'deformation-survey' }, 'profile-not-covered'], [{ profileVersion: 'latest' }, 'profile-version-mismatch'],
    [{ approved: true }, 'validation'], [{ sourceSha256: '../private/source' }, 'validation']
  ])('rejects unsupported or conflicting identity %j', (change, reason) => {
    expect(() => resolveSurveyStandardBasis({ ...references()[0], ...change })).toThrow(reason)
  })
  it('preserves exact source evidence files, scanned page offsets and reviewed profile tables', () => {
    const catalog = getSurveyStandardBasisCatalog()
    for (const evidence of catalog.rules[0]!.rule.source.evidenceDocuments) {
      const path = fileURLToPath(new URL(`../../../${evidence.path}`, import.meta.url))
      expect(digest(readFileSync(path))).toBe(evidence.sha256)
    }
    for (const { rule } of catalog.rules) {
      expect(rule.source.officialUrl).toContain('/P020230829590929227708.pdf')
      for (const locator of [...rule.locators, ...rule.profiles.flatMap(profile => profile.locators)]) {
        expect(locator.pdfPages).toEqual(locator.printedPages.map(page => page + 3))
        expect(locator.description.zh).toBeTruthy(); expect(locator.description.en).toBeTruthy()
      }
      if (rule.executor.family === 'declared-scoring') {
        expect(rule.profiles.map(profile => profile.locators[0]!.tables)).toEqual([[43, 44], [45, 46]])
        expect(rule.profiles.map(profile => profile.profileVersion)).toEqual([QUALITY_PROFILE_VERSION, QUALITY_PROFILE_VERSION])
      }
    }
  })
  it('returns detached data and detects declaration changes without changing stored catalog', () => {
    const before = getSurveyStandardBasisCatalog()
    const changed = getSurveyStandardBasisCatalog()
    changed.rules[0]!.rule.title.zh = 'changed rule'
    changed.rules[0]!.rule.source.evidenceDocuments[0]!.sha256 = 'a'.repeat(64)
    expect(surveyStandardBasisDigest(changed.rules[0]!.rule)).not.toBe(before.rules[0]!.ruleDigest)
    expect(getSurveyStandardBasisCatalog()).toEqual(before)
    const detail = resolveSurveyStandardBasis(references()[0])
    detail.profile.locators[0]!.clauses.length = 0
    expect(resolveSurveyStandardBasis(references()[0]).profile.locators[0]!.clauses.length).toBeGreaterThan(0)
  })
  it('matches existing executor identities without modifying historical sampling or scores', () => {
    const ids = ['unit-a', 'unit-b', 'unit-c', 'unit-d']
    const plan = createQualitySamplingPlan({ schemaVersion: 1, projectId: 'project', populationId: 'population', productType: 'control', unitProductType: 'point',
      definitionEvidenceSha256: 'a'.repeat(64), orderedUnitProductIds: ids, populationHash: qualitySamplingPopulationHash(ids), stage: 'final-office', inspectionMode: 'census', round: 1 })
    const scoring = scoreSurveyQualityV1(JSON.parse(qualityScoringTestRequest('unit').declarationJson))
    const before = JSON.stringify({ plan, scoring })
    const samplingRef = references().find(ref => ref.profileId === 'census')!
    expect(samplingRef.algorithmVersion).toBe(plan.algorithmVersion)
    expect(samplingRef.sourceSha256).toBe(plan.source.sourceSha256)
    const scoringRef = references().find(ref => ref.ruleId.endsWith('.scoring.unit') && ref.profileId === scoring.request!.productProfileId)!
    expect(scoringRef.algorithmVersion).toBe(scoring.algorithmVersion)
    expect(scoringRef.sourceSha256).toBe(scoring.source.sha256)
    expect(scoringRef.profileVersion).toBe(scoring.request!.productProfileVersion)
    resolveSurveyStandardBasis(samplingRef); resolveSurveyStandardBasis(scoringRef)
    expect(JSON.stringify({ plan, scoring })).toBe(before)
    expect(plan).not.toHaveProperty('ruleVersion')
    expect(scoring).not.toHaveProperty('ruleVersion')
  })
})
