import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SURVEY_FIXTURE_EVIDENCE } from './survey-fixture-manifest.js'

const EXPECTED_STRATEGIES = [
  'leveling',
  'height-control',
  'traverse',
  'plane-control',
  'triangulation',
  'cpiii-free-station',
  'cpiii-resection',
  'gnss',
  'similarity-2d',
  'helmert-7',
  'gauss-kruger-forward',
  'gauss-kruger-inverse',
  'height-fit',
  'deformation-epoch-comparison'
]

describe('survey strategy fixture evidence', () => {
  it('maps every supported strategy to separate golden, negative and reference evidence', async () => {
    expect(SURVEY_FIXTURE_EVIDENCE.map((entry) => entry.strategyId).sort()).toEqual(EXPECTED_STRATEGIES.sort())
    expect(new Set(SURVEY_FIXTURE_EVIDENCE.map((entry) => entry.goldenCaseId)).size).toBe(SURVEY_FIXTURE_EVIDENCE.length)
    expect(new Set(SURVEY_FIXTURE_EVIDENCE.map((entry) => entry.negativeCaseId)).size).toBe(SURVEY_FIXTURE_EVIDENCE.length)
    expect(new Set(SURVEY_FIXTURE_EVIDENCE.map((entry) => entry.referenceId)).size).toBe(SURVEY_FIXTURE_EVIDENCE.length)

    const reference = await readFile(new URL('./fixtures/survey/REFERENCE_CALCULATIONS.md', import.meta.url), 'utf8')
    for (const entry of SURVEY_FIXTURE_EVIDENCE) {
      const source = await readFile(new URL(`./${entry.testFile}`, import.meta.url), 'utf8')
      expect(source, `${entry.strategyId} golden fixture`).toContain(entry.goldenCaseId)
      expect(source, `${entry.strategyId} negative fixture`).toContain(entry.negativeCaseId)
      expect(reference, `${entry.strategyId} approved reference`).toContain(`## ${entry.referenceId}`)
      expect(reference, `${entry.strategyId} golden reference link`).toContain(entry.goldenCaseId)
      expect(reference, `${entry.strategyId} negative reference link`).toContain(entry.negativeCaseId)
    }
  })
})
