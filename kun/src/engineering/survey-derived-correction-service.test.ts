import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SurveyService } from './survey-service.js'
import { recordDerivedObservationValueCorrection } from './survey-derived-correction-ledger.js'
import { importWorkwiseSurveyNetwork } from './survey-test-helpers.js'

const frozenPlaneControlNetwork = {
  networkType: 'plane-control' as const,
  coordinateSystem: 'local',
  projection: 'none',
  ellipsoid: 'none',
  verticalDatum: 'none',
  unit: 'm',
  knownPoints: [{ id: 'A', pointClass: 'known' as const, known: true, x: 0, y: 0 }],
  unknownPoints: [{ id: 'P', pointClass: 'unknown' as const, known: false, x: 10, y: 10 }],
  observations: [{
    id: 'a-p-slope-distance',
    type: 'slope-distance' as const,
    from: 'A',
    to: 'P',
    station: 'A',
    target: 'P',
    value: 14.142,
    unit: 'm',
    sigma: 0.001,
    sigmaUnit: 'm'
  }]
}

async function importedSource() {
  const root = await mkdtemp(join(tmpdir(), 'workwise-derived-correction-'))
  const service = new SurveyService({ rootDir: root, nowIso: () => '2026-09-04T00:00:00.000Z' })
  const network = await importWorkwiseSurveyNetwork(service, {
    projectId: 'project-derived-correction', expectedRevision: 0, idempotencyKey: 'derived-correction-import', networkType: 'plane-control',
    network: frozenPlaneControlNetwork
  })
  if (network.sourceFile?.disposition !== 'adjustment-ready') throw new Error('fixture must produce an adjustment-ready frozen source')
  const observation = network.observations.find((item) => item.type === 'slope-distance')
  if (!observation?.sourceRecordId) throw new Error('fixture must produce a raw-source-linked observation')
  const rawHead = service.getRawSourceLedger(network.id)[0]?.thisHash
  if (!rawHead) throw new Error('fixture must create an initial raw-source ledger entry')
  return { root, service, network, observation, rawHead }
}

function correctionInput(input: Awaited<ReturnType<typeof importedSource>>, id: string, afterValue: number, expectedCorrectionHeadHash: string) {
  return {
    id,
    networkId: input.network.id,
    expectedNetworkRevision: input.network.revision,
    idempotencyKey: `correction-${id}`,
    observationId: input.observation.id,
    afterValue,
    reason: '经人工复核确认的派生观测修正',
    basis: { kind: 'manual-review' as const, referenceId: 'review-2026-09-04' },
    operation: { id: 'trusted-manual-entry', version: '1' },
    actor: { id: 'surveyor-1', kind: 'human' as const },
    expectedCorrectionHeadHash
  }
}

