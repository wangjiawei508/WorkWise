import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SurveyService } from './survey-service.js'

describe('survey adjustment golden fixtures', () => {
  it('adjusts a closed leveling route with inverse route-length weights', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-leveling-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'leveling-fixture', expectedRevision: 0, idempotencyKey: 'leveling-fixture-import', networkType: 'leveling', network: {
        knownPoints: [{ id: 'BM1', pointClass: 'known', height: 100, known: true }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 101, known: false }],
        observations: [
          { id: 'BM1-P1', type: 'height-difference', from: 'BM1', to: 'P1', value: 1, unit: 'm', routeLength: 1 },
          { id: 'P1-BM1', type: 'height-difference', from: 'P1', to: 'BM1', value: -0.999, unit: 'm', routeLength: 4 }
        ],
        instrumentParameters: { closedLoop: 1 }
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'leveling-fixture-validate' })
    expect(checked.qualityStatus).toBe('validated')
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'leveling-fixture-adjust' })

    // Independent two-observation solution:
    // x = (1 * 0 + 0.25 * -0.001) / (1 + 0.25) = -0.0002 m.
    expect(output.run.status).toBe('completed')
    expect(output.result.strategyId).toBe('leveling')
    expect(output.result.closure.heightDifference).toBeCloseTo(0.001, 12)
    expect(output.result.closureUnits.heightDifference).toBe('m')
    expect(output.result.redundancy).toBe(1)
    expect(output.result.points.find((point) => point.id === 'P1')?.height).toBeCloseTo(100.9998, 10)
    expect(output.result.observations.find((item) => item.observationId === 'BM1-P1')?.residual).toBeCloseTo(-0.0002, 10)
    expect(output.result.observations.find((item) => item.observationId === 'P1-BM1')?.residual).toBeCloseTo(-0.0008, 10)
    expect(output.result.unitWeightStdDev).toBeCloseTo(Math.sqrt(2e-7), 12)
    expect(output.result.solverDiagnostics).toMatchObject({ iterations: 1, rank: 1 })
    service.close()
  })

  it('reports an attached height-control closure against two known benchmarks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-height-control-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'height-control-fixture', expectedRevision: 0, idempotencyKey: 'height-control-fixture-import', networkType: 'height-control', network: {
        knownPoints: [
          { id: 'BM-A', pointClass: 'known', height: 50, known: true },
          { id: 'BM-B', pointClass: 'known', height: 51, known: true }
        ],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', height: 50.4, known: false }],
        observations: [
          { id: 'BM-A-P', type: 'height-difference', from: 'BM-A', to: 'P', value: 0.4, unit: 'm', sigma: 0.001 },
          { id: 'P-BM-B', type: 'height-difference', from: 'P', to: 'BM-B', value: 0.601, unit: 'm', sigma: 0.001 }
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'height-control-fixture-validate' })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'height-control-fixture-adjust' })

    expect(checked.qualityStatus).toBe('validated')
    expect(output.run.status).toBe('completed')
    expect(output.result.strategyId).toBe('height-control')
    expect(output.result.closure.heightDifference).toBeCloseTo(0.001, 12)
    expect(output.result.points.find((point) => point.id === 'P')?.height).toBeCloseTo(50.3995, 10)
    expect(output.result.observations.map((item) => item.residual)).toEqual([
      expect.closeTo(-0.0005, 10),
      expect.closeTo(-0.0005, 10)
    ])
    service.close()
  })

  it('iteratively adjusts a mixed-observation plane-control fixture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-plane-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'plane-fixture', expectedRevision: 0, idempotencyKey: 'plane-fixture-import', networkType: 'plane-control', network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, { id: 'B', pointClass: 'known', x: 100, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 0, y: 99.95, known: false }],
        observations: [
          { id: 'AP', type: 'distance', from: 'A', to: 'P', value: 100, unit: 'm', sigma: 0.001 },
          { id: 'BP', type: 'distance', from: 'B', to: 'P', value: Math.sqrt(10000 + 10000), unit: 'm', sigma: 0.001 },
          { id: 'direction-AP', type: 'direction', from: 'A', to: 'P', value: 0, unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' },
          { id: 'angle-APB', type: 'angle', station: 'P', left: 'A', right: 'B', value: 315, unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' }
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'plane-fixture-validate' })
    expect(checked.qualityStatus).toBe('validated')
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'plane-fixture-adjust' })
    expect(output.run.status).toBe('completed')
    expect(output.result.validation).toBe('valid')
    expect(output.result.strategyId).toBe('plane-control')
    expect(output.result.redundancy).toBe(2)
    expect(output.result.observations.map((item) => item.unit)).toEqual(['m', 'm', 'rad', 'rad'])
    expect(output.result.solverDiagnostics?.iterations).toBeGreaterThan(1)
    expect(output.result.solverDiagnostics?.rank).toBe(2)
    const displacement = output.result.displacements.find((item) => item.pointId === 'P')
    expect(displacement?.kind).toBe('horizontal')
    expect(displacement?.dY).toBeCloseTo(0.05, 3)
    service.close()
  })

  it('adjusts a triangulation fixture from three independent station angles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-triangulation-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'triangulation-fixture', expectedRevision: 0, idempotencyKey: 'triangulation-fixture-import', networkType: 'triangulation', network: {
        knownPoints: [
          { id: 'A', pointClass: 'known', x: 0, y: 0, known: true },
          { id: 'B', pointClass: 'known', x: 100, y: 0, known: true }
        ],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 50.2, y: 49.8, known: false }],
        observations: [
          { id: 'angle-A', type: 'angle', station: 'A', left: 'P', right: 'B', value: 45, unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' },
          { id: 'angle-B', type: 'angle', station: 'B', left: 'A', right: 'P', value: 45, unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' },
          { id: 'angle-P', type: 'angle', station: 'P', left: 'B', right: 'A', value: 90, unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' }
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'triangulation-fixture-validate' })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'triangulation-fixture-adjust' })

    expect(checked.qualityStatus).toBe('validated')
    expect(output.run.status).toBe('completed')
    expect(output.result.strategyId).toBe('triangulation')
    expect(output.result.observationCount).toBe(3)
    expect(output.result.unknownCount).toBe(2)
    expect(output.result.redundancy).toBe(1)
    expect(output.result.points.find((point) => point.id === 'P')?.x).toBeCloseTo(50, 6)
    expect(output.result.points.find((point) => point.id === 'P')?.y).toBeCloseTo(50, 6)
    expect(output.result.observations.every((item) => item.unit === 'rad')).toBe(true)
    expect(output.result.solverDiagnostics?.iterations).toBeGreaterThan(1)
    expect(output.result.solverDiagnostics?.rank).toBe(2)
    service.close()
  })

  it.each([
    {
      name: 'distance-only observations',
      observations: [
        { id: 'AP', type: 'distance' as const, from: 'A', to: 'P', value: Math.sqrt(5000), unit: 'm' },
        { id: 'BP', type: 'distance' as const, from: 'B', to: 'P', value: Math.sqrt(5000), unit: 'm' }
      ],
      expectedCode: 'invalid_observation'
    },
    {
      name: 'malformed station angle',
      observations: [
        { id: 'angle-A', type: 'angle' as const, station: 'A', left: 'P', value: 45, unit: 'deg' },
        { id: 'angle-B', type: 'angle' as const, station: 'B', left: 'A', right: 'P', value: 45, unit: 'deg' }
      ],
      expectedCode: 'malformed_geometry'
    }
  ])('blocks triangulation with $name', async ({ name, observations, expectedCode }) => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-triangulation-invalid-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: `triangulation-${name}`, expectedRevision: 0, idempotencyKey: `triangulation-${name}`, networkType: 'triangulation', network: {
        knownPoints: [
          { id: 'A', pointClass: 'known', x: 0, y: 0, known: true },
          { id: 'B', pointClass: 'known', x: 100, y: 0, known: true }
        ],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 50, y: 50, known: false }],
        observations
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: `triangulation-validate-${name}` })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: `triangulation-adjust-${name}` })

    expect(checked.qualityStatus).toBe('blocked')
    expect(output.run.status).toBe('needs_attention')
    expect(output.result.strategyId).toBe('triangulation')
    expect(output.result.qualityFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: expectedCode, severity: 'blocking' })]))
    expect(output.result.points).toEqual([])
    service.close()
  })

  it('adjusts an ordered traverse using its distance and turn-angle equations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-traverse-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'traverse-fixture', expectedRevision: 0, idempotencyKey: 'traverse-fixture-import', networkType: 'traverse', network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, { id: 'B', pointClass: 'known', x: 100, y: 100, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 0.2, y: 99.8, known: false }],
        observations: [
          { id: 'A-P', type: 'distance', from: 'A', to: 'P', value: 100, unit: 'm', sigma: 0.002 },
          { id: 'P-B', type: 'distance', from: 'P', to: 'B', value: 100, unit: 'm', sigma: 0.002 },
          { id: 'turn-P', type: 'angle', station: 'P', left: 'A', right: 'B', value: 270, unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' }
        ],
        instrumentParameters: { startAzimuthDeg: 0, endAzimuthDeg: 90 }
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'traverse-fixture-validate' })
    expect(checked.qualityStatus).toBe('validated')
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'traverse-fixture-adjust' })

    expect(output.run.status).toBe('completed')
    expect(output.result.validation).toBe('valid')
    expect(output.result.strategyId).toBe('traverse')
    expect(output.result.observationCount).toBe(3)
    expect(output.result.algorithmVersion).toBe('workwise-survey-adjustment-4')
    expect(output.result.redundancy).toBe(1)
    expect(output.result.points.find((point) => point.id === 'P')).toMatchObject({ id: 'P' })
    expect(output.result.points.find((point) => point.id === 'P')?.x).toBeCloseTo(0, 6)
    expect(output.result.points.find((point) => point.id === 'P')?.y).toBeCloseTo(100, 6)
    expect(output.result.closure.fx).toBeCloseTo(0, 12)
    expect(output.result.closure.fy).toBeCloseTo(0, 12)
    expect(output.result.closure.relativeClosure).toBeCloseTo(0, 12)
    expect(output.result.closure.angular).toBeCloseTo(0, 12)
    expect(output.result.closureUnits).toEqual({ fx: 'm', fy: 'm', relativeClosure: 'ratio', angular: 'rad' })
    expect(output.result.observations.map((item) => item.unit)).toEqual(['m', 'm', 'rad'])
    expect(output.result.solverDiagnostics?.iterations).toBeGreaterThan(1)
    expect(output.result.solverDiagnostics?.rank).toBe(2)
    service.close()
  })

  it.each([
    {
      name: 'unordered edges',
      observations: [
        { id: 'P-B', type: 'distance' as const, from: 'P', to: 'B', value: 100, unit: 'm' },
        { id: 'A-P', type: 'distance' as const, from: 'A', to: 'P', value: 100, unit: 'm' },
        { id: 'turn-P', type: 'angle' as const, station: 'P', left: 'A', right: 'B', value: 270, unit: 'deg' }
      ],
      expectedCode: 'malformed_geometry'
    },
    {
      name: 'missing orientation',
      observations: [
        { id: 'A-P', type: 'distance' as const, from: 'A', to: 'P', value: 100, unit: 'm' },
        { id: 'P-B', type: 'distance' as const, from: 'P', to: 'B', value: 100, unit: 'm' },
        { id: 'unrelated-direction', type: 'direction' as const, from: 'A', to: 'B', value: 45, unit: 'deg' }
      ],
      expectedCode: 'malformed_geometry'
    },
    {
      name: 'unknown end datum',
      observations: [
        { id: 'A-P', type: 'distance' as const, from: 'A', to: 'P', value: 100, unit: 'm' },
        { id: 'P-B', type: 'distance' as const, from: 'P', to: 'B', value: 100, unit: 'm' },
        { id: 'turn-P', type: 'angle' as const, station: 'P', left: 'A', right: 'B', value: 270, unit: 'deg' }
      ],
      expectedCode: 'missing_datum'
    }
  ])('blocks a traverse with $name', async ({ name, observations, expectedCode }) => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-traverse-invalid-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: `traverse-invalid-${name}`, expectedRevision: 0, idempotencyKey: `traverse-invalid-${name}`, networkType: 'traverse', network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, ...(name === 'unknown end datum' ? [] : [{ id: 'B', pointClass: 'known' as const, x: 100, y: 100, known: true }])],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 0, y: 100, known: false }, ...(name === 'unknown end datum' ? [{ id: 'B', pointClass: 'unknown' as const, x: 100, y: 100, known: false }] : [])],
        observations,
        instrumentParameters: name === 'missing orientation' ? {} : { startAzimuthDeg: 0 }
      }
    })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `traverse-invalid-adjust-${name}` })
    expect(output.run.status).toBe('needs_attention')
    expect(output.result.strategyId).toBe('traverse')
    expect(output.result.qualityFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: expectedCode, severity: 'blocking' })]))
    expect(output.result.points).toEqual([])
    service.close()
  })

  it('blocks a rank-deficient traverse instead of returning partial coordinates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-traverse-rank-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'traverse-rank', expectedRevision: 0, idempotencyKey: 'traverse-rank-import', networkType: 'traverse', network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, { id: 'B', pointClass: 'known', x: 100, y: 100, known: true }],
        unknownPoints: [
          { id: 'P', pointClass: 'unknown', x: 0, y: 100, known: false },
          { id: 'Q', pointClass: 'unknown', x: 50, y: 50, known: false }
        ],
        observations: [
          { id: 'A-P', type: 'distance', from: 'A', to: 'P', value: 100, unit: 'm' },
          { id: 'P-B', type: 'distance', from: 'P', to: 'B', value: 100, unit: 'm' },
          { id: 'turn-P', type: 'angle', station: 'P', left: 'A', right: 'B', value: 270, unit: 'deg' }
        ],
        instrumentParameters: { startAzimuthDeg: 0 }
      }
    })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'traverse-rank-adjust' })
    expect(output.run.status).toBe('needs_attention')
    expect(output.result.qualityFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'rank_deficient', severity: 'blocking' })]))
    expect(output.result.points).toEqual([])
    service.close()
  })

  it.each(['cpiii-free-station', 'cpiii-resection'] as const)('solves %s with station orientation and paired vertical evidence', async (networkType) => {
    const root = await mkdtemp(join(tmpdir(), `workwise-${networkType}-fixture-`))
    const service = new SurveyService({ rootDir: root })
    const station = { x: 40, y: 30, height: 8 }
    const targets = {
      A: { x: 0, y: 0, height: 10 },
      B: { x: 100, y: 0, height: 12 },
      C: { x: 0, y: 100, height: 11 }
    }
    const orientationDeg = 10
    const directionReading = (target: { x: number; y: number }): number => {
      const bearing = Math.atan2(target.x - station.x, target.y - station.y) * 180 / Math.PI
      return ((bearing - orientationDeg) % 360 + 360) % 360
    }
    const horizontalA = Math.hypot(targets.A.x - station.x, targets.A.y - station.y)
    const deltaHeightA = (targets.A.height + 1.8) - (station.height + 1.5)
    const network = await service.importNetwork({
      projectId: `${networkType}-fixture`, expectedRevision: 0, idempotencyKey: `${networkType}-fixture-import`, networkType, network: {
        knownPoints: Object.entries(targets).map(([id, point]) => ({ id, pointClass: 'known' as const, ...point, known: true })),
        unknownPoints: [{ id: 'S1', pointClass: 'station', x: 40.2, y: 29.8, height: 8.1, known: false }],
        observations: [
          ...Object.entries(targets).map(([id, point]) => ({ id: `direction-S1-${id}`, type: 'direction' as const, station: 'S1', target: id, value: directionReading(point), unit: 'deg', sigma: 2, sigmaUnit: 'arcsec' })),
          { id: 'slope-S1-A', type: 'slope-distance', station: 'S1', target: 'A', value: Math.hypot(horizontalA, deltaHeightA), unit: 'm', sigma: 0.002, stationHeightOffset: 1.5, targetHeightOffset: 1.8 },
          { id: 'zenith-S1-A', type: 'zenith', station: 'S1', target: 'A', value: Math.atan2(horizontalA, deltaHeightA), unit: 'rad', sigma: 2, sigmaUnit: 'arcsec', stationHeightOffset: 1.5, targetHeightOffset: 1.8 }
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: `${networkType}-fixture-validate` })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: `${networkType}-fixture-adjust` })

    expect(checked.qualityStatus).toBe('validated')
    expect(output.run.status).toBe('completed')
    expect(output.result.strategyId).toBe(networkType)
    expect(output.result.unknownCount).toBe(4)
    expect(output.result.redundancy).toBe(1)
    expect(output.result.points.find((point) => point.id === 'S1')?.x).toBeCloseTo(station.x, 6)
    expect(output.result.points.find((point) => point.id === 'S1')?.y).toBeCloseTo(station.y, 6)
    expect(output.result.points.find((point) => point.id === 'S1')?.height).toBeCloseTo(station.height, 6)
    expect(output.result.parameters['orientation:S1']).toBeCloseTo(orientationDeg * Math.PI / 180, 8)
    expect(output.result.parameterUnits['orientation:S1']).toBe('rad')
    expect(output.result.observations.map((item) => item.unit)).toEqual(['rad', 'rad', 'rad', 'm', 'rad'])
    expect(output.result.solverDiagnostics?.iterations).toBeGreaterThan(1)
    expect(output.result.solverDiagnostics?.rank).toBe(4)
    service.close()
  })

  it.each([
    { name: 'fewer than three fixed directions', includeThirdDirection: false, includeSlope: false, includeZenith: false, targetHeight: 10, expectedCode: 'malformed_geometry' },
    { name: 'unpaired slope distance', includeThirdDirection: true, includeSlope: true, includeZenith: false, targetHeight: 10, expectedCode: 'malformed_geometry' },
    { name: 'missing vertical datum', includeThirdDirection: true, includeSlope: true, includeZenith: true, targetHeight: undefined, expectedCode: 'missing_datum' }
  ])('blocks CPIII with $name', async ({ name, includeThirdDirection, includeSlope, includeZenith, targetHeight, expectedCode }) => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-cpiii-invalid-'))
    const service = new SurveyService({ rootDir: root })
    const directions = [
      { id: 'direction-A', type: 'direction' as const, station: 'S', target: 'A', value: 220, unit: 'deg' },
      { id: 'direction-B', type: 'direction' as const, station: 'S', target: 'B', value: 110, unit: 'deg' },
      ...(includeThirdDirection ? [{ id: 'direction-C', type: 'direction' as const, station: 'S', target: 'C', value: 320, unit: 'deg' }] : [])
    ]
    const network = await service.importNetwork({
      projectId: `cpiii-${name}`, expectedRevision: 0, idempotencyKey: `cpiii-${name}`, networkType: 'cpiii-free-station', network: {
        knownPoints: [
          { id: 'A', pointClass: 'known', x: 0, y: 0, ...(targetHeight === undefined ? {} : { height: targetHeight }), known: true },
          { id: 'B', pointClass: 'known', x: 100, y: 0, height: 12, known: true },
          { id: 'C', pointClass: 'known', x: 0, y: 100, height: 11, known: true }
        ],
        unknownPoints: [{ id: 'S', pointClass: 'station', x: 40, y: 30, height: 8, known: false }],
        observations: [
          ...directions,
          ...(includeSlope ? [{ id: 'slope-A', type: 'slope-distance' as const, station: 'S', target: 'A', value: 50, unit: 'm' }] : []),
          ...(includeZenith ? [{ id: 'zenith-A', type: 'zenith' as const, station: 'S', target: 'A', value: 90, unit: 'deg' }] : [])
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: `cpiii-invalid-validate-${name}` })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: `cpiii-invalid-adjust-${name}` })

    expect(checked.qualityStatus).toBe('blocked')
    expect(output.run.status).toBe('needs_attention')
    expect(output.result.strategyId).toBe('cpiii-free-station')
    expect(output.result.qualityFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: expectedCode, severity: 'blocking' })]))
    expect(output.result.points).toEqual([])
    service.close()
  })

  it('applies a configured coordinate transformation and preserves point deltas', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-transform-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'transform-fixture', expectedRevision: 0, idempotencyKey: 'transform-fixture-import', networkType: 'coordinate-transform', network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 10, y: 20, known: false }],
        observations: [{ id: 'AP', type: 'distance', from: 'A', to: 'P', value: Math.sqrt(500), unit: 'm' }],
        instrumentParameters: { translationX: 1, translationY: 2, rotationDeg: 0, scalePpm: 0 }
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'transform-fixture-validate' })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'transform-fixture-adjust', method: 'helmert-seven-parameter' })
    expect(output.result.closure.translationX).toBe(1)
    expect(output.result.closure.translationY).toBe(2)
    expect(output.result.displacements.find((item) => item.pointId === 'P')?.magnitude).toBeCloseTo(Math.sqrt(5), 8)
    service.close()
  })
})
