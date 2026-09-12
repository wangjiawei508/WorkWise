import { describe, expect, it } from 'vitest'
import { compareCosaPlaneCoordinatePrecision, compareCosaPlaneCoordinates, parseCosaOu2Coordinates } from './survey-cosa-ou2.js'

const table = [
  '概略坐标',
  '1 APPROX 999999.9999 888888.8888',
  '平差坐标及其精度',
  '------------------------------------------------------------------------------------------',
  '序号 点名 X(m) Y(m) MX(mm) MY(mm) MP(mm) E(mm) F(mm) T(dms)',
  '1 CTRL_A 1000.0000 2000.0000',
  '2 POINT_B 1010.12345 2020.54321 0.10 0.20 0.22 0.21 0.09 45.1234',
  '------------------------------------------------------------------------------------------',
  '最弱点及其精度'
].join('\n')

describe('COSA OU2 read-only adjusted-coordinate reference', () => {
  it('reads exactly the labelled table, including fixed rows, and preserves X/Y printed resolution', () => {
    const result = parseCosaOu2Coordinates(table)

    expect(result.state).toBe('valid')
    expect(result.points).toHaveLength(2)
    expect(result.points[0]).toMatchObject({
      id: 'CTRL_A',
      x: 1000,
      y: 2000,
      printedResolutionXMetres: 0.0001,
      printedResolutionYMetres: 0.0001,
      sourceLine: 6
    })
    expect(result.points[0]?.precision).toBeUndefined()
    expect(result.points[1]).toMatchObject({
      id: 'POINT_B',
      x: 1010.12345,
      y: 2020.54321,
      printedResolutionXMetres: 0.00001,
      printedResolutionYMetres: 0.00001,
      precision: { mxMm: 0.1, myMm: 0.2, mpMm: 0.22, eMm: 0.21, fMm: 0.09, tDms: 45.1234 }
    })
  })

  it('compares both a point array and an adjustment-result-shaped point collection', () => {
    const reference = parseCosaOu2Coordinates(table)
    const points = [
      { id: 'CTRL_A', x: 1000.000049, y: 1999.999951 },
      { id: 'POINT_B', x: 1010.1234549, y: 2020.5432051 }
    ]

    expect(compareCosaPlaneCoordinates(points, reference)).toMatchObject({
      status: 'matched',
      comparedPointCount: 2,
      mismatchCount: 0
    })
    expect(compareCosaPlaneCoordinates({ points }, reference)).toMatchObject({ status: 'matched' })
  })

  it('returns aggregate mismatches and the maximum planar coordinate difference', () => {
    const reference = parseCosaOu2Coordinates(table)
    const result = compareCosaPlaneCoordinates([
      { id: 'CTRL_A', x: 1000.00006, y: 2000.00008 },
      { id: 'POINT_B', x: 1010.12345, y: 2020.54321 }
    ], reference)

    expect(result).toMatchObject({ status: 'different', comparedPointCount: 2, mismatchCount: 1 })
    expect(result.maxPlanarCoordinateDifferenceMetres).toBeCloseTo(0.0001, 10)
    expect(result).not.toHaveProperty('mismatches')
  })

  it('keeps strict printed rounding visible while accepting independent coordinates inside their combined 1-sigma precision', () => {
    const reference = parseCosaOu2Coordinates(table)
    const result = compareCosaPlaneCoordinatePrecision([
      { id: 'CTRL_A', x: 1000.000049, y: 1999.999951 },
      { id: 'POINT_B', x: 1010.12355, y: 2020.54321, standardError: 0.0002 }
    ], reference)

    expect(result).toMatchObject({
      status: 'matched',
      comparedPointCount: 2,
      fixedPointCount: 1,
      precisionPointCount: 1,
      mismatchCount: 0,
      strictPrintedMismatchCount: 1,
      combinedNormalizedDifferenceLimitSigma: 1,
      referenceMaximumPointStdDevMm: 0.22,
      adjustedMaximumPointStdDevMm: 0.2
    })
    expect(result.maxCombinedNormalizedDifferenceSigma).toBeLessThan(1)
  })

  it('blocks fixed-point changes, precision differences outside 1 sigma, and missing adjusted precision', () => {
    const reference = parseCosaOu2Coordinates(table)

    expect(compareCosaPlaneCoordinatePrecision([
      { id: 'CTRL_A', x: 1000.0002, y: 2000 },
      { id: 'POINT_B', x: 1010.12345, y: 2020.54321, standardError: 0.0002 }
    ], reference)).toMatchObject({ status: 'different', mismatchCount: 1 })
    expect(compareCosaPlaneCoordinatePrecision([
      { id: 'CTRL_A', x: 1000, y: 2000 },
      { id: 'POINT_B', x: 1010.12445, y: 2020.54321, standardError: 0.0002 }
    ], reference)).toMatchObject({ status: 'different', mismatchCount: 1 })
    expect(compareCosaPlaneCoordinatePrecision([
      { id: 'CTRL_A', x: 1000, y: 2000 },
      { id: 'POINT_B', x: 1010.12345, y: 2020.54321 }
    ], reference)).toMatchObject({ status: 'blocked', reason: 'adjusted-point-precision-required' })
  })

  it.each([
    table + '\n' + table,
    table.replace('X(m)', 'X(ft)'),
    table.replace('MP(mm)', 'MP(cm)'),
    table.replace('2 POINT_B', '2 CTRL_A'),
    table.replace('2 POINT_B', '3 POINT_B'),
    table.replace('1010.12345', 'NaN'),
    table.replace('0.22 0.21', 'NaN 0.21'),
    table.replace('0.10 0.20 0.22 0.21 0.09 45.1234', '0.10 0.20'),
    table.slice(0, table.lastIndexOf('------------------------------------------------------------------------------------------'))
  ])('fails closed on ambiguous, malformed, unitless, or incomplete tables', (text) => {
    expect(parseCosaOu2Coordinates(text)).toMatchObject({ state: 'blocked', points: [] })
  })

  it('blocks malformed adjusted collections and non-identical point sets', () => {
    const reference = parseCosaOu2Coordinates(table)

    expect(compareCosaPlaneCoordinates([{ id: 'CTRL_A', x: 1000, y: 2000 }], reference)).toMatchObject({
      status: 'blocked',
      reason: 'reference-point-set-mismatch'
    })
    expect(compareCosaPlaneCoordinates([
      { id: 'CTRL_A', x: 1000, y: 2000 },
      { id: 'CTRL_A', x: 1010, y: 2020 }
    ], reference)).toMatchObject({ status: 'blocked', reason: 'invalid-adjusted-point-collection' })
    expect(compareCosaPlaneCoordinates([
      { id: 'CTRL_A', x: 1000, y: 2000 },
      { id: 'POINT_B', x: Number.NaN, y: 2020 }
    ], reference)).toMatchObject({ status: 'blocked', reason: 'invalid-adjusted-point-collection' })
    expect(compareCosaPlaneCoordinates([], parseCosaOu2Coordinates(''))).toMatchObject({ status: 'blocked', reason: 'invalid-reference' })
  })

  it('enforces bounded source lines before allocating a partial result', () => {
    const oversizedLine = 'x'.repeat(16_385)
    expect(parseCosaOu2Coordinates(`${table}\n${oversizedLine}`)).toMatchObject({
      state: 'blocked',
      points: [],
      reason: 'reference-resource-limit'
    })
  })
})
