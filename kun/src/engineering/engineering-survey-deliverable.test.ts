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
      })
    })
    const project = engineering.createProject({ name: '平差成果测试', workspace, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'survey-delivery-project' })
    const network = await survey.importNetwork({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'survey-delivery-import',
      networkType: 'leveling',
      network: {
        knownPoints: [{ id: 'BM', pointClass: 'known', height: 10, known: true }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 10.1, known: false }],
        observations: [{ id: 'obs-1', type: 'height-difference', from: 'BM', to: 'P1', value: 0.1, unit: 'm', sigma: 0.001 }]
      }
    })
    const checkedNetwork = survey.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-delivery-validate' })
    const adjustment = survey.createAdjustment({ networkId: network.id, expectedRevision: checkedNetwork.revision, idempotencyKey: 'survey-delivery-adjust' })
    expect(adjustment.result.displacements.find((item) => item.pointId === 'P1')?.dH).toBeCloseTo(0, 8)

    const dataset = await engineering.importDataset({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'survey-delivery-dataset',
      name: 'monitoring.csv',
      dataBase64: Buffer.from('point,time,value\nP1,2026-08-01,1\nP1,2026-08-02,2').toString('base64')
    })
    const validated = engineering.validateDataset({ datasetId: dataset.id, expectedRevision: dataset.revision, idempotencyKey: 'survey-delivery-data-validate' })
    const analysis = engineering.createAnalysis({ projectId: project.id, datasetId: dataset.id, expectedRevision: validated.revision, idempotencyKey: 'survey-delivery-analysis' })
    const preview = await engineering.previewReport({ projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, adjustmentIds: [adjustment.run.id], expectedRevision: validated.revision, idempotencyKey: 'survey-delivery-preview' })
    expect(preview.adjustments.map((item) => item.id)).toEqual([adjustment.result.id])
    const evidencePath = join(workspace, preview.files.find((file) => file.mediaType.includes('spreadsheet'))!.path)
    const workbook = await JSZip.loadAsync(await readFile(evidencePath))
    const workbookXml = await workbook.file('xl/workbook.xml')!.async('text')
    expect(workbookXml).toContain('survey_adjustments')
    expect(workbookXml).toContain('survey_displacements')
    const manifest = await engineering.finalize({ projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, adjustmentIds: [adjustment.run.id], expectedRevision: validated.revision, idempotencyKey: 'survey-delivery-finalize', acknowledgeWarnings: true })
    expect(manifest.adjustments.map((item) => item.id)).toEqual([adjustment.result.id])
    expect(manifest.adjustments[0]?.inputHash).toBe(adjustment.result.inputHash)
    const docxPath = join(workspace, preview.files.find((file) => file.mediaType.includes('word'))!.path)
    const docx = await JSZip.loadAsync(await readFile(docxPath))
    expect(await docx.file('word/document.xml')!.async('text')).toContain('测量平差结果')
    engineering.close()
    survey.close()
  })
})
