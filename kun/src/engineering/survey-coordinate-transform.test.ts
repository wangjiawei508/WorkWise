import { describe, expect, it } from 'vitest'
import { applyHeightPlane, applyHelmert7, applySimilarity2d, fitHeightPlane, fitHelmert7, fitSimilarity2d, gaussKrugerForward, gaussKrugerInverse, resolveEllipsoid } from './survey-coordinate-transform.js'

describe('coordinate transformation strategies', () => {
  it('SURVEY-GOLDEN-SIMILARITY-2D-001 fits and applies a four-parameter 2-D similarity transform', () => {
    const fitted = fitSimilarity2d([
      { sourceX: 0, sourceY: 0, targetX: 5, targetY: 7, sigma: 0.001 },
      { sourceX: 100, sourceY: 0, targetX: 105, targetY: 7, sigma: 0.001 },
      { sourceX: 0, sourceY: 100, targetX: 5, targetY: 107, sigma: 0.001 }
    ])
    expect(fitted?.parameters).toMatchObject({ tx: expect.closeTo(5, 10), ty: expect.closeTo(7, 10), scale: expect.closeTo(1, 10), rotation: expect.closeTo(0, 10) })
    expect(applySimilarity2d(10, 20, fitted!.parameters)).toEqual({ x: expect.closeTo(15, 10), y: expect.closeTo(27, 10) })
  })

  it('SURVEY-NEG-SIMILARITY-2D-001 rejects an underdetermined four-parameter transform', () => {
    expect(fitSimilarity2d([{ sourceX: 0, sourceY: 0, targetX: 1, targetY: 2, sigma: 1 }])).toBeNull()
  })

  it('SURVEY-GOLDEN-HELMERT-7-001 fits and applies a seven-parameter 3-D Helmert transform', () => {
    const controls = [
      { sourceX: 1000, sourceY: 2000, sourceZ: 3000, targetX: 1000.99, targetY: 1998.004, targetZ: 3003.01, sigma: 0.001 },
      { sourceX: 1100, sourceY: 2000, sourceZ: 3000, targetX: 1100.9902, targetY: 1998.0043, targetZ: 3003.0102, sigma: 0.001 },
      { sourceX: 1000, sourceY: 2100, sourceZ: 3050, targetX: 1000.9896, targetY: 2098.00415, targetZ: 3053.0102, sigma: 0.001 },
      { sourceX: 1050, sourceY: 2070, sourceZ: 3100, targetX: 1050.98969, targetY: 2068.00419, targetZ: 3103.01037, sigma: 0.001 }
    ]
    const fitted = fitHelmert7(controls)
    expect(fitted?.parameters).toMatchObject({ tx: expect.closeTo(1, 7), ty: expect.closeTo(-2, 7), tz: expect.closeTo(3, 7), scale: expect.closeTo(1.000002, 10), rx: expect.closeTo(1e-6, 10), ry: expect.closeTo(-2e-6, 10), rz: expect.closeTo(3e-6, 10) })
    expect(applyHelmert7(1000, 2000, 3000, fitted!.parameters)).toMatchObject({ x: expect.closeTo(1000.99, 7), y: expect.closeTo(1998.004, 7), z: expect.closeTo(3003.01, 7) })
  })

  it('SURVEY-NEG-HELMERT-7-001 rejects an underdetermined seven-parameter transform', () => {
    expect(fitHelmert7([
      { sourceX: 1000, sourceY: 2000, sourceZ: 3000, targetX: 1000.99, targetY: 1998.004, targetZ: 3003.01, sigma: 0.001 },
      { sourceX: 1100, sourceY: 2000, sourceZ: 3000, targetX: 1100.9902, targetY: 1998.0043, targetZ: 3003.0102, sigma: 0.001 }
    ])).toBeNull()
  })

  it('SURVEY-GOLDEN-HEIGHT-FIT-001 fits a non-degenerate height correction plane', () => {
    const controls = [
      { x: 0, y: 0, sourceHeight: 100, targetHeight: 100.5, sigma: 0.001 },
      { x: 100, y: 0, sourceHeight: 100, targetHeight: 100.6, sigma: 0.001 },
      { x: 0, y: 100, sourceHeight: 100, targetHeight: 100.3, sigma: 0.001 },
      { x: 100, y: 100, sourceHeight: 100, targetHeight: 100.4, sigma: 0.001 }
    ]
    const fitted = fitHeightPlane(controls)
    expect(fitted?.parameters).toMatchObject({ offset: expect.closeTo(0.5, 10), slopeX: expect.closeTo(0.001, 10), slopeY: expect.closeTo(-0.002, 10) })
    expect(applyHeightPlane(50, 50, 100, fitted!.parameters)).toBeCloseTo(100.45, 10)
  })

  it('SURVEY-NEG-HEIGHT-FIT-001 rejects collinear height controls', () => {
    expect(fitHeightPlane([
      { x: 0, y: 0, sourceHeight: 100, targetHeight: 100.5, sigma: 1 },
      { x: 1, y: 1, sourceHeight: 100, targetHeight: 100.5, sigma: 1 },
      { x: 2, y: 2, sourceHeight: 100, targetHeight: 100.5, sigma: 1 }
    ])).toBeNull()
  })

  it('SURVEY-GOLDEN-GAUSS-FORWARD-001 performs a CGCS2000 Gauss-Kruger forward conversion', () => {
    const ellipsoid = resolveEllipsoid('CGCS2000')!
    const projected = gaussKrugerForward(30, 120.5, 120, ellipsoid)
    expect(projected.x).toBeCloseTo(3320218.650437519, 6)
    expect(projected.y).toBeCloseTo(48243.44860616793, 6)
  })

  it('SURVEY-NEG-GAUSS-FORWARD-001 rejects an unsupported forward ellipsoid', () => {
    expect(resolveEllipsoid('unsupported-forward-datum')).toBeNull()
  })

  it('SURVEY-GOLDEN-GAUSS-INVERSE-001 performs a CGCS2000 Gauss-Kruger inverse conversion', () => {
    const ellipsoid = resolveEllipsoid('CGCS2000')!
    const geodetic = gaussKrugerInverse(3320218.650437519, 48243.44860616793, 120, ellipsoid)
    expect(geodetic.latitude).toBeCloseTo(30, 8)
    expect(geodetic.longitude).toBeCloseTo(120.5, 8)
  })

  it('SURVEY-NEG-GAUSS-INVERSE-001 rejects an unsupported inverse ellipsoid', () => {
    expect(resolveEllipsoid('unsupported-inverse-datum')).toBeNull()
  })
})
