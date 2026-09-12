import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SurveyService } from '../../engineering/survey-service.js'
import { compareDeformation, createAdjustment, getAdjustment as getSurveyAdjustment, getDeformation, getSurveyDerivedCorrections, importSurveyNetwork, inspectCosaSurveyFileGroups, listAdjustments, listDeformations, listSurveyNetworks, previewAdjustment, replaySurveyDerivedCorrections, validateSurveyNetwork, engineeringCapabilities, skillsCatalog } from './engineering.js'

function workwiseJsonImport(
  projectId: string,
  expectedRevision: number,
  idempotencyKey: string,
  network: Record<string, unknown>
) {
  return {
    projectId,
    expectedRevision,
    idempotencyKey,
    name: 'workwise-survey-network.json',
    dataBase64: Buffer.from(JSON.stringify({
      format: 'workwise-survey-network',
      formatVersion: 1,
      network
    })).toString('base64')
  }
}

function utf16FrozenSourceBytes(value: object, encoding: 'utf-16le' | 'utf-16be'): Buffer {
  const json = JSON.stringify(value)
  if (encoding === 'utf-16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(json, 'utf16le')])
  const littleEndian = Buffer.from(json, 'utf16le')
  const bigEndian = Buffer.alloc(littleEndian.length)
  for (let index = 0; index < littleEndian.length; index += 2) {
    bigEndian[index] = littleEndian[index + 1]!
    bigEndian[index + 1] = littleEndian[index]!
  }
  return Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian])
}

