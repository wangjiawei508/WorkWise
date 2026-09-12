import { describe, expect, it } from 'vitest'
import { selectSurveyClosureKey } from './survey-summary'

describe('survey summary closure metric selection', () => {
  it('uses height closure for leveling even when another field is serialized first', () => {
    expect(selectSurveyClosureKey('leveling', { horizontal: 9, heightDifference: 0.001 })).toBe('heightDifference')
  })

  it('uses relative closure for traverse and baseline norm for GNSS', () => {
    expect(selectSurveyClosureKey('traverse', { horizontal: 0.2, relativeClosure: 0.0001 })).toBe('relativeClosure')
    expect(selectSurveyClosureKey('gnss', { baselineX: 0.01, baseline: 0.02 })).toBe('baseline')
  })

  it('falls back to a finite generic metric for legacy or unknown network types', () => {
    expect(selectSurveyClosureKey('legacy', { angular: Number.NaN, vertical: 0.003 })).toBe('vertical')
    expect(selectSurveyClosureKey(undefined, undefined)).toBeUndefined()
  })
})
