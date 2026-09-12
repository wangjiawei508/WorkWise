import { describe, expect, it } from 'vitest'
import {
  CorrectionAlreadyAppliedError,
  EMPTY_CORRECTION_STATE,
  applyCorrection,
  cosaDmsToRadians,
  compactDmsToRadians,
  correctionStateBitmap,
  createCorrectionState,
  hasAppliedCorrection,
  parseCosaDms,
  parseCompactDms,
  toMetres,
  toRadians
} from './survey-units.js'

describe('survey canonical unit conversions', () => {
  it('converts every supported linear unit to metres', () => {
    expect(toMetres(1, 'm')).toBe(1)
    expect(toMetres(1, 'mm')).toBe(0.001)
    expect(toMetres(1, '0.1mm')).toBe(0.0001)
    expect(toMetres(1, '0.01mm')).toBe(0.00001)
    expect(toMetres(1, 'ft')).toBeCloseTo(0.3048, 15)
    expect(toMetres(-12.5, 'mm')).toBeCloseTo(-0.0125, 15)
    expect(() => toMetres(Number.POSITIVE_INFINITY, 'm')).toThrow(/finite/)
  })

  it('converts decimal degrees, gon, and explicit mil conventions to radians', () => {
    expect(toRadians({ unit: 'degree-decimal', value: 180 })).toBeCloseTo(Math.PI, 15)
    expect(toRadians({ unit: 'gon', value: 200 })).toBeCloseTo(Math.PI, 15)
    expect(toRadians({ unit: 'mil', value: 1_500, milsPerTurn: 6_000 })).toBeCloseTo(Math.PI / 2, 15)
    expect(toRadians({ unit: 'mil', value: 1_600, milsPerTurn: 6_400 })).toBeCloseTo(Math.PI / 2, 15)
  })

  it('preserves a valid 59.9995-second DMS component without carrying it', () => {
    const compact = 123_459.9995 // 12°34′59.9995″
    expect(parseCompactDms(compact)).toEqual({ sign: 1, degrees: 12, minutes: 34, seconds: expect.closeTo(59.9995, 12) })
    expect(compactDmsToRadians(compact)).toBeCloseTo((12 + 34 / 60 + 59.9995 / 3_600) * Math.PI / 180, 15)
    expect(compactDmsToRadians(-compact)).toBeCloseTo(-(12 + 34 / 60 + 59.9995 / 3_600) * Math.PI / 180, 15)
  })

  it('rejects invalid compact-DMS minute and second fields instead of normalizing them', () => {
    expect(() => parseCompactDms(123_460)).toThrow(/seconds must be in \[0, 60\)/)
    expect(() => parseCompactDms(126_000)).toThrow(/minutes must be in \[0, 60\)/)
    expect(() => parseCompactDms(Number.NaN)).toThrow(/finite/)
  })

  it('parses COSA degree-dot-MMSS source notation without losing lexical zeroes', () => {
    expect(parseCosaDms('115.59005')).toEqual({ sign: 1, degrees: 115, minutes: 59, seconds: 0.5 })
    expect(cosaDmsToRadians('115.59005')).toBeCloseTo((115 + 59 / 60 + 0.5 / 3_600) * Math.PI / 180, 15)
    expect(parseCosaDms('12.5959995')).toEqual({ sign: 1, degrees: 12, minutes: 59, seconds: 59.995 })
    expect(cosaDmsToRadians(12.5959995)).toBeCloseTo((12 + 59 / 60 + 59.995 / 3_600) * Math.PI / 180, 15)
    expect(parseCosaDms('-12.5959995')).toEqual({ sign: -1, degrees: 12, minutes: 59, seconds: 59.995 })
    expect(parseCosaDms('115.5900')).toEqual({ sign: 1, degrees: 115, minutes: 59, seconds: 0 })
  })

  it('rejects COSA DMS 60-second and 60-minute source fields without carrying', () => {
    expect(() => parseCosaDms('12.596000')).toThrow(/seconds must be in \[0, 60\)/)
    expect(() => parseCosaDms('12.600000')).toThrow(/minutes must be in \[0, 60\)/)
    expect(() => parseCosaDms('12.59')).toThrow(/invalid COSA DMS notation/)
  })
})

describe('CorrectionState', () => {
  it('is immutable, canonical, and records each named correction once', () => {
    const initial = EMPTY_CORRECTION_STATE
    const afterMeteorological = applyCorrection(initial, 'meteorological')
    const afterProjection = applyCorrection(afterMeteorological, 'projection-surface')

    expect(Object.isFrozen(initial)).toBe(true)
    expect(Object.isFrozen(initial.applied)).toBe(true)
    expect(afterMeteorological).not.toBe(initial)
    expect(correctionStateBitmap(initial)).toBe(0)
    expect(correctionStateBitmap(afterProjection)).toBe(1 | (1 << 5))
    expect(afterProjection.applied).toEqual(['meteorological', 'projection-surface'])
    expect(hasAppliedCorrection(afterProjection, 'meteorological')).toBe(true)
    expect(hasAppliedCorrection(afterProjection, 'prism')).toBe(false)
    expect(() => applyCorrection(afterProjection, 'meteorological')).toThrow(CorrectionAlreadyAppliedError)
  })

  it('rejects duplicate corrections during explicit state construction', () => {
    expect(() => createCorrectionState(['prism', 'prism'])).toThrow(CorrectionAlreadyAppliedError)
  })
})
