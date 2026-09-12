import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { win32 } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { isSurveyRuntimePathContained, SurveyService } from './survey-service.js'

describe('SurveyService raw-source integrity', () => {
  it('uses platform-aware source-path containment', () => {
    const windowsPaths = { relative: win32.relative, isAbsolute: win32.isAbsolute, sep: win32.sep }
    expect(isSurveyRuntimePathContained('C:\\survey-runtime', 'C:\\survey-runtime\\sources\\abc\\original', windowsPaths)).toBe(true)
    expect(isSurveyRuntimePathContained('C:\\survey-runtime', 'C:\\other\\original', windowsPaths)).toBe(false)
  })

  it('records real imported bytes, rechecks them before validation, and blocks a changed original', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-raw-source-integrity-'))
    const service = new SurveyService({ rootDir: root, nowIso: () => '2026-09-04T00:00:00.000Z' })
    const network = await service.importNetwork({
      projectId: 'project-1',
      expectedRevision: 0,
      idempotencyKey: 'raw-source-integrity-import',
      networkType: 'leveling',
      name: 'leveling.json',
      dataBase64: Buffer.from(JSON.stringify({
        format: 'workwise-survey-network',
        formatVersion: 1,
        network: {
          networkType: 'leveling',
          coordinateSystem: 'CGCS2000',
          projection: 'Gauss-Kruger',
          ellipsoid: 'CGCS2000',
          verticalDatum: '1985 National Height Datum',
          unit: 'm',
          knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
          unknownPoints: [{ id: 'P1', pointClass: 'unknown', known: false, height: 10.1 }],
          observations: [{ id: 'dh-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }]
        }
      })).toString('base64')
    })

    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'verified', ledgerEntryCount: 1, errors: [] })
    expect(network.observations[0]?.sourceRecordId).toBe('workwise-json-observation-1')
    expect(network.sourceFile?.rawRecordAnchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: network.observations[0]?.sourceRecordId, section: 'network.observations' })
    ]))
    const validated = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'raw-source-integrity-validate' })
    expect(validated.qualityStatus).toBe('validated')
    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'verified', ledgerEntryCount: 2, errors: [] })
    const replayed = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'raw-source-integrity-validate' })
    expect(replayed).toEqual(validated)
    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'verified', ledgerEntryCount: 2, errors: [] })
    const validAdjustment = service.createAdjustment({ networkId: network.id, expectedRevision: validated.revision, idempotencyKey: 'raw-source-integrity-adjust-before-change' })
    expect(validAdjustment.result.validation).toBe('valid')
    expect(validAdjustment.result.observations[0]?.sourceRecordId).toBe(network.observations[0]?.sourceRecordId)

    await writeFile(join(root, 'sources', network.sourceFile!.sha256, 'original'), 'changed-after-import')

    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'failed' })
    // A prior "validated" snapshot remains historical evidence only. Its
    // idempotency key must not make the UI report validation success after
    // the source bytes have changed.
    expect(() => service.validateNetwork(network.id, {
      expectedRevision: network.revision,
      idempotencyKey: 'raw-source-integrity-validate'
    })).toThrow(/历史校核 .*原始资料不再满足可平差门禁/)
    const blocked = service.validateNetwork(network.id, { expectedRevision: validated.revision, idempotencyKey: 'raw-source-integrity-validate-after-change' })
    expect(blocked.qualityStatus).toBe('blocked')
    expect(blocked.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'raw_source_integrity', severity: 'blocking' })]))
    const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: blocked.revision, idempotencyKey: 'raw-source-integrity-adjust-after-change' })
    expect(adjustment.result.validation).toBe('invalid')
    expect(adjustment.result.qualityFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'raw_source_integrity', severity: 'blocking' })]))
    service.close()
  })

 it('keeps legacy structured network input readable but explicitly unverified', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-legacy-network-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-1',
      expectedRevision: 0,
      idempotencyKey: 'raw-source-integrity-legacy',
      network: {
        networkType: 'leveling',
        coordinateSystem: 'CGCS2000',
        projection: 'Gauss-Kruger',
        ellipsoid: 'CGCS2000',
        verticalDatum: '1985 National Height Datum',
        knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', known: false, height: 10.1 }],
        observations: [{ id: 'dh-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001 }]
      }
    })

    expect(service.getRawSourceIntegrity(network.id)).toEqual({
      status: 'legacy-unverified',
      ledgerEntryCount: 0,
      errors: ['原始资料未由当前导入链路验证；请从保留的原始文件重新导入后再用于正式交付。']
    })
    const validated = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'raw-source-integrity-legacy-validate' })
    expect(validated.qualityStatus).toBe('blocked')
    expect(validated.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'raw_source_integrity', severity: 'blocking' })]))
    const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: validated.revision, idempotencyKey: 'raw-source-integrity-legacy-adjust' })
    expect(adjustment.run.status).toBe('needs_attention')
    expect(adjustment.result.qualityFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'raw_source_integrity', severity: 'blocking', message: expect.stringContaining('尚未验证') })]))
    service.close()
  })

  it('fails closed when a durable raw-source ledger row is malformed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-corrupt-raw-ledger-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-corrupt-ledger', expectedRevision: 0, idempotencyKey: 'corrupt-ledger-import', networkType: 'leveling',
      name: 'leveling.json', dataBase64: Buffer.from(JSON.stringify({ format: 'workwise-survey-network', formatVersion: 1, network: { networkType: 'leveling', unit: 'm', knownPoints: [], unknownPoints: [], observations: [] } })).toString('base64')
    })
    const database = new Database(join(root, 'survey.sqlite3'))
    database.exec('DROP TRIGGER survey_raw_source_ledger_no_update')
    database.prepare('UPDATE survey_raw_source_ledger SET data_json = ? WHERE network_id = ?').run('{', network.id)
    database.close()

    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'failed' })
    expect(service.getDerivedCorrectionReplay(network.id)).toMatchObject({ valid: false })
    service.close()
  })

  it('binds parser-derived source semantics to the immutable admission record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-source-admission-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-source-admission',
      expectedRevision: 0,
      idempotencyKey: 'source-admission-import',
      networkType: 'leveling',
      name: 'leveling.json',
      dataBase64: Buffer.from(JSON.stringify({
        format: 'workwise-survey-network',
        formatVersion: 1,
        network: {
          networkType: 'leveling',
          coordinateSystem: 'CGCS2000',
          projection: 'Gauss-Kruger',
          ellipsoid: 'CGCS2000',
          verticalDatum: '1985 National Height Datum',
          unit: 'm',
          knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
          unknownPoints: [{ id: 'P1', pointClass: 'unknown', known: false, height: 10.1 }],
          observations: [{ id: 'dh-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }]
        }
      })).toString('base64')
    })
    expect(service.getSourceEligibility(network.id)).toMatchObject({ eligible: true })
    const completed = service.createAdjustment({
      networkId: network.id,
      expectedRevision: network.revision,
      idempotencyKey: 'source-admission-adjust-replay'
    })
    expect(completed).toMatchObject({ run: { status: 'completed' }, result: { validation: 'valid' } })

    const database = new Database(join(root, 'survey.sqlite3'))
    try {
      expect(database.prepare('SELECT COUNT(*) AS count FROM survey_source_admissions WHERE network_id = ?').get(network.id)).toEqual({ count: 1 })
      const row = database.prepare('SELECT data_json FROM survey_networks WHERE id = ?').get(network.id) as { data_json: string }
      const tampered = JSON.parse(row.data_json) as { sourceFile: { parserVersion: string } }
      tampered.sourceFile.parserVersion = 'tampered-parser-version'
      database.prepare('UPDATE survey_networks SET data_json = ? WHERE id = ?').run(JSON.stringify(tampered), network.id)
    } finally {
      database.close()
    }

    // The preserved bytes still hash correctly; semantic parser metadata and
    // solver admission must independently prevent a new calculation.
    expect(service.getRawSourceIntegrity(network.id)).toMatchObject({ status: 'verified' })
    expect(service.getSourceEligibility(network.id)).toMatchObject({
      eligible: false,
      findings: expect.arrayContaining([
        expect.objectContaining({ code: 'raw_source_integrity', message: expect.stringContaining('来源准入证据无效') })
      ])
    })
    // A historical result remains visible for audit, but the same adjustment
    // idempotency key must not revive it once parser-derived admission no
    // longer matches the append-only record.
    expect(service.getAdjustment(completed.run.id)).toMatchObject({ run: { status: 'completed' }, result: { validation: 'valid' } })
    expect(() => service.getAdjustmentForNewUse(completed.run.id)).toThrow(/source is not currently eligible/)
    expect(() => service.createAdjustment({
      networkId: network.id,
      expectedRevision: network.revision,
      idempotencyKey: 'source-admission-adjust-replay'
    })).toThrow(/历史平差 .*原始资料不再满足可平差门禁/)
    expect(service.createAdjustment({
      networkId: network.id,
      expectedRevision: network.revision,
      idempotencyKey: 'source-admission-adjust-after-tamper'
    })).toMatchObject({ run: { status: 'needs_attention' }, result: { validation: 'invalid' } })
    service.close()
  })

  it('keeps a tampered adjustment readable as history but rejects it for new evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-adjustment-evidence-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-adjustment-evidence',
      expectedRevision: 0,
      idempotencyKey: 'adjustment-evidence-import',
      networkType: 'leveling',
      name: 'leveling.json',
      dataBase64: Buffer.from(JSON.stringify({
        format: 'workwise-survey-network',
        formatVersion: 1,
        network: {
          networkType: 'leveling',
          coordinateSystem: 'CGCS2000',
          projection: 'Gauss-Kruger',
          ellipsoid: 'CGCS2000',
          verticalDatum: '1985 National Height Datum',
          unit: 'm',
          knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
          unknownPoints: [{ id: 'P1', pointClass: 'unknown', known: false, height: 10.1 }],
          observations: [{ id: 'dh-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }]
        }
      })).toString('base64')
    })
    const adjustment = service.createAdjustment({
      networkId: network.id,
      expectedRevision: network.revision,
      idempotencyKey: 'adjustment-evidence-calculate'
    })
    expect(adjustment).toMatchObject({ run: { status: 'completed' }, result: { validation: 'valid' } })

    const database = new Database(join(root, 'survey.sqlite3'))
    try {
      expect(database.prepare('SELECT COUNT(*) AS count FROM survey_adjustment_evidence WHERE adjustment_id = ?').get(adjustment.run.id)).toEqual({ count: 1 })
      const row = database.prepare('SELECT data_json FROM survey_adjustments WHERE id = ?').get(adjustment.run.id) as { data_json: string }
      const tampered = JSON.parse(row.data_json) as { result: { points: Array<{ id: string; height?: number }> } }
      const point = tampered.result.points.find((item) => item.id === 'P1')
      if (!point || point.height === undefined) throw new Error('fixture adjustment must contain P1 height')
      point.height += 1
      database.prepare('UPDATE survey_adjustments SET data_json = ? WHERE id = ?').run(JSON.stringify(tampered), adjustment.run.id)
    } finally {
      database.close()
    }

    // The historical read endpoint remains intentionally available for audit,
    // but no new deformation/report/delivery path can accept altered numbers.
    expect(service.getAdjustment(adjustment.run.id)?.result?.points.find((item) => item.id === 'P1')?.height).toBeCloseTo(11.1, 8)
    expect(() => service.getAdjustmentForNewUse(adjustment.run.id)).toThrow(/immutable result evidence is invalid|fresh deterministic calculation/)
    expect(() => service.createAdjustment({
      networkId: network.id,
      expectedRevision: network.revision,
      idempotencyKey: 'adjustment-evidence-calculate'
    })).toThrow(/immutable result evidence is invalid|fresh deterministic calculation/)
    service.close()
  })

  it('never reissues forged validation or import projections from generic idempotency storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-idempotency-projection-'))
    const service = new SurveyService({ rootDir: root })
    const request = {
      projectId: 'project-idempotency-projection',
      expectedRevision: 0,
      idempotencyKey: 'idempotency-projection-import',
      networkType: 'leveling' as const,
      name: 'leveling.json',
      dataBase64: Buffer.from(JSON.stringify({
        format: 'workwise-survey-network',
        formatVersion: 1,
        network: {
          networkType: 'leveling',
          coordinateSystem: 'CGCS2000', projection: 'Gauss-Kruger', ellipsoid: 'CGCS2000', verticalDatum: '1985 National Height Datum', unit: 'm',
          knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
          unknownPoints: [{ id: 'P1', pointClass: 'unknown', known: false, height: 10.1 }],
          observations: [{ id: 'dh-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }]
        }
      })).toString('base64')
    }
    const network = await service.importNetwork(request)
    const validated = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'idempotency-projection-validate' })
    const database = new Database(join(root, 'survey.sqlite3'))
    try {
      const validationRow = database.prepare('SELECT result_json FROM survey_idempotency WHERE key = ?').get('idempotency-projection-validate') as { result_json: string }
      const forgedValidation = { ...validated, projectId: 'forged-project', qualityStatus: 'validated', findings: [] }
      database.prepare('UPDATE survey_idempotency SET result_json = ? WHERE key = ?').run(JSON.stringify(forgedValidation), 'idempotency-projection-validate')
      expect(() => service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'idempotency-projection-validate' }))
        .toThrow(/no bound durable validation evidence/)
      database.prepare('UPDATE survey_idempotency SET result_json = ? WHERE key = ?').run(validationRow.result_json, 'idempotency-projection-validate')
      expect(service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'idempotency-projection-validate' }))
        .toEqual(validated)

      const importRow = database.prepare('SELECT result_json FROM survey_idempotency WHERE key = ?').get(request.idempotencyKey) as { result_json: string }
      const forgedImport = JSON.parse(importRow.result_json) as { network: { observations: Array<{ value: number }> } }
      forgedImport.network.observations[0]!.value = 999
      database.prepare('UPDATE survey_idempotency SET result_json = ? WHERE key = ?').run(JSON.stringify(forgedImport), request.idempotencyKey)
      await expect(service.importNetwork(request)).rejects.toThrow(/no longer matches its durable record|projection differs from its durable network/)
      expect(service.getNetwork(network.id)?.observations[0]?.value).toBe(0.1)
    } finally {
      database.close()
      service.close()
    }
  })

  it('recomputes validation gates instead of trusting a deleted closure finding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-current-validation-gate-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-current-validation-gate',
      expectedRevision: 0,
      idempotencyKey: 'current-validation-gate-import',
      networkType: 'leveling',
      name: 'closed-leveling.json',
      dataBase64: Buffer.from(JSON.stringify({
        format: 'workwise-survey-network',
        formatVersion: 1,
        network: {
          networkType: 'leveling',
          coordinateSystem: 'CGCS2000',
          projection: 'Gauss-Kruger',
          ellipsoid: 'CGCS2000',
          verticalDatum: '1985 National Height Datum',
          unit: 'm',
          instrumentParameters: { closureTolerance: 0.001 },
          knownPoints: [
            { id: 'BM', pointClass: 'known', known: true, height: 10 },
            { id: 'END', pointClass: 'known', known: true, height: 10 }
          ],
          unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, height: 10.02 }],
          observations: [
            { id: 'dh-1', type: 'height-difference', from: 'BM', to: 'P', value: 0.02, unit: 'm', sigma: 0.001, sigmaUnit: 'm' },
            { id: 'dh-2', type: 'height-difference', from: 'P', to: 'END', value: 0.02, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }
          ]
        }
      })).toString('base64')
    })
    const validated = service.validateNetwork(network.id, {
      expectedRevision: network.revision,
      idempotencyKey: 'current-validation-gate-validate'
    })
    expect(validated.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'closure_exceeded', severity: 'blocking' })
    ]))

    const database = new Database(join(root, 'survey.sqlite3'))
    try {
      const row = database.prepare('SELECT data_json FROM survey_networks WHERE id = ?').get(network.id) as { data_json: string }
      const tampered = JSON.parse(row.data_json) as { findings: Array<{ code: string }> }
      tampered.findings = tampered.findings.filter((item) => item.code !== 'closure_exceeded')
      database.prepare('UPDATE survey_networks SET data_json = ? WHERE id = ?').run(JSON.stringify(tampered), network.id)
    } finally {
      database.close()
    }

    // The source bytes and source-admission record are unchanged. The run is
    // still blocked because the closure test is recreated from observations,
    // not recovered from the mutable historical finding array.
    expect(service.getSourceEligibility(network.id)).toMatchObject({ eligible: true })
    expect(service.createAdjustment({
      networkId: network.id,
      expectedRevision: validated.revision,
      idempotencyKey: 'current-validation-gate-adjust'
    })).toMatchObject({
      run: { status: 'needs_attention' },
      result: {
        validation: 'invalid',
        qualityFindings: expect.arrayContaining([
          expect.objectContaining({ code: 'closure_exceeded', severity: 'blocking' })
        ])
      }
    })
    service.close()
  })
})