describe('SurveyService derived corrections', () => {
  it('writes a separate immutable correction chain and replays it without overwriting source observations', async () => {
   const input = await importedSource()
    const secondConnection = new SurveyService({ rootDir: input.root, nowIso: () => '2026-09-04T00:00:00.000Z' })
   const first = input.service.recordTrustedDerivedObservationValueCorrection(correctionInput(input, 'derived-service-1', input.observation.value + 0.001, input.rawHead))
    const retry = secondConnection.recordTrustedDerivedObservationValueCorrection(correctionInput(input, 'derived-service-1', input.observation.value + 0.001, input.rawHead))
    const second = input.service.recordTrustedDerivedObservationValueCorrection(correctionInput(input, 'derived-service-2', first.after.value + 0.002, first.thisHash))

    expect(retry).toEqual(first)
    expect(() => input.service.recordTrustedDerivedObservationValueCorrection(correctionInput(input, 'derived-service-1', input.observation.value + 0.5, input.rawHead))).toThrow('different request payload')
    expect(input.service.getDerivedCorrectionLedger(input.network.id)).toEqual([first, second])
    expect(input.service.getNetwork(input.network.id)?.observations.find((item) => item.id === input.observation.id)?.value).toBe(input.observation.value)
    expect(input.service.getRawSourceIntegrity(input.network.id)).toMatchObject({ status: 'verified' })
    const replay = input.service.getDerivedCorrectionReplay(input.network.id)
    expect(replay).toMatchObject({ valid: true, correctionCount: 2, correctionLedgerHeadHash: second.thisHash })
    expect(replay.derivedNetwork?.observations.find((item) => item.id === input.observation.id)?.value).toBe(second.after.value)

    expect(() => input.service.recordTrustedDerivedObservationValueCorrection(correctionInput(input, 'derived-stale-head', second.after.value + 0.001, input.rawHead))).toThrow('derived correction head conflict')

    const database = new Database(join(input.root, 'survey.sqlite3'))
    expect(() => database.prepare('UPDATE survey_derived_corrections SET recorded_at = ? WHERE id = ?').run('2026-09-05T00:00:00.000Z', first.id)).toThrow('append-only')
    expect(() => database.prepare('DELETE FROM survey_derived_corrections WHERE id = ?').run(first.id)).toThrow('append-only')
   expect(() => database.prepare('UPDATE survey_raw_source_ledger SET recorded_at = ? WHERE network_id = ?').run('2026-09-05T00:00:00.000Z', input.network.id)).toThrow('append-only')
    const correctionRow = database.prepare('SELECT id, network_id, sequence, raw_source_ledger_initial_hash, data_json, recorded_at FROM survey_derived_corrections WHERE id = ?').get(first.id) as { id: string; network_id: string; sequence: number; raw_source_ledger_initial_hash: string; data_json: string; recorded_at: string }
    expect(() => database.prepare('INSERT OR REPLACE INTO survey_derived_corrections(id, network_id, sequence, raw_source_ledger_initial_hash, data_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?)').run(correctionRow.id, correctionRow.network_id, correctionRow.sequence, correctionRow.raw_source_ledger_initial_hash, correctionRow.data_json, correctionRow.recorded_at)).toThrow('append-only')
    const rawRow = database.prepare('SELECT id, network_id, sequence, source_sha256, data_json, recorded_at FROM survey_raw_source_ledger WHERE network_id = ?').get(input.network.id) as { id: string; network_id: string; sequence: number; source_sha256: string; data_json: string; recorded_at: string }
   expect(() => database.prepare('INSERT OR REPLACE INTO survey_raw_source_ledger(id, network_id, sequence, source_sha256, data_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?)').run(rawRow.id, rawRow.network_id, rawRow.sequence, rawRow.source_sha256, rawRow.data_json, rawRow.recorded_at)).toThrow('append-only')
    // A malformed persisted correction must fail closed on the read-only replay
    // path rather than being interpreted as an empty valid ledger.
    database.exec('DROP TRIGGER survey_derived_corrections_no_update')
    database.prepare('UPDATE survey_derived_corrections SET data_json = ? WHERE id = ?').run('{', first.id)
    expect(input.service.getDerivedCorrectionReplay(input.network.id)).toMatchObject({ valid: false })
    database.close()
    secondConnection.close()
    input.service.close()
  })

  it('refuses legacy or altered raw sources before it permits a correction or a trusted replay', async () => {
    const legacyRoot = await mkdtemp(join(tmpdir(), 'workwise-derived-legacy-'))
    const legacy = new SurveyService({ rootDir: legacyRoot })
    const legacyNetwork = await legacy.importNetwork({
      projectId: 'project-derived-legacy', expectedRevision: 0, idempotencyKey: 'derived-legacy-import', networkType: 'leveling',
      network: {
        networkType: 'leveling', knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }], unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, height: 10.1 }],
        observations: [{ id: 'dh', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm' }]
      }
    })
    expect(() => legacy.recordTrustedDerivedObservationValueCorrection({
      id: 'legacy-derived-1', networkId: legacyNetwork.id, expectedNetworkRevision: legacyNetwork.revision, idempotencyKey: 'legacy-correction-1', observationId: 'dh', afterValue: 0.101,
      reason: '不应允许', basis: { kind: 'manual-review', referenceId: 'review' }, operation: { id: 'manual', version: '1' }, actor: { id: 'surveyor', kind: 'human' }, expectedCorrectionHeadHash: '0'.repeat(64)
    })).toThrow('legacy-unverified')
    legacy.close()

    const input = await importedSource()
    const persisted = correctionInput(input, 'derived-source-retry', input.observation.value + 0.001, input.rawHead)
    input.service.recordTrustedDerivedObservationValueCorrection(persisted)
    const initialOriginal = join(input.root, 'sources', input.network.sourceFile!.sha256, 'original')
    await writeFile(initialOriginal, 'changed-after-import')
    expect(input.service.getDerivedCorrectionReplay(input.network.id)).toMatchObject({ valid: false })
    expect(() => input.service.recordTrustedDerivedObservationValueCorrection(persisted)).toThrow('cannot replay a derived correction while raw source integrity is failed')
    expect(() => input.service.recordTrustedDerivedObservationValueCorrection(correctionInput(input, 'derived-changed-source', input.observation.value + 0.001, input.rawHead))).toThrow('raw source integrity is failed')
    input.service.close()
  })

  it('replays and appends verified adjustment-ready GSI corrections without overwriting the source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-derived-gsi-archive-only-'))
    const service = new SurveyService({ rootDir: root, nowIso: () => '2026-09-04T00:00:00.000Z' })
    const source = Buffer.from('*11....+00000001 21..02+04500000 22..02+09000000 31..00+00123456 81..00+00100000 82..00+00200000 84..00+00000000 85..00+00000000\n')
    const network = await service.importNetwork({
      projectId: 'project-derived-gsi-adjustment-ready',
      expectedRevision: 0,
      idempotencyKey: 'derived-gsi-adjustment-ready-import',
      networkType: 'plane-control',
      name: 'station.gsi',
      dataBase64: source.toString('base64')
    })
    const observation = network.observations.find((item) => item.type === 'slope-distance')
    const initial = service.getRawSourceLedger(network.id)[0]
    if (!observation?.sourceRecordId || !initial) throw new Error('GSI fixture must preserve a raw-linked slope-distance observation')

    // Simulate a historical immutable correction and ensure it remains
    // compatible with the current source-eligibility gate.
    const historicalCorrection = recordDerivedObservationValueCorrection({
      id: 'derived-gsi-historical-1',
      networkId: network.id,
      sequence: 1,
      initialRawSourceLedgerEntry: initial,
      previousHash: initial.thisHash,
      observation,
      beforeValue: observation.value,
      afterValue: observation.value + 0.001,
      sourceAnchorId: observation.sourceRecordId,
      reason: '历史人工复核记录',
      basis: { kind: 'manual-review', referenceId: 'historical-review' },
      operation: { id: 'trusted-manual-entry', version: '1' },
      actor: { id: 'surveyor-1', kind: 'human' },
      occurredAt: '2026-09-04T00:01:00.000Z'
    })
    const database = new Database(join(root, 'survey.sqlite3'))
    database.prepare('INSERT INTO survey_derived_corrections(id, network_id, sequence, raw_source_ledger_initial_hash, data_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      historicalCorrection.id,
      historicalCorrection.networkId,
      historicalCorrection.sequence,
      historicalCorrection.rawSource.rawSourceLedgerInitialHash,
      JSON.stringify(historicalCorrection),
      historicalCorrection.occurredAt
    )
    database.close()

    expect(network.sourceFile?.disposition).toBe('adjustment-ready')
    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'verified' })
    expect(service.getSourceEligibility(network.id)).toMatchObject({ eligible: true })
    expect(service.getDerivedCorrectionLedger(network.id)).toEqual([historicalCorrection])
    const replay = service.getDerivedCorrectionReplay(network.id)
    expect(replay).toMatchObject({ valid: true, correctionCount: 1, correctionLedgerHeadHash: historicalCorrection.thisHash })
    expect(replay.derivedNetwork?.observations.find((item) => item.id === observation.id)?.value).toBe(historicalCorrection.after.value)
    const appendedCorrection = service.recordTrustedDerivedObservationValueCorrection({
      id: 'derived-gsi-new-1',
      networkId: network.id,
      expectedNetworkRevision: network.revision,
      idempotencyKey: 'derived-gsi-new-correction',
      observationId: observation.id,
      afterValue: observation.value + 0.002,
      reason: '经人工复核确认的 GSI 派生数值',
      basis: { kind: 'manual-review', referenceId: 'review-gsi' },
      operation: { id: 'trusted-manual-entry', version: '1' },
      actor: { id: 'surveyor-1', kind: 'human' },
      expectedCorrectionHeadHash: historicalCorrection.thisHash
    })
    expect(service.getDerivedCorrectionLedger(network.id)).toEqual([historicalCorrection, appendedCorrection])
    expect(service.getNetwork(network.id)?.observations.find((item) => item.id === observation.id)?.value).toBe(observation.value)
    service.close()
  })

  it('blocks an idempotent derived-correction replay once its historical source becomes archive-only', async () => {
    const input = await importedSource()
    const request = correctionInput(input, 'derived-source-eligibility-retry', input.observation.value + 0.001, input.rawHead)
    const historicalCorrection = input.service.recordTrustedDerivedObservationValueCorrection(request)
    const database = new Database(join(input.root, 'survey.sqlite3'))
    const row = database.prepare('SELECT data_json FROM survey_networks WHERE id = ?').get(input.network.id) as { data_json: string }
    const storedNetwork = JSON.parse(row.data_json) as { sourceFile: { disposition: string; dispositionReason: string } }
    storedNetwork.sourceFile.disposition = 'archive-only'
    storedNetwork.sourceFile.dispositionReason = '历史来源仅可审计，不得生成派生数值'
    database.prepare('UPDATE survey_networks SET data_json = ? WHERE id = ?').run(JSON.stringify(storedNetwork), input.network.id)
    database.close()

    expect(input.service.getRawSourceIntegrity(input.network.id)).toMatchObject({ status: 'verified' })
    expect(input.service.getDerivedCorrectionLedger(input.network.id)).toEqual([historicalCorrection])
    expect(input.service.getDerivedCorrectionReplay(input.network.id)).toMatchObject({ valid: false })
    expect(() => input.service.recordTrustedDerivedObservationValueCorrection(request)).toThrow('source eligibility is failed')
    expect(input.service.getDerivedCorrectionLedger(input.network.id)).toEqual([historicalCorrection])
    input.service.close()
  })
})
