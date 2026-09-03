import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { EngineeringService } from './engineering-service.js'

describe('EngineeringService', () => {
  it('imports CSV, validates findings, analyses trends and writes reviewable deliverables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-'))
    const workspace = join(root, 'workspace')
    const service = new EngineeringService({ rootDir: join(root, 'runtime') })
    const project = service.createProject({ name: '宁波基坑', workspace, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'create-project-001' })
    const csv = ['监测项,测点,时间,数值,单位', '沉降,S01,2026-08-01T00:00:00Z,2,mm', '沉降,S01,2026-08-02T00:00:00Z,4,mm'].join('\n')
    const dataset = await service.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-csv-001', name: 'data.csv', dataBase64: Buffer.from(csv).toString('base64') })
    expect(dataset.observationCount).toBe(2)
    expect(dataset.sourceFileHash).toHaveLength(64)
    const validated = service.validateDataset({ datasetId: dataset.id, expectedRevision: dataset.revision, idempotencyKey: 'validate-csv-001' })
    expect(validated.status).toBe('validated')
    const analysis = service.createAnalysis({ projectId: project.id, datasetId: dataset.id, expectedRevision: validated.revision, idempotencyKey: 'analysis-csv-001' })
    expect(analysis.results[0]?.changeRate).toBe(2)
    const preview = await service.previewReport({ projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, expectedRevision: validated.revision, idempotencyKey: 'preview-csv-001' })
    expect(preview.files.map((file) => file.mediaType)).toEqual(expect.arrayContaining(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']))
    const evidence = await readFile(join(workspace, preview.files.find((file) => file.mediaType.includes('spreadsheet'))?.path ?? ''))
    const evidenceZip = await JSZip.loadAsync(evidence)
    const workbookXml = await evidenceZip.file('xl/workbook.xml')?.async('text')
    expect(workbookXml).toContain('field_mapping')
    expect(workbookXml).toContain('normalized_data')
    expect(workbookXml).toContain('quality_findings')
    expect(workbookXml).toContain('analysis_results')
    expect(workbookXml).toContain('manifest_summary')
    const manifest = await service.finalize({ projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, expectedRevision: validated.revision, idempotencyKey: 'finalize-csv-001', acknowledgeWarnings: true })
    expect(manifest.reviewStatus).toBe('approved')
    expect(await readFile(join(workspace, '.workwise', 'deliverables', project.id, manifest.runId, 'manifest.json'), 'utf8')).toContain(manifest.id)
    service.close()
  })

  it('returns the original result for an idempotent import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'idempotent', workspace: root, expectedRevision: 0, idempotencyKey: 'create-project-002' })
    const body = { projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-replay-001', name: 'data.csv', dataBase64: Buffer.from('point,time,value\nA,2026-01-01,1').toString('base64') }
    const first = await service.importDataset(body); const second = await service.importDataset(body)
    expect(second.id).toBe(first.id)
    service.close()
  })

  it('serializes concurrent imports that reuse an idempotency key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'concurrent', workspace: root, expectedRevision: 0, idempotencyKey: 'create-project-006' })
    const body = { projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-concurrent-001', name: 'data.csv', dataBase64: Buffer.from('point,time,value\nA,2026-01-01,1').toString('base64') }
    const results = await Promise.all([service.importDataset(body), service.importDataset(body), service.importDataset(body)])
    expect(new Set(results.map((item) => item.id)).size).toBe(1)
    expect((service as unknown as { db: { prepare: (sql: string) => { get: () => { count: number } } } }).db.prepare('SELECT COUNT(*) AS count FROM engineering_datasets').get().count).toBe(1)
    service.close()
  })

  it('keeps import blocking findings after re-validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'quality', workspace: root, expectedRevision: 0, idempotencyKey: 'create-project-003' })
    const dataset = await service.importDataset({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'import-quality-001',
      name: 'quality.csv',
      dataBase64: Buffer.from('point,time,value\nA,2026-01-01,not-a-number').toString('base64')
    })
    expect(dataset.findings.some((item) => item.code === 'invalid_number' && item.severity === 'blocking')).toBe(true)
    const validated = service.validateDataset({ datasetId: dataset.id, expectedRevision: dataset.revision, idempotencyKey: 'validate-quality-001' })
    expect(validated.findings.some((item) => item.code === 'invalid_number' && item.severity === 'blocking')).toBe(true)
    await expect(service.finalize({ projectId: project.id, datasetId: dataset.id, expectedRevision: validated.revision, idempotencyKey: 'finalize-quality-001' })).rejects.toThrow(/blocking findings remain/)
    service.close()
  })

  it('imports each XLSX worksheet with its own header and preserves worksheet provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'xlsx', workspace: root, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'create-project-004' })
    const sheet = (point: string) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>监测项</t></is></c><c r="B1" t="inlineStr"><is><t>测点</t></is></c><c r="C1" t="inlineStr"><is><t>时间</t></is></c><c r="D1" t="inlineStr"><is><t>数值</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>沉降</t></is></c><c r="B2" t="inlineStr"><is><t>${point}</t></is></c><c r="C2" t="inlineStr"><is><t>2026-08-01</t></is></c><c r="D2" t="inlineStr"><is><t>1</t></is></c></row></sheetData></worksheet>`
    const workbook = new JSZip()
    workbook.file('xl/worksheets/sheet1.xml', sheet('S01'))
    workbook.file('xl/worksheets/sheet2.xml', sheet('S02'))
    const dataset = await service.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-xlsx-001', name: 'monitoring.xlsx', dataBase64: (await workbook.generateAsync({ type: 'nodebuffer' })).toString('base64') })
    expect(dataset.rowCount).toBe(2)
    expect(dataset.observationCount).toBe(2)
    expect(dataset.findings.some((item) => item.code === 'invalid_number')).toBe(false)
    service.close()
  })

  it('preserves columns introduced by later XLSX worksheets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'xlsx-columns', workspace: root, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'create-project-005' })
    const sheet = (extraHeader: string, extraValue: string) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>监测项</t></is></c><c r="B1" t="inlineStr"><is><t>测点</t></is></c><c r="C1" t="inlineStr"><is><t>时间</t></is></c><c r="D1" t="inlineStr"><is><t>数值</t></is></c><c r="E1" t="inlineStr"><is><t>${extraHeader}</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>沉降</t></is></c><c r="B2" t="inlineStr"><is><t>S01</t></is></c><c r="C2" t="inlineStr"><is><t>2026-08-01</t></is></c><c r="D2" t="inlineStr"><is><t>1</t></is></c><c r="E2" t="inlineStr"><is><t>${extraValue}</t></is></c></row></sheetData></worksheet>`
    const workbook = new JSZip()
    workbook.file('xl/worksheets/sheet1.xml', sheet('首表字段', 'a'))
    workbook.file('xl/worksheets/sheet2.xml', sheet('后表字段', 'b'))
    const dataset = await service.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-xlsx-columns-001', name: 'monitoring.xlsx', dataBase64: (await workbook.generateAsync({ type: 'nodebuffer' })).toString('base64') })
    expect(dataset.columnCount).toBe(6)
    expect(dataset.unknownColumns).toEqual(['首表字段', '后表字段'])
    service.close()
  })

  it('imports structured JSON rows and preserves unknown fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-json-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'json', workspace: root, thresholds: { default: 10 }, expectedRevision: 0, idempotencyKey: 'create-json-001' })
    const json = JSON.stringify({ rows: [
      { 监测项: '沉降', 测点: 'S01', 时间: '2026-08-01T00:00:00Z', 数值: 1.5, 单位: 'mm', 自定义备注: '首期' },
      { 监测项: '沉降', 测点: 'S01', 时间: '2026-08-02T00:00:00Z', 数值: 2.5, 单位: 'mm', 自定义备注: '复测' }
    ] })
    const dataset = await service.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-json-001', name: 'monitoring.json', dataBase64: Buffer.from(json).toString('base64') })
    expect(dataset.rowCount).toBe(2)
    expect(dataset.observationCount).toBe(2)
    expect(dataset.fieldMapping.monitoringItem).toBe('监测项')
    expect(dataset.unknownColumns).toEqual(['自定义备注'])
    expect(dataset.status).toBe('imported')
    service.close()
  })

  it('rejects malformed or non-tabular JSON with a stable error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-json-invalid-'))
    const service = new EngineeringService({ rootDir: root })
    const project = service.createProject({ name: 'json-invalid', workspace: root, expectedRevision: 0, idempotencyKey: 'create-json-002' })
    await expect(service.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-json-002', name: 'bad.json', dataBase64: Buffer.from('{"project":"not rows"').toString('base64') })).rejects.toThrow('invalid JSON dataset')
    await expect(service.importDataset({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'import-json-003', name: 'bad-shape.json', dataBase64: Buffer.from('{"project":"not rows"}').toString('base64') })).rejects.toThrow('must be an array')
    service.close()
  })
})
