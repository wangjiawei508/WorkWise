import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { EngineeringService } from './engineering-service.js'
import { SurveyService } from './survey-service.js'

describe('survey results in engineering deliverables', () => {
  it('keeps adjustment results and displacement evidence in manifest and XLSX', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-deliverable-'))
    const workspace = join(root, 'workspace')
    let engineering!: EngineeringService
    const survey = new SurveyService({ rootDir: join(root, 'runtime'), getProject: (id) => engineering.getProject(id) })
    engineering = new EngineeringService({
      rootDir: join(root, 'runtime'),
      getAdjustments: (projectId, ids) => ids.flatMap((id) => {
        const stored = survey.getAdjustment(id)
        return stored?.run.projectId === projectId && stored.result ? [stored.result] : []
      }),
      getDeformations: (projectId, ids) => ids.flatMap((id) => {
        const result = survey.getDeformation(id)
        return result?.projectId === projectId ? [result] : []
      })
    })
    const project = engineering.createProject({ name: '平差成果测试', workspace, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'survey-delivery-project' })
    const network = await survey.importNetwork({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'survey-delivery-import',
      networkType: 'leveling',
      network: {
        coordinateSystem: 'local-grid', projection: 'none', ellipsoid: 'none', verticalDatum: '1985-height', observationEpoch: '2026-08-01T00:00:00.000Z',
        knownPoints: [{ id: 'BM', pointClass: 'known', height: 10, known: true }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 10.1, known: false }],
        observations: [{ id: 'obs-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001 }]
      }
    })
    const checkedNetwork = survey.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-delivery-validate' })
    const adjustment = survey.createAdjustment({ networkId: network.id, expectedRevision: checkedNetwork.revision, idempotencyKey: 'survey-delivery-adjust' })
    expect(adjustment.result.displacements.find((item) => item.pointId === 'P1')?.dH).toBeCloseTo(0, 8)
    const currentNetwork = await survey.importNetwork({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'survey-delivery-import-current',
      networkType: 'leveling',
      network: {
        coordinateSystem: 'local-grid', projection: 'none', ellipsoid: 'none', verticalDatum: '1985-height', observationEpoch: '2026-08-11T00:00:00.000Z',
        knownPoints: [{ id: 'BM', pointClass: 'known', height: 10, known: true }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 10.09, known: false }],
        observations: [{ id: 'obs-2', type: 'height-difference', from: 'BM', to: 'P1', value: 0.09, unit: 'm', sigma: 0.001 }]
      }
    })
    const currentAdjustment = survey.createAdjustment({ networkId: currentNetwork.id, expectedRevision: currentNetwork.revision, idempotencyKey: 'survey-delivery-adjust-current' })
    const deformation = survey.compareDeformation({ projectId: project.id, adjustmentIds: [adjustment.run.id, currentAdjustment.run.id], pairs: [{ id: 'tilt-pair', firstPointId: 'BM', secondPointId: 'P1', kind: 'tilt', baselineM: 10 }], expectedRevision: currentAdjustment.run.revision, idempotencyKey: 'survey-delivery-deformation' })

    const dataset = await engineering.importDataset({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'survey-delivery-dataset',
      name: 'monitoring.csv',
      dataBase64: Buffer.from('point,time,value\nP1,2026-08-01,1\nP1,2026-08-02,2').toString('base64')
    })
    const validated = engineering.validateDataset({ datasetId: dataset.id, expectedRevision: dataset.revision, idempotencyKey: 'survey-delivery-data-validate' })
    const analysis = engineering.createAnalysis({ projectId: project.id, datasetId: dataset.id, expectedRevision: validated.revision, idempotencyKey: 'survey-delivery-analysis' })
    const preview = await engineering.previewReport({ projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, adjustmentIds: [adjustment.run.id, currentAdjustment.run.id], deformationIds: [deformation.id], expectedRevision: validated.revision, idempotencyKey: 'survey-delivery-preview' })
    expect(preview.adjustments.map((item) => item.id)).toEqual([adjustment.result.id, currentAdjustment.result.id])
    expect(preview.deformations.map((item) => item.id)).toEqual([deformation.id])
    const evidencePath = join(workspace, preview.files.find((file) => file.mediaType.includes('spreadsheet'))!.path)
    const workbook = await JSZip.loadAsync(await readFile(evidencePath))
    const workbookXml = await workbook.file('xl/workbook.xml')!.async('text')
    expect(workbookXml).toContain('survey_adjustments')
    expect(workbookXml).toContain('survey_closures')
    expect(workbookXml).toContain('survey_parameters')
    expect(workbookXml).toContain('survey_points')
    expect(workbookXml).toContain('survey_residuals')
    expect(workbookXml).toContain('survey_displacements')
    expect(workbookXml).toContain('deformation_epochs')
    expect(workbookXml).toContain('deformation_points')
    expect(workbookXml).toContain('deformation_pairs')
    const evidenceXml = (await Promise.all(Object.keys(workbook.files)
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .map((name) => workbook.file(name)!.async('text')))).join('\n')
    expect(evidenceXml).toContain('unitWeightStdDevUnit')
    expect(evidenceXml).toContain('strategyId')
    expect(evidenceXml).toContain('algorithmVersion')
    expect(evidenceXml).toContain('dimensionless')
    expect(evidenceXml).toContain('maxPointStdDevUnit')
    expect(evidenceXml).toContain('standardizedResidualUnit')
    const manifest = await engineering.finalize({ projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, adjustmentIds: [adjustment.run.id, currentAdjustment.run.id], deformationIds: [deformation.id], expectedRevision: validated.revision, idempotencyKey: 'survey-delivery-finalize', acknowledgeWarnings: true })
    expect(manifest.adjustments.map((item) => item.id)).toEqual([adjustment.result.id, currentAdjustment.result.id])
    expect(manifest.adjustments[0]?.inputHash).toBe(adjustment.result.inputHash)
    expect(manifest.deformations.map((item) => item.id)).toEqual([deformation.id])
    const docxPath = join(workspace, preview.files.find((file) => file.mediaType.includes('word'))!.path)
    const docx = await JSZip.loadAsync(await readFile(docxPath))
    const documentXml = await docx.file('word/document.xml')!.async('text')
    expect(documentXml).toContain('测量平差结果')
    expect(documentXml).toContain('策略=leveling')
    expect(documentXml).toContain('点位 P1')
    expect(documentXml).toContain('单位权中误差=1（无量纲）')
    expect(documentXml).toContain('最大点位中误差=0.001 m')
    expect(documentXml).toContain('闭合量=无')
    expect(documentXml).toContain('变形期次比较')
    expect(documentXml).toContain('测点 P1')
    expect(documentXml).toContain('倾斜 tilt-pair')
    engineering.close()
    survey.close()
  })
})
