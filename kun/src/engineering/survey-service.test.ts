import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import Database from 'better-sqlite3'
import { SurveyService } from './survey-service.js'

describe('SurveyService', () => {
  it('imports, validates and adjusts a weighted leveling network with traceable results', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-1', expectedRevision: 0, idempotencyKey: 'survey-import-level-1', networkType: 'leveling',
      network: {
        projectId: 'project-1', networkType: 'leveling', knownPoints: [{ id: 'BM1', pointClass: 'known', height: 100, known: true }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 100.2, known: false }],
        observations: [{ id: 'o1', type: 'height-difference', from: 'BM1', to: 'P1', value: 0.2, unit: 'm', sigma: 0.002 }],
        instrumentParameters: {}
      }
    })
    expect(network.id).toMatch(/^network_/)
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-level-1' })
    expect(checked.qualityStatus).toBe('validated')
    const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'survey-adjust-level-1' })
    expect(adjustment.run.status).toBe('completed')
    expect(adjustment.result.validation).toBe('valid')
    expect(adjustment.result.linearUnit).toBe('m')
    expect(adjustment.result.angularUnit).toBe('rad')
    expect(adjustment.result.closure).toEqual({})
    expect(adjustment.result.closureUnits).toEqual({})
    expect(adjustment.result.observations[0]?.unit).toBe('m')
    expect(adjustment.result.points.find((point) => point.id === 'P1')?.height).toBeCloseTo(100.2, 5)
    expect(adjustment.result.inputHash).toBe(adjustment.run.inputHash)
    service.close()
  })

  it('keeps linear and angular residual units separate in a mixed plane network', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-units-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-units', expectedRevision: 0, idempotencyKey: 'survey-import-units-1', networkType: 'plane-control',
      network: {
        projectId: 'project-units', networkType: 'plane-control',
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 10, y: 0, known: false }],
        observations: [
          { id: 'distance-a-p', type: 'distance', from: 'A', to: 'P', value: 10_000, unit: 'mm', sigma: 1, sigmaUnit: 'mm' },
          { id: 'direction-a-p', type: 'direction', from: 'A', to: 'P', value: 100, unit: 'gon', sigma: 1, sigmaUnit: 'arcsec' }
        ]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-units-1' })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'survey-adjust-units-1' })

    expect(output.run.status).toBe('completed')
    expect(output.result.observations.map((item) => item.unit)).toEqual(['m', 'rad'])
    expect(output.result.closureUnits).toMatchObject({ horizontal: 'm', angular: 'rad' })
    expect(output.result.closure.horizontal).toBeCloseTo(0, 12)
    expect(output.result.closure.angular).toBeCloseTo(0, 12)
    service.close()
  })

  it('adds canonical units when reading a legacy stored adjustment without rewriting it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-legacy-units-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({ projectId: 'project-legacy-units', expectedRevision: 0, idempotencyKey: 'survey-import-legacy-units', networkType: 'leveling', network: {
      projectId: 'project-legacy-units', networkType: 'leveling',
      knownPoints: [{ id: 'BM', pointClass: 'known', height: 10, known: true }],
      unknownPoints: [{ id: 'P', pointClass: 'unknown', height: 10.1, known: false }],
      observations: [{ id: 'legacy-observation', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm', sigma: 0.001 }]
    } })
    const created = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'survey-adjust-legacy-units' })
    service.close()

    const db = new Database(join(root, 'survey.sqlite3'))
    const row = db.prepare('SELECT data_json FROM survey_adjustments WHERE id = ?').get(created.run.id) as { data_json: string }
    const legacy = JSON.parse(row.data_json) as { result: { linearUnit?: string; angularUnit?: string; closureUnits?: unknown; observations: Array<{ unit?: string }> } }
    delete legacy.result.linearUnit
    delete legacy.result.angularUnit
    delete legacy.result.closureUnits
    for (const observation of legacy.result.observations) delete observation.unit
    db.prepare('UPDATE survey_adjustments SET data_json = ? WHERE id = ?').run(JSON.stringify(legacy), created.run.id)
    db.close()

    const reopened = new SurveyService({ rootDir: root })
    const restored = reopened.getAdjustment(created.run.id)
    expect(restored?.result?.linearUnit).toBe('m')
    expect(restored?.result?.angularUnit).toBe('rad')
    expect(restored?.result?.closure).toEqual({})
    expect(restored?.result?.closureUnits).toEqual({})
    expect(restored?.result?.observations[0]?.unit).toBe('m')
    reopened.close()
  })

  it('blocks a disconnected network and preserves idempotent imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-'))
    const service = new SurveyService({ rootDir: root })
    const body = {
      projectId: 'project-2', expectedRevision: 0, idempotencyKey: 'survey-import-disconnected', networkType: 'leveling' as const,
      network: {
        projectId: 'project-2', networkType: 'leveling' as const, knownPoints: [{ id: 'BM1', pointClass: 'known' as const, height: 1, known: true }],
        unknownPoints: [{ id: 'P2', pointClass: 'unknown' as const, height: 2, known: false }],
        observations: [{ id: 'o2', type: 'height-difference' as const, from: 'P2', to: 'P2', value: 0, unit: 'm' }], instrumentParameters: {}
      }
    }
    const first = await service.importNetwork(body); const second = await service.importNetwork(body)
    expect(second.id).toBe(first.id)
    const checked = service.validateNetwork(first.id, { expectedRevision: first.revision, idempotencyKey: 'survey-validate-disconnected' })
    expect(checked.qualityStatus).toBe('blocked')
    expect(checked.findings.some((item) => item.code === 'disconnected_network')).toBe(true)
    service.close()
  })

  it('does not fabricate GNSS adjustment without covariance and fixed datum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({ projectId: 'project-3', expectedRevision: 0, idempotencyKey: 'survey-import-gnss-1', network: {
      projectId: 'project-3', networkType: 'gnss', knownPoints: [], unknownPoints: [{ id: 'P1' }], observations: [{ id: 'g1', type: 'gnss-baseline', from: 'P1', to: 'P1', value: 0, unit: 'm' }]
    } })
    const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'survey-adjust-gnss-1' })
    expect(adjustment.run.status).toBe('needs_attention')
    expect(adjustment.result.qualityFindings.some((item) => item.code === 'missing_covariance')).toBe(true)
    service.close()
  })

  it('adjusts a complete GNSS baseline network with covariance and fixed datum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-gnss-valid-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({ projectId: 'project-gnss-valid', expectedRevision: 0, idempotencyKey: 'survey-import-gnss-valid', networkType: 'gnss', network: {
      projectId: 'project-gnss-valid', networkType: 'gnss',
      knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, height: 10, known: true }, { id: 'B', pointClass: 'known', x: 100, y: 0, height: 20, known: true }],
      unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 9.9, y: 19.9, height: 29.9, known: false }],
      observations: [
        { id: 'g1', type: 'gnss-baseline', from: 'A', to: 'P', value: 0, vectorX: 10.001, vectorY: 20, vectorZ: 20, unit: 'm', covariance: [4e-6, 1e-6, 0.2e-6, 1e-6, 9e-6, 0.3e-6, 0.2e-6, 0.3e-6, 4e-6] },
        { id: 'g2', type: 'gnss-baseline', from: 'B', to: 'P', value: 0, vectorX: -90, vectorY: 20.002, vectorZ: 10, unit: 'm', covariance: [4e-6, 1e-6, 0.2e-6, 1e-6, 9e-6, 0.3e-6, 0.2e-6, 0.3e-6, 4e-6] }
      ]
    } })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-gnss-valid' })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'survey-adjust-gnss-valid' })
    expect(output.run.status).toBe('completed')
    expect(output.result.strategyId).toBe('gnss')
    expect(output.result.closure.baseline).toBeDefined()
    expect(output.result.observationCount).toBe(6)
    expect(output.result.unknownCount).toBe(3)
    expect(output.result.redundancy).toBe(3)
    expect(output.result.solverDiagnostics?.rank).toBe(3)
    expect(output.result.points.find((point) => point.id === 'P')).toMatchObject({ x: expect.closeTo(10.0005, 8), y: expect.closeTo(20.001, 8), height: expect.closeTo(30, 8) })
    expect(output.result.observations.map((item) => item.observationId)).toEqual(['g1:x', 'g1:y', 'g1:z', 'g2:x', 'g2:y', 'g2:z'])
    service.close()
  })

  it('imports GNSS ΔX/ΔY/ΔZ aliases and row-major covariance from CSV', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-gnss-csv-'))
    const service = new SurveyService({ rootDir: root })
    const csv = 'type,from,to,dx,dy,dz,unit,covariance\ngnss-baseline,A,P,1000,2000,3000,mm,"1;0.1;0;0.1;2;0;0;0;3"'
    const network = await service.importNetwork({ projectId: 'project-gnss-csv', expectedRevision: 0, idempotencyKey: 'survey-import-gnss-csv', networkType: 'gnss', name: 'baselines.csv', dataBase64: Buffer.from(csv).toString('base64') })
    expect(network.observations[0]).toMatchObject({ value: 0, vectorX: 1000, vectorY: 2000, vectorZ: 3000, unit: 'mm' })
    expect(network.observations[0]?.covariance).toEqual([1, 0.1, 0, 0.1, 2, 0, 0, 0, 3])
    service.close()
  })

  it('imports a multi-sheet XLSX survey network with worksheet provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-xlsx-'))
    const service = new SurveyService({ rootDir: root })
    const workbook = new JSZip()
    const sheet = (point: string) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>type</t></is></c><c r="B1" t="inlineStr"><is><t>from</t></is></c><c r="C1" t="inlineStr"><is><t>to</t></is></c><c r="D1" t="inlineStr"><is><t>value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>height-difference</t></is></c><c r="B2" t="inlineStr"><is><t>BM</t></is></c><c r="C2" t="inlineStr"><is><t>${point}</t></is></c><c r="D2" t="inlineStr"><is><t>1</t></is></c></row></sheetData></worksheet>`
    workbook.file('xl/worksheets/sheet1.xml', sheet('P1')); workbook.file('xl/worksheets/sheet2.xml', sheet('P2'))
    const network = await service.importNetwork({ projectId: 'project-xlsx', expectedRevision: 0, idempotencyKey: 'survey-import-xlsx-1', name: 'survey.xlsx', dataBase64: (await workbook.generateAsync({ type: 'nodebuffer' })).toString('base64'), networkType: 'leveling' })
    expect(network.observations).toHaveLength(2)
    expect(network.observations[0]?.sourceLocator).toContain('sheet1.xml')
    service.close()
  })

  it('normalizes legacy height datum metadata and preserves survey reference fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-json-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-json', expectedRevision: 0, idempotencyKey: 'survey-import-json-1', networkType: 'plane-control',
      network: {
        coordinateSystem: '工程独立坐标系', heightDatum: '项目高程基准',
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 1, y: 1, known: false }],
        observations: [{ id: 'a-p', type: 'direction', from: 'A', to: 'P', value: 45.5, unit: 'deg' }]
      }
    })
    expect(network.coordinateSystem).toBe('工程独立坐标系')
    expect(network.verticalDatum).toBe('项目高程基准')
    service.close()
  })

  it('converts DMS strings from a survey CSV into decimal degrees', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-dms-'))
    const service = new SurveyService({ rootDir: root })
    const csv = 'type,from,to,value,unit\ndirection,A,B,45°30′00″,deg\n'
    const network = await service.importNetwork({ projectId: 'project-dms', expectedRevision: 0, idempotencyKey: 'survey-import-dms-1', networkType: 'plane-control', name: 'angles.csv', dataBase64: Buffer.from(csv).toString('base64') })
    expect(network.observations[0]?.value).toBeCloseTo(45.5, 8)
    service.close()
  })

  it('blocks a declared closed leveling loop when the closure tolerance is exceeded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-closure-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-closure', expectedRevision: 0, idempotencyKey: 'survey-import-closure-1', networkType: 'leveling',
      network: {
        knownPoints: [{ id: 'BM', pointClass: 'known', height: 10, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', height: 10, known: false }],
        observations: [{ id: 'loop', type: 'height-difference', from: 'BM', to: 'BM', value: 0.02, unit: 'm' }],
        instrumentParameters: { closedLoop: 1, closureTolerance: 0.001 }
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-closure-1' })
    expect(checked.qualityStatus).toBe('blocked')
    expect(checked.findings.some((item) => item.code === 'closure_exceeded')).toBe(true)
    service.close()
  })

  it('does not silently use a generic plane strategy for an incomplete traverse', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-traverse-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-traverse', expectedRevision: 0, idempotencyKey: 'survey-import-traverse-1', networkType: 'traverse',
      network: {
        projectId: 'project-traverse', networkType: 'traverse',
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 0, y: 10, known: false }],
        observations: [{ id: 'd1', type: 'distance', from: 'A', to: 'P', value: 10, unit: 'm' }]
      }
    })
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-traverse-1' })
    expect(checked.qualityStatus).toBe('blocked')
    expect(checked.findings.some((item) => item.code === 'invalid_observation' && item.severity === 'blocking')).toBe(true)
    const result = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'survey-adjust-traverse-1' })
    expect(result.run.status).toBe('needs_attention')
    expect(result.result.strategyId).toBe('traverse')
    expect(result.result.qualityFindings.some((item) => item.severity === 'blocking')).toBe(true)
    service.close()
  })

  it('blocks coordinate transformation when no explicit parameters are supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-transform-missing-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-transform-missing', expectedRevision: 0, idempotencyKey: 'survey-import-transform-missing', networkType: 'coordinate-transform',
      network: {
        projectId: 'project-transform-missing', networkType: 'coordinate-transform',
        knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }],
        unknownPoints: [{ id: 'P', pointClass: 'unknown', x: 10, y: 20, known: false }],
        observations: [{ id: 'd1', type: 'distance', from: 'A', to: 'P', value: Math.sqrt(500), unit: 'm' }]
      }
    })
    const result = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'survey-adjust-transform-missing' })
    expect(result.run.status).toBe('needs_attention')
    expect(result.result.qualityFindings.some((item) => item.code === 'missing_datum')).toBe(true)
    service.close()
  })

  it('fits a coordinate transformation from explicit source/target control pairs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-transform-fit-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({ projectId: 'project-transform-fit', expectedRevision: 0, idempotencyKey: 'survey-import-transform-fit', networkType: 'coordinate-transform', network: {
      projectId: 'project-transform-fit', networkType: 'coordinate-transform',
      knownPoints: [{ id: 'A', pointClass: 'known', x: 0, y: 0, known: true }, { id: 'B', pointClass: 'known', x: 10, y: 0, known: true }], unknownPoints: [],
      observations: [
        { id: 'pair-a', type: 'distance', from: 'A', to: 'B', value: 10, unit: 'm', targetX: 5, targetY: 7 },
        { id: 'pair-b', type: 'distance', from: 'B', to: 'A', value: 10, unit: 'm', targetX: 15, targetY: 7 }
      ]
    } })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'survey-adjust-transform-fit' })
    expect(output.run.status).toBe('completed')
    expect(output.result.strategyId).toBe('coordinate-transform')
    expect(output.result.closure.translationX).toBeCloseTo(5, 8)
    expect(output.result.closure.translationY).toBeCloseTo(7, 8)
    expect(output.result.solverDiagnostics?.rank).toBe(4)
    service.close()
  })

  it('imports and fits a 2-D similarity transformation from CSV control pairs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-transform-csv-'))
    const service = new SurveyService({ rootDir: root })
    const csv = [
      'id,type,sourceX,sourceY,targetX,targetY,unit,sigma',
      'A,coordinate-pair,0,0,5,7,m,0.001',
      'B,coordinate-pair,100,0,105,7,m,0.001',
      'C,coordinate-pair,0,100,5,107,m,0.001'
    ].join('\n')
    const network = await service.importNetwork({ projectId: 'project-transform-csv', expectedRevision: 0, idempotencyKey: 'survey-import-transform-csv', networkType: 'coordinate-transform', transformType: 'similarity-2d', name: 'control-pairs.csv', dataBase64: Buffer.from(csv).toString('base64') })
    expect(network.transformType).toBe('similarity-2d')
    expect(network.knownPoints).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'A', x: 0, y: 0 }), expect.objectContaining({ id: 'B', x: 100, y: 0 })]))
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-transform-csv' })
    const output = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'survey-adjust-transform-csv' })
    expect(checked.qualityStatus).toBe('validated')
    expect(output.result.transformType).toBe('similarity-2d')
    expect(output.result.parameters).toMatchObject({ translationX: expect.closeTo(5, 8), translationY: expect.closeTo(7, 8), scalePpm: expect.closeTo(0, 8), rotationRad: expect.closeTo(0, 8) })
    service.close()
  })

  it('persists immutable deformation comparison results from adjusted observation epochs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-deformation-'))
    const service = new SurveyService({ rootDir: root })
    const makeEpoch = async (suffix: string, observationEpoch: string, heightDifference: number) => {
      const network = await service.importNetwork({
        projectId: 'project-deformation', expectedRevision: 0, idempotencyKey: `deformation-import-${suffix}`, networkType: 'leveling', network: {
          networkType: 'leveling', coordinateSystem: 'local-grid', projection: 'none', ellipsoid: 'none', verticalDatum: '1985-height', observationEpoch,
          knownPoints: [{ id: 'BM', pointClass: 'known', height: 100, known: true }],
          unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 100 + heightDifference, known: false }],
          observations: [{ id: `dh-${suffix}`, type: 'height-difference', from: 'BM', to: 'P1', value: heightDifference, unit: 'm', sigma: 0.0002 }]
        }
      })
      return service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `deformation-adjust-${suffix}` })
    }
    const reference = await makeEpoch('reference', '2026-01-01T00:00:00.000Z', 0.2)
    const current = await makeEpoch('current', '2026-01-11T00:00:00.000Z', 0.19)
    const comparison = service.compareDeformation({
      projectId: 'project-deformation', adjustmentIds: [current.run.id, reference.run.id],
      pairs: [{ id: 'tilt-BM-P1', firstPointId: 'BM', secondPointId: 'P1', kind: 'tilt', baselineM: 10 }],
      stabilityRateMPerDay: 0.0001, expectedRevision: current.run.revision, idempotencyKey: 'deformation-compare-001'
    })

    expect(comparison.referenceAdjustmentId).toBe(reference.run.id)
    expect(comparison.currentAdjustmentId).toBe(current.run.id)
    expect(comparison.durationDays).toBe(10)
    expect(comparison.points.find((point) => point.pointId === 'P1')).toMatchObject({
      dH: expect.closeTo(-0.01, 12), settlement: expect.closeTo(0.01, 12),
      trend: 'settling', rates: { settlementPerDay: expect.closeTo(0.001, 12) }
    })
    expect(comparison.pairs[0]).toMatchObject({ differentialSettlement: expect.closeTo(0.01, 12), tilt: expect.closeTo(0.001, 12) })
    expect(service.getDeformation(comparison.id)?.inputHash).toBe(comparison.inputHash)
    expect(service.listDeformations('project-deformation')).toHaveLength(1)

    const reused = service.compareDeformation({
      projectId: 'project-deformation', adjustmentIds: [reference.run.id, current.run.id], pairs: [{ id: 'tilt-BM-P1', firstPointId: 'BM', secondPointId: 'P1', kind: 'tilt', baselineM: 10 }],
      stabilityRateMPerDay: 0.0001, expectedRevision: current.run.revision, idempotencyKey: 'deformation-compare-002'
    })
    expect(reused.id).toBe(comparison.id)
    expect(service.listDeformations('project-deformation')).toHaveLength(1)
    service.close()
  })

  it('blocks deformation comparison when epoch datum metadata differs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-deformation-datum-'))
    const service = new SurveyService({ rootDir: root })
    const adjustmentIds: string[] = []
    for (const [index, verticalDatum] of ['datum-a', 'datum-b'].entries()) {
      const network = await service.importNetwork({
        projectId: 'project-deformation-datum', expectedRevision: 0, idempotencyKey: `datum-import-${index}`, networkType: 'leveling', network: {
          networkType: 'leveling', coordinateSystem: 'local-grid', projection: 'none', ellipsoid: 'none', verticalDatum, observationEpoch: `2026-01-0${index + 1}T00:00:00.000Z`,
          knownPoints: [{ id: 'BM', pointClass: 'known', height: 100, known: true }], unknownPoints: [{ id: 'P', pointClass: 'unknown', height: 100.2, known: false }],
          observations: [{ id: `dh-${index}`, type: 'height-difference', from: 'BM', to: 'P', value: 0.2 - index * 0.001, unit: 'm', sigma: 0.0002 }]
        }
      })
      adjustmentIds.push(service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `datum-adjust-${index}` }).run.id)
    }
    expect(() => service.compareDeformation({ projectId: 'project-deformation-datum', adjustmentIds, expectedRevision: 1, idempotencyKey: 'datum-compare-001' })).toThrow('identical coordinate system')
    service.close()
  })
})
