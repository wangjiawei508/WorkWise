import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SurveyService } from './survey-service.js'

describe('survey adjustment golden fixtures', () => {
  it('adjusts a plane-control fixture and exposes horizontal displacement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-plane-fixture-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'plane-fixture', expectedRevision: 0, idempotencyKey: 'plane-fixture-import', networkType: 'plane-control', network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, { id: 'B', pointClass: 'known', x: 100, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 0, y: 99.95, known: false }],
        observations: [
          { id: 'AP', type: 'distance', from: 'A', to: 'P', value: 100, unit: 'm', sigma: 0.001 },
          { id: 'BP', type: 'distance', from: 'B', to: 'P', value: Math.sqrt(10000 + 10000), unit: 'm', sigma: 0.001 }
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'plane-fixture-validate' })
    expect(checked.qualityStatus).toBe('validated')
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'plane-fixture-adjust' })
    expect(output.run.status).toBe('completed')
    expect(output.result.validation).toBe('valid')
    const displacement = output.result.displacements.find((item) => item.pointId === 'P')
    expect(displacement?.kind).toBe('horizontal')
    expect(displacement?.dY).toBeCloseTo(0.05, 3)
    service.close()
  })

  it.each(['traverse', 'triangulation', 'cpiii-free-station', 'cpiii-resection'] as const)('accepts %s as a deterministic plane network', async (networkType) => {
    const root = await mkdtemp(join(tmpdir(), `workwise-${networkType}-fixture-`))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: networkType, expectedRevision: 0, idempotencyKey: `${networkType}-import`, networkType, network: {
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, { id: 'B', pointClass: 'known', x: 10, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 0, y: 10, known: false }],
        observations: [
          { id: 'AP', type: 'distance', from: 'A', to: 'P', value: 10, unit: 'm' },
          { id: 'BP', type: 'distance', from: 'B', to: 'P', value: Math.sqrt(200), unit: 'm' },
          ...(networkType === 'traverse' ? [{ id: 'AP-angle', type: 'angle' as const, from: 'A', to: 'P', value: 45, unit: 'deg' }] : [])
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: `${networkType}-validate` })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: `${networkType}-adjust` })
    expect(output.result.observationCount).toBe(networkType === 'traverse' ? 3 : 2)
    expect(output.result.algorithmVersion).toBe('workwise-survey-adjustment-1')
    expect(output.result.strategyId).toBe(networkType)
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
