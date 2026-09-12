import { describe, expect, it } from 'vitest'
import { EMPTY_SURVEY_CORRECTION_STATE, SurveyCorrectionStateV1, SurveyObservationV1 } from './survey.js'

describe('survey correction-state contract', () => {
  it('provides a complete false-only source ledger when no correction is evidenced', () => {
    expect(SurveyCorrectionStateV1.parse({})).toEqual(EMPTY_SURVEY_CORRECTION_STATE)
    expect(Object.isFrozen(EMPTY_SURVEY_CORRECTION_STATE)).toBe(true)
  })

  it('keeps all planned correction dimensions explicit and rejects untracked state', () => {
    const state = SurveyCorrectionStateV1.parse({ ppmApplied: true, prismConstantApplied: true })
    expect(state).toMatchObject({ ppmApplied: true, prismConstantApplied: true, meteoApplied: false, projectionReductionApplied: false })
    expect(SurveyCorrectionStateV1.safeParse({ unexpectedCorrection: true }).success).toBe(false)
  })

  it('carries a source correction ledger with an observation without making legacy records unreadable', () => {
    const current = SurveyObservationV1.parse({
      id: 'gsi-distance', type: 'slope-distance', value: 12.5, unit: 'm',
      correctionState: { ppmApplied: true, prismConstantApplied: true }
    })
    expect(current.correctionState).toMatchObject({ ppmApplied: true, prismConstantApplied: true, meteoApplied: false })

    const legacy = SurveyObservationV1.parse({ id: 'legacy-distance', type: 'distance', value: 1, unit: 'm' })
    expect(legacy.correctionState).toBeUndefined()
  })
})
