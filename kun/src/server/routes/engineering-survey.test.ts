import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SurveyService } from '../../engineering/survey-service.js'
import { compareDeformation, createAdjustment, getDeformation, importSurveyNetwork, listAdjustments, listDeformations, validateSurveyNetwork, engineeringCapabilities, skillsCatalog } from './engineering.js'

describe('engineering survey HTTP handlers', () => {
  it('serves import, validation, adjustment capability and skill catalog responses', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-routes-'))
    const service = new SurveyService({ rootDir: root })
    const body = { projectId: 'project-route', expectedRevision: 0, idempotencyKey: 'route-import-001', network: { networkType: 'leveling', knownPoints: [{ id: 'BM', height: 1, known: true }], unknownPoints: [{ id: 'P', height: 1.1 }], observations: [{ id: 'obs', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm' }] } }
    const imported = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', { method: 'POST', body: JSON.stringify(body) }))
    expect(imported.status).toBe(201)
    const networkId = JSON.parse(String(imported.body)).network.id as string
    const validated = await validateSurveyNetwork(service, new Request('http://runtime', { method: 'POST', body: JSON.stringify({ expectedRevision: 1, idempotencyKey: 'route-validate-001' }) }), networkId)
    expect(validated.status).toBe(200)
    const adjustment = await createAdjustment(service, new Request('http://runtime', { method: 'POST', body: JSON.stringify({ networkId, expectedRevision: 2, idempotencyKey: 'route-adjust-001' }) }))
    expect(adjustment.status).toBe(201)
    expect(engineeringCapabilities(service).status).toBe(200)
    expect(JSON.parse(skillsCatalog().body).skills).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'survey-adjustment' })]))
    service.close()
  })

  it('serves immutable adjusted-epoch deformation comparisons', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-deformation-routes-'))
    const service = new SurveyService({ rootDir: root })
    const adjustmentIds: string[] = []
    for (const [index, difference] of [0.2, 0.19].entries()) {
      const imported = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', { method: 'POST', body: JSON.stringify({
        projectId: 'project-deformation-route', expectedRevision: 0, idempotencyKey: `route-deformation-import-${index}`, network: {
          networkType: 'leveling', coordinateSystem: 'local', projection: 'none', ellipsoid: 'none', verticalDatum: 'datum', observationEpoch: `2026-01-${index === 0 ? '01' : '11'}T00:00:00.000Z`,
          knownPoints: [{ id: 'BM', height: 1, known: true }], unknownPoints: [{ id: 'P', height: 1 + difference }],
          observations: [{ id: `obs-${index}`, type: 'height-difference', from: 'BM', to: 'P', value: difference, unit: 'm' }]
        }
      }) }))
      const network = JSON.parse(String(imported.body)).network as { id: string; revision: number }
      const adjusted = await createAdjustment(service, new Request('http://runtime', { method: 'POST', body: JSON.stringify({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `route-deformation-adjust-${index}` }) }))
      adjustmentIds.push((JSON.parse(String(adjusted.body)) as { run: { id: string } }).run.id)
    }
    const response = await compareDeformation(service, new Request('http://runtime/v1/engineering/deformations', { method: 'POST', body: JSON.stringify({ projectId: 'project-deformation-route', adjustmentIds, expectedRevision: 1, idempotencyKey: 'route-deformation-compare' }) }))
    expect(response.status).toBe(201)
    const deformation = (JSON.parse(String(response.body)) as { deformation: { id: string; points: Array<{ pointId: string; settlement?: number }> } }).deformation
    expect(deformation.points).toEqual(expect.arrayContaining([expect.objectContaining({ pointId: 'P', settlement: expect.closeTo(0.01, 12) })]))
    expect(JSON.parse(listAdjustments(service, 'project-deformation-route').body).adjustments).toHaveLength(2)
    expect(JSON.parse(listDeformations(service, 'project-deformation-route').body).deformations).toHaveLength(1)
    expect(getDeformation(service, deformation.id).status).toBe(200)
    service.close()
  })
})
