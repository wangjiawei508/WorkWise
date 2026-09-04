import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EngineeringService } from '../../engineering/engineering-service.js'
import { SurveyService } from '../../engineering/survey-service.js'
import { buildRailwiseToolProviders } from './railwise-tool-provider.js'

describe('RailWise survey tool bridge', () => {
  it('validates, adjusts and reads a bounded strategy-correct result with explicit units', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-railwise-survey-tools-'))
    let survey!: SurveyService
    const engineering = new EngineeringService({
      rootDir: root,
      getAdjustments: (projectId, ids) => ids.flatMap((id) => {
        const stored = survey.getAdjustment(id)
        return stored?.run.projectId === projectId && stored.result ? [stored.result] : []
      })
    })
    survey = new SurveyService({ rootDir: root, getProject: (id) => engineering.getProject(id) })
    const project = engineering.createProject({ name: '工具桥接', workspace: root, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'railwise-tool-project' })
    const network = await survey.importNetwork({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'railwise-tool-network', networkType: 'leveling', network: {
      knownPoints: [{ id: 'BM', pointClass: 'known', height: 10, known: true }],
      unknownPoints: [{ id: 'P', pointClass: 'unknown', height: 10.1, known: false }],
      observations: [
        { id: 'BM-P', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm', routeLength: 1 },
        { id: 'P-BM', type: 'height-difference', from: 'P', to: 'BM', value: -0.099, unit: 'm', routeLength: 4 }
      ]
    } })
    const tools = buildRailwiseToolProviders(engineering, survey)[0]!.tools
    const execute = async (name: string, args: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name)
      expect(tool, `missing tool ${name}`).toBeDefined()
      return tool!.execute(args, {} as never)
    }

    const validated = await execute('survey_network_validate', { networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'railwise-tool-validate' })
    expect(validated.isError).not.toBe(true)
    expect(validated.output).toMatchObject({ network: { id: network.id, networkType: 'leveling', observationCount: 2, qualityStatus: 'validated', revision: 2 } })

    const wrongStrategy = await execute('cpiii_adjustment', { networkId: network.id, expectedRevision: 2 })
    expect(wrongStrategy).toMatchObject({ isError: true, output: { error: expect.stringContaining('expected cpiii-free-station, cpiii-resection') } })

    const adjusted = await execute('survey_calculator', { networkId: network.id, expectedRevision: 2, idempotencyKey: 'railwise-tool-adjust' })
    expect(adjusted.isError).not.toBe(true)
    expect(adjusted.output).toMatchObject({
      result: {
        strategyId: 'leveling',
        unitWeightStdDevUnit: 'dimensionless',
        varianceFactorUnit: 'dimensionless',
        observations: expect.arrayContaining([expect.objectContaining({ standardizedResidualUnit: 'sigma' })])
      },
      boundedOutput: { observationsReturned: 2, observationsTotal: 2, covarianceStored: true }
    })
    const adjustedRunId = (adjusted.output as { run: { id: string } }).run.id

    const read = await execute('survey_adjustment_read', { networkId: network.id })
    expect(read.output).toMatchObject({ run: { id: adjustedRunId }, result: { strategyId: 'leveling' } })

    const dataset = await engineering.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'railwise-tool-dataset', name: 'monitoring.csv', dataBase64: Buffer.from('point,time,value\nP,2026-09-01,1\nP,2026-09-02,2').toString('base64') })
    const checkedDataset = engineering.validateDataset({ datasetId: dataset.id, expectedRevision: dataset.revision, idempotencyKey: 'railwise-tool-dataset-check' })
    const analysis = engineering.createAnalysis({ projectId: project.id, datasetId: dataset.id, expectedRevision: checkedDataset.revision, idempotencyKey: 'railwise-tool-analysis' })
    const report = await execute('report_export', { projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, adjustmentIds: [adjustedRunId], expectedRevision: checkedDataset.revision, idempotencyKey: 'railwise-tool-report' })
    expect(report.isError).not.toBe(true)
    expect(report.output).toMatchObject({ adjustments: [expect.objectContaining({ runId: adjustedRunId, strategyId: 'leveling' })] })

    survey.close()
    engineering.close()
  })
})