describe('engineering survey HTTP handlers', () => {
  it.each(['utf-16le', 'utf-16be'] as const)('keeps %s frozen-envelope semantics through the Runtime import boundary', async (encoding) => {
    const root = await mkdtemp(join(tmpdir(), `workwise-survey-route-${encoding}-`))
    const service = new SurveyService({ rootDir: root })
    const source = utf16FrozenSourceBytes({
      format: 'workwise-survey-network',
      formatVersion: 1,
      network: {
        networkType: 'plane-control',
        coordinateSystem: 'UTF16 路由坐标系',
        projection: 'gauss-kruger',
        centralMeridian: 120,
        ellipsoid: 'CGCS2000',
        verticalDatum: '1985-height',
        unit: 'm',
        knownPoints: [{ id: 'A', pointClass: 'known', known: true, x: 0, y: 0 }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, x: 10, y: 0 }],
        observations: [{ id: 'utf16-route-distance', type: 'distance', from: 'A', to: 'P', value: 10, unit: 'm' }]
      }
    }, encoding)
    const response = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', {
      method: 'POST',
      body: JSON.stringify({
        projectId: `project-route-${encoding}`,
        expectedRevision: 0,
        idempotencyKey: `route-import-${encoding}-frozen-envelope`,
        networkType: 'leveling',
        name: `frozen-${encoding}.json`,
        dataBase64: source.toString('base64')
      })
    }))

    expect(response.status).toBe(201)
    const network = JSON.parse(String(response.body)).network as {
      networkType: string
      coordinateSystem: string
      sourceFile: { disposition: string; records: Array<{ id: string; rawSnippet: string }> }
      observations: Array<{ id: string; sourceRecordId?: string }>
      sourceEligibility: { eligible: boolean }
    }
    expect(network).toMatchObject({
      networkType: 'plane-control',
      coordinateSystem: 'UTF16 路由坐标系',
      sourceFile: { disposition: 'adjustment-ready' },
      sourceEligibility: { eligible: true }
    })
    expect(network.observations).toContainEqual(expect.objectContaining({ id: 'utf16-route-distance', sourceRecordId: 'workwise-json-observation-1' }))
    expect(network.sourceFile.records.find((record) => record.id === 'workwise-json-observation-1')?.rawSnippet).toContain('utf16-route-distance')
    service.close()
  })

  it('serves import, validation, adjustment capability and skill catalog responses', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-routes-'))
    const service = new SurveyService({ rootDir: root })
    const network = { networkType: 'leveling', unit: 'm', knownPoints: [{ id: 'BM', height: 1, known: true }], unknownPoints: [{ id: 'P', height: 1.1 }], observations: [{ id: 'obs', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm' }] }
    const directPayload = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'project-route', expectedRevision: 0, idempotencyKey: 'route-import-direct-network', network })
    }))
    expect(directPayload.status).toBe(400)
    expect(JSON.parse(String(directPayload.body))).toMatchObject({
      code: 'validation_error',
      message: expect.stringContaining('结构化网络不能直接通过 Runtime 提交')
    })
    const body = workwiseJsonImport('project-route', 0, 'route-import-001', network)
    const imported = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', { method: 'POST', body: JSON.stringify(body) }))
    expect(imported.status).toBe(201)
    const importedBody = JSON.parse(String(imported.body)) as { network: { id: string; rawSourceIntegrity: { status: string }; sourceEligibility: { eligible: boolean } } }
    const networkId = importedBody.network.id
    expect(importedBody.network.rawSourceIntegrity.status).toBe('verified')
    expect(importedBody.network.sourceEligibility.eligible).toBe(true)
    const validated = await validateSurveyNetwork(service, new Request('http://runtime', { method: 'POST', body: JSON.stringify({ expectedRevision: 1, idempotencyKey: 'route-validate-001' }) }), networkId)
    expect(validated.status).toBe(200)
    expect((JSON.parse(String(validated.body)) as { network: { rawSourceIntegrity: { status: string }; sourceEligibility: { eligible: boolean } } }).network).toMatchObject({ rawSourceIntegrity: { status: 'verified' }, sourceEligibility: { eligible: true } })
    const corrections = getSurveyDerivedCorrections(service, networkId)
    expect(corrections.status).toBe(200)
    expect(JSON.parse(String(corrections.body))).toMatchObject({ corrections: [], rawSourceIntegrity: { status: 'verified' } })
    const correctionReplay = replaySurveyDerivedCorrections(service, networkId)
    expect(correctionReplay.status).toBe(200)
    expect(JSON.parse(String(correctionReplay.body))).toMatchObject({ replay: { valid: true }, rawSourceIntegrity: { status: 'verified' } })
    const adjustment = await createAdjustment(service, new Request('http://runtime', { method: 'POST', body: JSON.stringify({ networkId, expectedRevision: 2, idempotencyKey: 'route-adjust-001' }) }))
    expect(adjustment.status).toBe(201)
    expect(engineeringCapabilities(service).status).toBe(200)
    expect(JSON.parse(skillsCatalog().body).skills).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'survey-adjustment' })]))
    service.close()
  })

  it('keeps immutable correction evidence readable when a later source-integrity failure blocks replay', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-correction-evidence-route-'))
    const service = new SurveyService({ rootDir: root })
    const imported = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', {
      method: 'POST',
      body: JSON.stringify(workwiseJsonImport('project-correction-evidence-route', 0, 'route-correction-evidence-import', {
        networkType: 'leveling', unit: 'm',
        knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, height: 10.1 }],
        observations: [{ id: 'dh', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm' }]
      }))
    }))
    const network = JSON.parse(String(imported.body)).network as { id: string; revision: number; sourceFile: { sha256: string } }
    const rawHead = service.getRawSourceLedger(network.id)[0]!.thisHash
    const correction = service.recordTrustedDerivedObservationValueCorrection({
      id: 'route-correction-evidence-1',
      networkId: network.id,
      expectedNetworkRevision: network.revision,
      idempotencyKey: 'route-correction-evidence-key-1',
      observationId: 'dh',
      afterValue: 0.101,
      reason: '人工复核后的派生高差修正',
      basis: { kind: 'manual-review', referenceId: 'route-review-1' },
      operation: { id: 'trusted-manual-entry', version: '1' },
      actor: { id: 'surveyor-route', kind: 'human' },
      expectedCorrectionHeadHash: rawHead
    })
    await writeFile(join(root, 'sources', network.sourceFile.sha256, 'original'), 'tampered-after-correction')

    const response = getSurveyDerivedCorrections(service, network.id)
    expect(response.status).toBe(200)
    expect(JSON.parse(String(response.body))).toMatchObject({
      corrections: [expect.objectContaining({ id: correction.id })],
      rawSourceIntegrity: { status: 'failed' },
      replay: { valid: false }
    })
    service.close()
  })

  it('returns current source admission on historical adjustment reads without changing the completed result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-adjustment-admission-route-'))
    const service = new SurveyService({ rootDir: root })
    const imported = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', {
      method: 'POST',
      body: JSON.stringify(workwiseJsonImport('project-adjustment-admission-route', 0, 'route-adjustment-admission-import', {
        networkType: 'leveling',
        coordinateSystem: 'local',
        projection: 'none',
        ellipsoid: 'none',
        verticalDatum: 'datum',
        unit: 'm',
        knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, height: 10.1 }],
        observations: [{ id: 'dh', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }]
      }))
    }))
    const network = JSON.parse(String(imported.body)).network as { id: string; revision: number; sourceFile: { sha256: string } }
    const created = await createAdjustment(service, new Request('http://runtime/v1/engineering/adjustments', {
      method: 'POST',
      body: JSON.stringify({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'route-adjustment-admission-create' })
    }))
    expect(created.status).toBe(201)
    const createdBody = JSON.parse(String(created.body)) as {
      run: { id: string; status: string }
      result: { validation: string }
      rawSourceIntegrity?: { status: string }
      sourceEligibility?: { eligible: boolean }
    }
    expect(createdBody).toMatchObject({
      run: { status: 'completed' },
      result: { validation: 'valid' },
      rawSourceIntegrity: { status: 'verified' },
      sourceEligibility: { eligible: true }
    })
    const adjustmentId = createdBody.run.id

    // The run was valid when created. Simulate a later audit decision that
    // retains the source file but makes it archive-only for new computation.
    const database = new Database(join(root, 'survey.sqlite3'))
    const row = database.prepare('SELECT data_json FROM survey_networks WHERE id = ?').get(network.id) as { data_json: string }
    const storedNetwork = JSON.parse(row.data_json) as { sourceFile: { disposition: string; dispositionReason: string } }
    storedNetwork.sourceFile.disposition = 'archive-only'
    storedNetwork.sourceFile.dispositionReason = '后续审计将该来源降级为仅归档可读'
    database.prepare('UPDATE survey_networks SET data_json = ? WHERE id = ?').run(JSON.stringify(storedNetwork), network.id)
    database.close()

    const listed = JSON.parse(String(listAdjustments(service, 'project-adjustment-admission-route').body)).adjustments as Array<{
      run: { id: string; status: string }
      result: { validation: string }
      rawSourceIntegrity?: { status: string }
      sourceEligibility?: { eligible: boolean; findings: Array<{ code: string }> }
    }>
    const listedAdjustment = listed.find((item) => item.run.id === adjustmentId)
    expect(listedAdjustment).toMatchObject({
      run: { status: 'completed' },
      result: { validation: 'valid' },
      rawSourceIntegrity: { status: 'verified' },
      sourceEligibility: { eligible: false, findings: expect.arrayContaining([expect.objectContaining({ code: 'source_not_adjustment_ready' })]) }
    })

    for (const response of [getSurveyAdjustment(service, adjustmentId), previewAdjustment(service, adjustmentId)]) {
      expect(response.status).toBe(200)
      expect(JSON.parse(String(response.body))).toMatchObject({
        run: { id: adjustmentId, status: 'completed' },
        result: { validation: 'valid' },
        rawSourceIntegrity: { status: 'verified' },
        sourceEligibility: { eligible: false }
      })
    }

    // A later raw-byte failure changes only current admission, not the
    // historical completed result returned by either endpoint.
    await writeFile(join(root, 'sources', network.sourceFile.sha256, 'original'), 'tampered-after-adjustment')
    const failedRead = JSON.parse(String(getSurveyAdjustment(service, adjustmentId).body)) as {
      result: { validation: string }
      rawSourceIntegrity?: { status: string }
      sourceEligibility?: { eligible: boolean }
    }
    expect(failedRead).toMatchObject({ result: { validation: 'valid' }, rawSourceIntegrity: { status: 'failed' }, sourceEligibility: { eligible: false } })

    // If a migration no longer has its network, the adjustment is still
    // readable and the live-admission fields are intentionally absent.
    const missingNetworkDatabase = new Database(join(root, 'survey.sqlite3'))
    missingNetworkDatabase.prepare('DELETE FROM survey_networks WHERE id = ?').run(network.id)
    missingNetworkDatabase.close()
    const missingNetworkRead = JSON.parse(String(getSurveyAdjustment(service, adjustmentId).body)) as Record<string, unknown>
    expect(missingNetworkRead).toMatchObject({ result: { validation: 'valid' } })
    expect('rawSourceIntegrity' in missingNetworkRead).toBe(false)
    expect('sourceEligibility' in missingNetworkRead).toBe(false)
    service.close()
  })

  it('serves immutable adjusted-epoch deformation comparisons', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-deformation-routes-'))
    const service = new SurveyService({ rootDir: root })
    const adjustmentIds: string[] = []
    for (const [index, difference] of [0.2, 0.19].entries()) {
      const imported = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', {
        method: 'POST',
        body: JSON.stringify(workwiseJsonImport('project-deformation-route', 0, `route-deformation-import-${index}`, {
          networkType: 'leveling', coordinateSystem: 'local', projection: 'none', ellipsoid: 'none', verticalDatum: 'datum', unit: 'm', observationEpoch: `2026-01-${index === 0 ? '01' : '11'}T00:00:00.000Z`,
          knownPoints: [{ id: 'BM', height: 1, known: true }], unknownPoints: [{ id: 'P', height: 1 + difference }],
          observations: [{ id: `obs-${index}`, type: 'height-difference', from: 'BM', to: 'P', value: difference, unit: 'm' }]
        }))
      }))
      const network = JSON.parse(String(imported.body)).network as { id: string; revision: number }
      const adjusted = await createAdjustment(service, new Request('http://runtime', { method: 'POST', body: JSON.stringify({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `route-deformation-adjust-${index}` }) }))
      adjustmentIds.push((JSON.parse(String(adjusted.body)) as { run: { id: string } }).run.id)
    }
    const response = await compareDeformation(service, new Request('http://runtime/v1/engineering/deformations', { method: 'POST', body: JSON.stringify({ projectId: 'project-deformation-route', adjustmentIds, expectedRevision: 1, idempotencyKey: 'route-deformation-compare' }) }))
    expect(response.status).toBe(201)
    const deformation = (JSON.parse(String(response.body)) as { deformation: { id: string; points: Array<{ pointId: string; settlement?: number }> } }).deformation
    expect(deformation.points).toEqual(expect.arrayContaining([expect.objectContaining({ pointId: 'P', settlement: expect.closeTo(0.01, 12) })]))
    const listedNetworks = JSON.parse(listSurveyNetworks(service, 'project-deformation-route').body).networks as Array<{
      id: string
      rawSourceIntegrity: { status: string }
      sourceEligibility: { eligible: boolean }
    }>
    expect(listedNetworks).toEqual(expect.arrayContaining([
      expect.objectContaining({ rawSourceIntegrity: expect.objectContaining({ status: 'verified' }), sourceEligibility: expect.objectContaining({ eligible: true }) })
    ]))
    expect(JSON.parse(listAdjustments(service, 'project-deformation-route').body).adjustments).toHaveLength(2)
    expect(JSON.parse(listDeformations(service, 'project-deformation-route').body).deformations).toHaveLength(1)
    expect(getDeformation(service, deformation.id).status).toBe(200)
    service.close()
  })

  it('returns professional source preflight and a stable GNSS processing blocker through HTTP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-format-route-'))
    const service = new SurveyService({ rootDir: root })
    const rinex = '     4.00           O                   RINEX VERSION / TYPE\nSITE                                                        MARKER NAME\n                                                            END OF HEADER\n'
    const response = await importSurveyNetwork(service, new Request('http://runtime/v1/engineering/survey/networks/import', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-rinex-route',
        expectedRevision: 0,
        idempotencyKey: 'route-import-rinex-4',
        name: 'site.rnx',
        dataBase64: Buffer.from(rinex).toString('base64')
      })
    }))
    expect(response.status).toBe(201)
    const network = JSON.parse(String(response.body)).network as { networkType: string; qualityStatus: string; sourceFile: { detection: { format: string; version?: string }; disposition: string; sha256: string }; rawSourceIntegrity: { status: string; ledgerEntryCount: number }; sourceEligibility: { eligible: boolean; findings: Array<{ code: string }> }; findings: Array<{ code: string }> }
    expect(network).toMatchObject({
      networkType: 'gnss',
      qualityStatus: 'blocked',
      sourceFile: { detection: { format: 'rinex-observation', version: '4.00' }, disposition: 'gnss-processing-required' }
    })
    expect(network.sourceFile.sha256).toHaveLength(64)
    expect(network.rawSourceIntegrity).toMatchObject({ status: 'verified', ledgerEntryCount: 1 })
    expect(network.sourceEligibility).toMatchObject({ eligible: false, findings: expect.arrayContaining([expect.objectContaining({ code: 'source_not_adjustment_ready' })]) })
    expect(network.findings).toContainEqual(expect.objectContaining({ code: 'gnss_processing_required' }))
    service.close()
  })

  it('inspects COSA companion groups without opening or parsing the supplied files', async () => {
    const response = await inspectCosaSurveyFileGroups(new Request('http://runtime/v1/engineering/survey/source-groups/cosa/inspect', {
      method: 'POST',
      body: JSON.stringify({ files: [
        { name: 'control.in2', sha256: 'a'.repeat(64), size: 10 },
        { name: 'control.NET', sha256: 'b'.repeat(64), size: 11 },
        { name: 'orphan.ou2', sha256: 'c'.repeat(64), size: 12 }
      ] })
    }))
    expect(response.status).toBe(200)
    expect(JSON.parse(String(response.body))).toMatchObject({
      inspection: {
        groups: expect.arrayContaining([
          expect.objectContaining({ id: 'cosa:control', state: 'ready' }),
          expect.objectContaining({ id: 'cosa:orphan', state: 'blocked', diagnostics: [expect.objectContaining({ code: 'cosa_orphan_result', requiredPrimaryMemberKind: 'in2' })] })
        ]),
        diagnostics: [expect.objectContaining({ code: 'cosa_orphan_result' })]
      }
    })
  })
})
