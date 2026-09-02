import type { EngineeringService } from '../../engineering/engineering-service.js'
import type { CapabilityToolProvider } from './capability-registry.js'
import { LocalToolHost } from './local-tool-host.js'

/**
 * Compatibility bridge for the reviewed RailWise tool IDs. The aliases call
 * the same deterministic EngineeringService used by the GUI, so a model can
 * explain results without becoming the source of numeric truth.
 */
export function buildRailwiseToolProviders(service: EngineeringService): CapabilityToolProvider[] {
  const datasetSummary = (dataset: Awaited<ReturnType<EngineeringService['importDataset']>>) => ({
    id: dataset.id,
    projectId: dataset.projectId,
    sourceFileName: dataset.sourceFileName,
    sourceFileHash: dataset.sourceFileHash,
    rowCount: dataset.rowCount,
    observationCount: dataset.observationCount,
    status: dataset.status,
    revision: dataset.revision,
    unknownColumns: dataset.unknownColumns,
    findings: dataset.findings.map((finding) => ({ id: finding.id, code: finding.code, severity: finding.severity, status: finding.status, row: finding.row, message: finding.message, suggestion: finding.suggestion }))
  })
  const make = (name: string, description: string, inputSchema: Record<string, unknown>, execute: (args: Record<string, unknown>) => Promise<{ output: unknown; isError?: boolean }>) => LocalToolHost.defineTool({ name, description, inputSchema, policy: 'auto', execute: async (args) => execute(args) })
  const analysis = async (args: Record<string, unknown>) => {
    if (typeof args.projectId !== 'string' || typeof args.datasetId !== 'string') return { output: { error: 'projectId and datasetId are required' }, isError: true }
    return { output: { analysis: service.createAnalysis({ projectId: args.projectId, datasetId: args.datasetId, expectedRevision: Number(args.expectedRevision ?? 0), idempotencyKey: String(args.idempotencyKey ?? `railwise-${args.datasetId}`) }) } }
  }
  const chart = async (args: Record<string, unknown>) => {
    if (typeof args.analysisId !== 'string') return { output: { error: 'analysisId is required' }, isError: true }
    return { output: { chart: await service.createChart({ analysisId: args.analysisId, chartType: String(args.chartType ?? 'trend'), expectedRevision: 0, idempotencyKey: String(args.idempotencyKey ?? `railwise-chart-${args.analysisId}`) }) } }
  }
  const tools = [
    make('monitoring_csv', 'Normalize a managed monitoring dataset without sending raw rows to a model.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, analysis),
    make('railwise.monitoring_csv', 'RailWise namespaced alias for monitoring_csv.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, analysis),
    make('deformation_rate', 'Calculate deterministic monitoring change rates and trends.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, analysis),
    make('railwise.deformation_rate', 'RailWise namespaced alias for deformation_rate.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, analysis),
    make('monitoring_data_first_check', 'Run deterministic quality checks for a monitoring dataset.', { type: 'object', properties: { datasetId: { type: 'string' }, expectedRevision: { type: 'integer' } }, required: ['datasetId'] }, async (args) => ({ output: { dataset: datasetSummary(service.validateDataset({ datasetId: args.datasetId, expectedRevision: Number(args.expectedRevision ?? 0), idempotencyKey: String(args.idempotencyKey ?? `railwise-check-${args.datasetId}`) })) } })),
    make('railwise.monitoring_data_first_check', 'RailWise namespaced alias for monitoring_data_first_check.', { type: 'object', properties: { datasetId: { type: 'string' } }, required: ['datasetId'] }, async (args) => ({ output: { dataset: datasetSummary(service.validateDataset({ datasetId: args.datasetId, expectedRevision: 0, idempotencyKey: String(args.idempotencyKey ?? `railwise-check-${args.datasetId}`) })) } })),
    make('chart_generator', 'Generate a validated SVG monitoring trend chart.', { type: 'object', properties: { analysisId: { type: 'string' }, chartType: { type: 'string' } }, required: ['analysisId'] }, chart),
    make('railwise.chart_generator', 'RailWise namespaced alias for chart_generator.', { type: 'object', properties: { analysisId: { type: 'string' }, chartType: { type: 'string' } }, required: ['analysisId'] }, chart),
    make('report_export', 'Export a reviewable report from deterministic analysis.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, async (args) => ({ output: await service.previewReport({ projectId: args.projectId, datasetId: args.datasetId, expectedRevision: 0, idempotencyKey: String(args.idempotencyKey ?? `railwise-report-${args.datasetId}`) }) })),
    make('railwise.report_export', 'RailWise namespaced alias for report_export.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, async (args) => ({ output: await service.previewReport({ projectId: args.projectId, datasetId: args.datasetId, expectedRevision: 0, idempotencyKey: String(args.idempotencyKey ?? `railwise-report-${args.datasetId}`) }) })),
    make('excel_export', 'Export the XLSX evidence package for an engineering run.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, async (args) => ({ output: await service.previewReport({ projectId: args.projectId, datasetId: args.datasetId, expectedRevision: 0, idempotencyKey: String(args.idempotencyKey ?? `railwise-xlsx-${args.datasetId}`) }) })),
    make('railwise.excel_export', 'RailWise namespaced alias for excel_export.', { type: 'object', properties: { projectId: { type: 'string' }, datasetId: { type: 'string' } }, required: ['projectId', 'datasetId'] }, async (args) => ({ output: await service.previewReport({ projectId: args.projectId, datasetId: args.datasetId, expectedRevision: 0, idempotencyKey: String(args.idempotencyKey ?? `railwise-xlsx-${args.datasetId}`) }) })),
    make('standard_query', 'Return a citation placeholder for a local standard or knowledge source.', { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] }, async (args) => ({ output: { citation: { id: `cite_${Date.now()}`, sourceType: 'standard', source: String(args.source), locator: 'user-supplied' } } })),
    make('tool_norm_cite', 'Normalize a RailWise citation without changing source content.', { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] }, async (args) => ({ output: { citation: { id: `cite_${Date.now()}`, sourceType: 'other', source: String(args.source) } } }))
  ]
  return [{ id: 'railwise', kind: 'built-in', enabled: true, available: true, tools }]
}
