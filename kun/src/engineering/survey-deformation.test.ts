import { describe, expect, it } from 'vitest'
import { AdjustmentResultV1, DeformationPairDefinitionV1 } from '../contracts/survey.js'
import { compareAdjustedEpochs, type AdjustedEpoch } from './survey-deformation.js'

function epoch(adjustmentId: string, observationEpoch: string, points: Array<{ id: string; x?: number; y?: number; height?: number; standardError?: number }>): AdjustedEpoch {
  return {
    adjustmentId,
    observationEpoch,
    result: AdjustmentResultV1.parse({
      schemaVersion: 1,
      id: `result-${adjustmentId}`,
      runId: adjustmentId,
      networkId: `network-${adjustmentId}`,
      observationCount: 6,
      unknownCount: points.length * 3,
      redundancy: 1,
      degreesOfFreedom: 1,
      closure: {},
      closureUnits: {},
      unitWeightStdDev: 1,
      varianceFactor: 1,
      varianceFactorEstimated: true,
      points,
      observations: [],
      displacements: [],
      precision: { maxPointStdDev: 0.0002, passed: true },
      qualityFindings: [],
      inputHash: `hash-${adjustmentId}`,
      algorithmVersion: 'fixture-1',
      validation: 'valid',
      strategyId: 'plane-control',
      createdAt: observationEpoch
    })
  }
}

describe('immutable adjusted-epoch deformation comparison', () => {
  it('SURVEY-GOLDEN-DEFORMATION-001 calculates displacement, settlement, rate, trend, tilt and convergence', () => {
    const epochs = [
      epoch('a1', '2026-01-01T00:00:00.000Z', [
        { id: 'A', x: 0, y: 0, height: 10, standardError: 0.0002 },
        { id: 'B', x: 2, y: 0, height: 10, standardError: 0.0002 }
      ]),
      epoch('a2', '2026-01-02T00:00:00.000Z', [
        { id: 'A', x: 0.001, y: 0, height: 9.999, standardError: 0.0002 },
        { id: 'B', x: 1.999, y: 0, height: 9.998, standardError: 0.0002 }
      ]),
      epoch('a3', '2026-01-03T00:00:00.000Z', [
        { id: 'A', x: 0.002, y: 0, height: 9.998, standardError: 0.0002 },
        { id: 'B', x: 1.996, y: 0, height: 9.996, standardError: 0.0002 }
      ])
    ]
    const pairs = DeformationPairDefinitionV1.array().parse([
      { id: 'section-convergence', firstPointId: 'A', secondPointId: 'B', kind: 'convergence' },
      { id: 'section-tilt', firstPointId: 'A', secondPointId: 'B', kind: 'tilt' }
    ])
    const output = compareAdjustedEpochs(epochs, pairs, 0.0001)

    expect(output.durationDays).toBe(2)
    expect(output.points.find((point) => point.pointId === 'A')).toMatchObject({
      dX: expect.closeTo(0.002, 12),
      dY: 0,
      dH: expect.closeTo(-0.002, 12),
      settlement: expect.closeTo(0.002, 12),
      horizontalDisplacement: expect.closeTo(0.002, 12),
      spatialDisplacement: expect.closeTo(Math.sqrt(0.000008), 12),
      trend: 'settling',
      significant: true,
      rates: { settlementPerDay: expect.closeTo(0.001, 12), spatialPerDay: expect.closeTo(Math.sqrt(0.000008) / 2, 12) }
    })
    expect(output.pairs.find((pair) => pair.id === 'section-convergence')).toMatchObject({
      referenceDistance: 2,
      currentDistance: expect.closeTo(1.994, 12),
      convergence: expect.closeTo(0.006, 12),
      convergenceRatePerDay: expect.closeTo(0.003, 12)
    })
    expect(output.pairs.find((pair) => pair.id === 'section-tilt')).toMatchObject({
      baselineM: 2,
      differentialSettlement: expect.closeTo(0.002, 12),
      tilt: expect.closeTo(0.001, 12)
    })
  })

  it('SURVEY-NEG-DEFORMATION-001 rejects duplicate observation epochs', () => {
    const sameDate = [
      epoch('a1', '2026-01-01T00:00:00.000Z', [{ id: 'A', height: 1 }]),
      epoch('a2', '2026-01-01T00:00:00.000Z', [{ id: 'A', height: 0.9 }])
    ]
    expect(() => compareAdjustedEpochs(sameDate, [], 0.0001)).toThrow('unique observation epochs')
  })

  it('rejects comparisons without a common adjusted point', () => {
    const noCommonPoint = [
      epoch('a1', '2026-01-01T00:00:00.000Z', [{ id: 'A', height: 1 }]),
      epoch('a2', '2026-01-02T00:00:00.000Z', [{ id: 'B', height: 0.9 }])
    ]
    expect(() => compareAdjustedEpochs(noCommonPoint, [], 0.0001)).toThrow('no common point')
  })

  it('rejects a convergence pair whose requested coordinate mode is unavailable', () => {
    const epochs = [
      epoch('a1', '2026-01-01T00:00:00.000Z', [{ id: 'A', height: 1 }, { id: 'B', height: 2 }]),
      epoch('a2', '2026-01-02T00:00:00.000Z', [{ id: 'A', height: 0.9 }, { id: 'B', height: 1.8 }])
    ]
    const pairs = DeformationPairDefinitionV1.array().parse([{ id: 'section', firstPointId: 'A', secondPointId: 'B', kind: 'convergence', distanceMode: 'horizontal' }])
    expect(() => compareAdjustedEpochs(epochs, pairs, 0.0001)).toThrow('lacks coordinates for horizontal convergence')
  })
})
