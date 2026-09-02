import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SurveyService } from '../../engineering/survey-service.js'
import { createAdjustment, importSurveyNetwork, validateSurveyNetwork, engineeringCapabilities, skillsCatalog } from './engineering.js'

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
})
