import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import { atomicWriteFile } from '../adapters/file/atomic-write.js'
import type { AttachmentStore } from '../attachments/attachment-store.js'
import {
  AnalysisRequest, ChartArtifactV1, ChartRequest, DatasetImportRequest, DatasetValidateRequest,
  DeliverableManifestV1, EngineeringProjectCreateRequest, EngineeringProjectUpdateRequest, AcceptQualityFindingRequest, FieldMappingV1, FinalizeDeliverableRequest,
  KnowledgeCitationV1, MonitoringAnalysisV1, MonitoringDatasetV1, MonitoringObservationV1,
  QualityFindingV1, RailwiseProjectV1, ReportPreviewRequest, RunMutationRequest
} from '../contracts/engineering.js'
import type { AdjustmentResultV1 } from '../contracts/survey.js'

type Row = Record<string, string>
type StoredDataset = MonitoringDatasetV1 & { observations: MonitoringObservationV1[]; findings: QualityFindingV1[] }
type StoredRun = { id: string; projectId: string; datasetId: string; analysisId?: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; revision: number; idempotencyKey: string; createdAt: string; updatedAt: string; error?: string }
type SurveyAdjustmentLookup = (projectId: string, ids: string[]) => AdjustmentResultV1[]

export class EngineeringRevisionConflictError extends Error { readonly code = 'stale_request' }
export class EngineeringIdempotencyError extends Error { readonly code = 'idempotency_replay'; constructor(readonly result: unknown) { super('idempotency key already used') } }

export class EngineeringService {
  private readonly db: Database.Database
  private readonly nowIso: () => string
  private readonly idempotencyLocks = new Map<string, Promise<void>>()
  constructor(private readonly options: { rootDir: string; attachmentStore?: AttachmentStore; runtimeVersion?: string; nowIso?: () => string; getAdjustments?: SurveyAdjustmentLookup }) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    mkdirSync(resolve(options.rootDir), { recursive: true })
    this.db = new Database(resolve(options.rootDir, 'engineering.sqlite3'))
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS engineering_projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS engineering_datasets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS engineering_analyses (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dataset_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS engineering_charts (id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS engineering_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS engineering_manifests (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS engineering_idempotency (key TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at TEXT NOT NULL);`)
  }
  close(): void { this.db.close() }

  listProjects(): RailwiseProjectV1[] {
    return (this.db.prepare('SELECT data_json FROM engineering_projects ORDER BY updated_at DESC').all() as Array<{ data_json: string }>).map((r) => RailwiseProjectV1.parse(JSON.parse(r.data_json)))
  }
  getProject(id: string): RailwiseProjectV1 | null {
    const row = this.db.prepare('SELECT data_json FROM engineering_projects WHERE id = ?').get(id) as { data_json: string } | undefined
    return row ? RailwiseProjectV1.parse(JSON.parse(row.data_json)) : null
  }
  updateProject(id: string, input: unknown): RailwiseProjectV1 {
    const req = EngineeringProjectUpdateRequest.parse(input)
    const replay = this.replay(req.idempotencyKey)
    if (replay) return replay as RailwiseProjectV1
    const project = this.mustProject(id)
    if (req.expectedRevision !== project.revision) throw new EngineeringRevisionConflictError(`project revision conflict: expected ${req.expectedRevision}, actual ${project.revision}`)
    const { expectedRevision: _expectedRevision, idempotencyKey: _idempotencyKey, ...projectPatch } = req
    const next = RailwiseProjectV1.parse({ ...project, ...projectPatch, id: project.id, workspace: project.workspace, revision: project.revision + 1, updatedAt: this.nowIso() })
    this.db.prepare('UPDATE engineering_projects SET revision = ?, data_json = ?, updated_at = ? WHERE id = ?').run(next.revision, JSON.stringify(next), next.updatedAt, next.id)
    void this.persistMetadata(next.workspace, 'projects', next.id, next)
    this.remember(req.idempotencyKey, next)
    return next
  }
  getProjectOverview(id: string): { project: RailwiseProjectV1; datasets: Array<Omit<StoredDataset, 'observations'>>; analyses: MonitoringAnalysisV1[]; runs: StoredRun[]; manifests: DeliverableManifestV1[] } {
    const project = this.mustProject(id)
    const datasets = (this.db.prepare('SELECT data_json FROM engineering_datasets WHERE project_id = ? ORDER BY updated_at DESC').all(project.id) as Array<{ data_json: string }>).map((row) => {
      const { observations: _observations, ...dataset } = this.mustStoredDataset(row.data_json)
      return dataset
    })
    const analyses = (this.db.prepare('SELECT data_json FROM engineering_analyses WHERE project_id = ? ORDER BY created_at DESC').all(project.id) as Array<{ data_json: string }>).map((row) => MonitoringAnalysisV1.parse(JSON.parse(row.data_json)))
    const runs = (this.db.prepare('SELECT data_json FROM engineering_runs WHERE project_id = ? ORDER BY updated_at DESC').all(project.id) as Array<{ data_json: string }>).map((row) => JSON.parse(row.data_json) as StoredRun)
    const manifests = (this.db.prepare('SELECT data_json FROM engineering_manifests WHERE project_id = ? ORDER BY created_at DESC').all(project.id) as Array<{ data_json: string }>).map((row) => DeliverableManifestV1.parse(JSON.parse(row.data_json)))
    return { project, datasets, analyses, runs, manifests }
  }
  createProject(input: unknown): RailwiseProjectV1 {
    const parsed = EngineeringProjectCreateRequest.parse(input)
    if (parsed.expectedRevision !== 0) throw new EngineeringRevisionConflictError(`project revision conflict: expected ${parsed.expectedRevision}, actual 0`)
    const replay = this.replay(parsed.idempotencyKey)
    if (replay) return replay as RailwiseProjectV1
    const now = this.nowIso(); const id = `project_${randomUUID()}`
    const project = RailwiseProjectV1.parse({ schemaVersion: 1, id, name: parsed.name, monitoringType: parsed.monitoringType ?? 'deformation', unit: parsed.unit ?? 'mm', signConvention: parsed.signConvention ?? 'positive', thresholds: parsed.thresholds ?? {}, reportPeriod: parsed.reportPeriod ?? {}, workspace: resolve(parsed.workspace), revision: 1, createdAt: now, updatedAt: now })
    this.db.prepare('INSERT INTO engineering_projects(id, revision, data_json, updated_at) VALUES (?, ?, ?, ?)').run(id, 1, JSON.stringify(project), now)
    void this.persistMetadata(project.workspace, 'projects', project.id, project)
    this.remember(parsed.idempotencyKey, project)
    return project
  }

  async importDataset(input: unknown): Promise<StoredDataset> {
    const req = DatasetImportRequest.parse(input)
    return this.withIdempotencyLock(req.idempotencyKey, async () => {
      const replay = this.replay(req.idempotencyKey); if (replay) return replay as StoredDataset
      const project = this.mustProject(req.projectId)
      if (project.revision !== req.expectedRevision && req.expectedRevision !== 0) throw new EngineeringRevisionConflictError(`project revision conflict: expected ${req.expectedRevision}, actual ${project.revision}`)
      let name = req.name ?? 'dataset.csv'; let bytes: Buffer
      if (req.attachmentId) {
        if (!this.options.attachmentStore) throw new Error('attachment store is unavailable')
        const content = await this.options.attachmentStore.resolveContent(req.attachmentId, { workspace: project.workspace })
        bytes = content.data; name = content.name
      } else bytes = Buffer.from(req.dataBase64!, 'base64')
      const sourceFileHash = createHash('sha256').update(bytes).digest('hex')
      const rows = await parseTabular(name, bytes, req.fieldMapping)
      const mapping = FieldMappingV1.parse({ ...inferMapping(rows[0] ?? {}), ...(req.fieldMapping ?? {}) })
      const normalized = normalizeRows(rows, mapping, project, sourceFileHash)
      const now = this.nowIso(); const id = `dataset_${randomUUID()}`
      const dataset = { schemaVersion: 1 as const, id, projectId: project.id, sourceAttachmentId: req.attachmentId, sourceFileName: name, sourceFileHash, fieldMapping: mapping, unknownColumns: normalized.unknownColumns, rowCount: rows.length, columnCount: normalized.columnCount, observationCount: normalized.observations.length, timeRange: normalized.timeRange, status: 'imported' as const, revision: 1, createdAt: now, updatedAt: now, observations: normalized.observations.map((observation) => ({ ...observation, datasetId: id })), findings: normalized.findings.map((finding) => ({ ...finding, datasetId: id })) }
      const parsed = validateStoredDataset(dataset)
      this.db.prepare('INSERT INTO engineering_datasets(id, project_id, revision, data_json, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, project.id, 1, JSON.stringify(parsed), now)
      await this.persistMetadata(project.workspace, 'datasets', parsed.id, parsed)
      this.remember(req.idempotencyKey, parsed)
      return parsed
    })
  }

  validateDataset(input: unknown): StoredDataset {
    const req = DatasetValidateRequest.parse(input); const dataset = this.mustDataset(req.datasetId)
    const project = this.mustProject(dataset.projectId)
    if (req.expectedRevision !== dataset.revision && req.expectedRevision !== 0) throw new EngineeringRevisionConflictError(`dataset revision conflict: expected ${req.expectedRevision}, actual ${dataset.revision}`)
    const findings = mergeFindings(dataset.findings, runQualityChecks(dataset.observations, project, this.nowIso)).map((finding) => ({ ...finding, datasetId: dataset.id }))
    const next = { ...dataset, findings, status: 'validated' as const, revision: dataset.revision + 1, updatedAt: this.nowIso() }
    this.saveDataset(next); void this.persistMetadata(project.workspace, 'datasets', next.id, next); this.remember(req.idempotencyKey, next); return next
  }
  acceptWarningFinding(input: unknown): StoredDataset {
    const req = AcceptQualityFindingRequest.parse(input)
    const replay = this.replay(req.idempotencyKey)
    if (replay) return replay as StoredDataset
    const dataset = this.mustDataset(req.datasetId)
    if (req.expectedRevision !== dataset.revision) throw new EngineeringRevisionConflictError(`dataset revision conflict: expected ${req.expectedRevision}, actual ${dataset.revision}`)
    const finding = dataset.findings.find((item) => item.id === req.findingId)
    if (!finding) throw new Error(`quality finding not found: ${req.findingId}`)
    if (finding.severity !== 'warning') throw new Error('only warning findings can be accepted')
    const next = { ...dataset, findings: dataset.findings.map((item) => item.id === finding.id ? { ...item, status: 'accepted' as const } : item), revision: dataset.revision + 1, updatedAt: this.nowIso() }
    this.saveDataset(next)
    void this.persistMetadata(this.mustProject(dataset.projectId).workspace, 'datasets', next.id, next)
    this.remember(req.idempotencyKey, next)
    return next
  }

  createAnalysis(input: unknown): MonitoringAnalysisV1 {
    const req = AnalysisRequest.parse(input); const replay = this.replay(req.idempotencyKey); if (replay) return replay as MonitoringAnalysisV1; const dataset = this.mustDataset(req.datasetId); const project = this.mustProject(req.projectId)
    if (dataset.projectId !== project.id) throw new Error('dataset does not belong to project')
    if (req.expectedRevision !== 0 && req.expectedRevision !== dataset.revision) throw new EngineeringRevisionConflictError(`dataset revision conflict: expected ${req.expectedRevision}, actual ${dataset.revision}`)
    const inputHash = createHash('sha256').update(JSON.stringify({ project, observations: dataset.observations })).digest('hex')
    const existing = this.db.prepare('SELECT data_json FROM engineering_analyses WHERE dataset_id = ? AND project_id = ? AND json_extract(data_json, \'$.inputHash\') = ? ORDER BY created_at DESC LIMIT 1').get(dataset.id, project.id, inputHash) as { data_json: string } | undefined
    if (existing) return MonitoringAnalysisV1.parse(JSON.parse(existing.data_json))
    const grouped = new Map<string, MonitoringObservationV1[]>()
    for (const observation of dataset.observations) { const key = `${observation.monitoringItem}|${observation.point}`; const list = grouped.get(key) ?? []; list.push(observation); grouped.set(key, list) }
    const results = [...grouped.values()].map((items) => {
      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp)); const current = items.at(-1); const previous = items.at(-2); const first = items[0]
      const change = current && first && current !== first ? (current.cumulative ?? current.value) - (first.cumulative ?? first.value) : undefined; const intervalDays = current && previous ? (Date.parse(current.timestamp) - Date.parse(previous.timestamp)) / 86_400_000 : undefined; const rate = current && previous && Number.isFinite(intervalDays) && intervalDays! > 0 ? (current.value - previous.value) / intervalDays! : undefined
      const trend = change === undefined ? 'unknown' : Math.abs(change) < 1e-9 ? 'stable' : change > 0 ? 'rising' : 'falling'
      const threshold = project.thresholds[current?.monitoringItem ?? ''] ?? project.thresholds.default
      const magnitude = Math.abs(current?.value ?? 0)
      const thresholdStatus = threshold === undefined ? 'unresolved' : magnitude >= threshold ? 'alarm' : magnitude >= threshold * 0.8 ? 'warning' : 'normal'
      return { monitoringItem: current?.monitoringItem ?? items[0].monitoringItem, point: current?.point ?? items[0].point, currentValue: current?.value, previousValue: previous?.value, cumulativeChange: change, changeRate: rate, trend, anomaly: Math.abs(change ?? 0) > (threshold ?? Number.POSITIVE_INFINITY), thresholdStatus }
    })
    const analysis = MonitoringAnalysisV1.parse({ schemaVersion: 1, id: `analysis_${randomUUID()}`, projectId: project.id, datasetId: dataset.id, inputHash, algorithmVersion: 'workwise-engineering-1', results, createdAt: this.nowIso() })
    this.db.prepare('INSERT INTO engineering_analyses(id, project_id, dataset_id, data_json, created_at) VALUES (?, ?, ?, ?, ?)').run(analysis.id, project.id, dataset.id, JSON.stringify(analysis), analysis.createdAt)
    this.remember(req.idempotencyKey, analysis); return analysis
  }

  async createChart(input: unknown): Promise<ChartArtifactV1> {
    const req = ChartRequest.parse(input); const analysis = this.getAnalysis(req.analysisId); if (!analysis) throw new Error('analysis not found')
    return this.withIdempotencyLock(req.idempotencyKey, async () => {
      const replay = this.replay(req.idempotencyKey); if (replay) return replay as ChartArtifactV1
      const project = this.mustProject(analysis.projectId); const runId = `chart_${randomUUID()}`; const outDir = this.outputDir(project, runId); await mkdir(outDir, { recursive: true })
      const values = analysis.results.map((r) => r.currentValue).filter((v): v is number => typeof v === 'number'); const min = Math.min(...values, 0); const max = Math.max(...values, 0)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360"><rect width="100%" height="100%" fill="#fff"/><polyline fill="none" stroke="#2878d0" stroke-width="3" points="${values.map((v, i) => `${40 + i * (880 / Math.max(1, values.length - 1))},${320 - ((v - min) / Math.max(1e-9, max - min)) * 280}`).join(' ')}"/></svg>`
      const path = join(outDir, `${req.chartType}.svg`); await atomicWriteFile(path, svg); const sha256 = createHash('sha256').update(svg).digest('hex')
      const chart = ChartArtifactV1.parse({ schemaVersion: 1, id: runId, analysisId: analysis.id, chartType: req.chartType, inputHash: analysis.inputHash, dataRange: { min, max }, relativePath: relative(project.workspace, path), sha256, validation: 'valid', createdAt: this.nowIso() })
      this.db.prepare('INSERT INTO engineering_charts(id, analysis_id, data_json, created_at) VALUES (?, ?, ?, ?)').run(chart.id, chart.analysisId, JSON.stringify(chart), chart.createdAt); this.remember(req.idempotencyKey, chart); return chart
    })
  }

  async previewReport(input: unknown): Promise<{ run: StoredRun; files: Array<{ path: string; mediaType: string; sha256: string; sizeBytes: number }>; charts: ChartArtifactV1[]; citations: KnowledgeCitationV1[]; adjustments: AdjustmentResultV1[] }> {
    const req = ReportPreviewRequest.parse(input)
    return this.withIdempotencyLock(req.idempotencyKey, async () => {
      const project = this.mustProject(req.projectId); const dataset = this.mustDataset(req.datasetId); if (req.expectedRevision !== 0 && req.expectedRevision !== dataset.revision) throw new EngineeringRevisionConflictError(`dataset revision conflict: expected ${req.expectedRevision}, actual ${dataset.revision}`); const analysis = req.analysisId ? this.getAnalysis(req.analysisId) : this.createAnalysis({ expectedRevision: dataset.revision, idempotencyKey: `preview-analysis-${dataset.id}`, projectId: project.id, datasetId: dataset.id }); if (!analysis) throw new Error('analysis not found')
      if (analysis.projectId !== project.id || analysis.datasetId !== dataset.id) throw new Error('analysis does not belong to project and dataset')
      const adjustments = this.lookupAdjustments(project.id, req.adjustmentIds)
      const replay = this.replay(req.idempotencyKey); if (replay) return replay as { run: StoredRun; files: Array<{ path: string; mediaType: string; sha256: string; sizeBytes: number }>; charts: ChartArtifactV1[]; citations: KnowledgeCitationV1[]; adjustments: AdjustmentResultV1[] }
      const runId = `run_${randomUUID()}`; const outDir = this.outputDir(project, runId); await mkdir(outDir, { recursive: true }); const chart = this.latestChart(analysis.id) ?? await this.createChart({ expectedRevision: 0, idempotencyKey: `preview-chart-${analysis.id}`, analysisId: analysis.id, chartType: 'trend' })
      const outputs: Array<{ path: string; mediaType: string; sha256: string; sizeBytes: number }> = []
      const text = reportText(project, dataset, analysis, req.citations, adjustments)
      const docxPath = join(outDir, 'report.docx'); await atomicWriteFile(docxPath, await makeDocx(text)); outputs.push(await fileOutput(docxPath, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', project.workspace))
      const pdfPath = join(outDir, 'report.pdf'); await atomicWriteFile(pdfPath, makePdf(text)); outputs.push(await fileOutput(pdfPath, 'application/pdf', project.workspace))
      const xlsxPath = join(outDir, 'evidence.xlsx'); await atomicWriteFile(xlsxPath, await makeXlsx(project, dataset, analysis, req.citations, adjustments, this.options.runtimeVersion ?? '0.5.0')); outputs.push(await fileOutput(xlsxPath, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', project.workspace))
      const chartPath = resolve(project.workspace, chart.relativePath); if (await readFile(chartPath).then(() => true).catch(() => false)) outputs.push(await fileOutput(chartPath, 'image/svg+xml', project.workspace))
      const run: StoredRun = { id: runId, projectId: project.id, datasetId: dataset.id, analysisId: analysis.id, status: 'completed', revision: 1, idempotencyKey: req.idempotencyKey, createdAt: this.nowIso(), updatedAt: this.nowIso() }
      this.db.prepare('INSERT INTO engineering_runs(id, project_id, data_json, updated_at) VALUES (?, ?, ?, ?)').run(run.id, run.projectId, JSON.stringify(run), run.updatedAt)
      const result = { run, files: outputs, charts: [chart], citations: req.citations, adjustments }; this.remember(req.idempotencyKey, result); return result
    })
  }

  async finalize(input: unknown): Promise<DeliverableManifestV1> {
    const req = FinalizeDeliverableRequest.parse(input)
    return this.withIdempotencyLock(req.idempotencyKey, async () => {
      const replay = this.replay(req.idempotencyKey); if (replay) return replay as DeliverableManifestV1; const project = this.mustProject(req.projectId); const dataset = this.mustDataset(req.datasetId); if (req.expectedRevision !== 0 && req.expectedRevision !== dataset.revision) throw new EngineeringRevisionConflictError(`dataset revision conflict: expected ${req.expectedRevision}, actual ${dataset.revision}`); const findings = dataset.findings.filter((f) => f.status === 'open'); const blocking = findings.filter((f) => f.severity === 'blocking'); const warnings = findings.filter((f) => f.severity === 'warning'); if (blocking.length) throw new Error(`blocking findings remain: ${blocking.length}`); if (warnings.length && !req.acknowledgeWarnings) throw new Error(`warnings require acknowledgement: ${warnings.length}`)
      const preview = await this.previewReport({ expectedRevision: req.expectedRevision, idempotencyKey: `finalize-preview-${req.idempotencyKey}`, projectId: project.id, datasetId: dataset.id, citations: req.citations, adjustmentIds: req.adjustmentIds, ...(req.analysisId ? { analysisId: req.analysisId } : {}) }); const outputs = [...preview.files]; const runId = preview.run.id; const manifest = DeliverableManifestV1.parse({ schemaVersion: 1, id: `manifest_${randomUUID()}`, projectId: project.id, runId, inputDatasets: [{ id: dataset.id, hash: dataset.sourceFileHash }], analyses: [preview.run.analysisId!], adjustments: preview.adjustments, charts: preview.charts, citations: req.citations, outputs, validation: { valid: true, errors: [], warnings: warnings.map((f) => f.message) }, reviewStatus: 'approved', runtimeVersion: this.options.runtimeVersion ?? '0.5.0', createdAt: this.nowIso(), finalizedAt: this.nowIso() }); const path = join(this.outputDir(project, runId), 'manifest.json'); await atomicWriteFile(path, JSON.stringify(manifest, null, 2)); this.db.prepare('INSERT INTO engineering_manifests(id, project_id, data_json, created_at) VALUES (?, ?, ?, ?)').run(manifest.id, manifest.projectId, JSON.stringify(manifest), manifest.createdAt); this.remember(req.idempotencyKey, manifest); return manifest
    })
  }
  getRun(id: string): StoredRun | null { const row = this.db.prepare('SELECT data_json FROM engineering_runs WHERE id = ?').get(id) as { data_json: string } | undefined; return row ? JSON.parse(row.data_json) as StoredRun : null }
  cancelRun(id: string, input?: unknown): StoredRun { const mutation = input ? RunMutationRequest.parse(input) : undefined; const replay = mutation ? this.replay(mutation.idempotencyKey) : null; if (replay) return replay as StoredRun; const run = this.getRun(id); if (!run) throw new Error('run not found'); if (mutation && mutation.expectedRevision !== 0 && mutation.expectedRevision !== run.revision) throw new EngineeringRevisionConflictError(`run revision conflict: expected ${mutation.expectedRevision}, actual ${run.revision}`); const next = { ...run, status: 'cancelled' as const, revision: run.revision + 1, updatedAt: this.nowIso() }; this.saveRun(next); if (mutation) this.remember(mutation.idempotencyKey, next); return next }
  resumeRun(id: string, input?: unknown): StoredRun { const mutation = input ? RunMutationRequest.parse(input) : undefined; const replay = mutation ? this.replay(mutation.idempotencyKey) : null; if (replay) return replay as StoredRun; const run = this.getRun(id); if (!run) throw new Error('run not found'); if (mutation && mutation.expectedRevision !== 0 && mutation.expectedRevision !== run.revision) throw new EngineeringRevisionConflictError(`run revision conflict: expected ${mutation.expectedRevision}, actual ${run.revision}`); if (run.status === 'completed') return run; const next = { ...run, status: 'queued' as const, revision: run.revision + 1, updatedAt: this.nowIso(), error: undefined }; this.saveRun(next); if (mutation) this.remember(mutation.idempotencyKey, next); return next }
  private saveRun(run: StoredRun): void { this.db.prepare('UPDATE engineering_runs SET data_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(run), run.updatedAt, run.id) }
  private mustStoredDataset(raw: string): StoredDataset { return this.mustDatasetFromRaw(raw) }
  private mustDatasetFromRaw(raw: string): StoredDataset { return validateStoredDataset(JSON.parse(raw)) }
  private latestChart(analysisId: string): ChartArtifactV1 | null { const row = this.db.prepare('SELECT data_json FROM engineering_charts WHERE analysis_id = ? ORDER BY created_at DESC LIMIT 1').get(analysisId) as { data_json: string } | undefined; return row ? ChartArtifactV1.parse(JSON.parse(row.data_json)) : null }
  private lookupAdjustments(projectId: string, ids: string[]): AdjustmentResultV1[] {
    if (!ids.length) return []
    if (!this.options.getAdjustments) throw new Error('survey adjustment lookup is unavailable')
    const uniqueIds = [...new Set(ids)]
    const results = this.options.getAdjustments(projectId, uniqueIds)
    if (results.length !== uniqueIds.length) throw new Error('one or more survey adjustments were not found')
    for (const result of results) {
      if (result.inputHash.length < 32) throw new Error(`survey adjustment ${result.id} has an invalid input hash`)
    }
    return results
  }
  private getAnalysis(id: string): MonitoringAnalysisV1 | null { const row = this.db.prepare('SELECT data_json FROM engineering_analyses WHERE id = ?').get(id) as { data_json: string } | undefined; return row ? MonitoringAnalysisV1.parse(JSON.parse(row.data_json)) : null }
  private mustProject(id: string): RailwiseProjectV1 { const project = this.getProject(id); if (!project) throw new Error(`project not found: ${id}`); return project }
  private mustDataset(id: string): StoredDataset { const row = this.db.prepare('SELECT data_json FROM engineering_datasets WHERE id = ?').get(id) as { data_json: string } | undefined; if (!row) throw new Error(`dataset not found: ${id}`); return validateStoredDataset(JSON.parse(row.data_json)) }
  private saveDataset(dataset: StoredDataset): void { this.db.prepare('UPDATE engineering_datasets SET revision = ?, data_json = ?, updated_at = ? WHERE id = ?').run(dataset.revision, JSON.stringify(dataset), dataset.updatedAt, dataset.id) }
  private async persistMetadata(workspace: string, kind: string, id: string, value: unknown): Promise<void> { const root = resolve(workspace); const directory = resolve(root, '.workwise', 'engineering', kind); if (!(directory === root || directory.startsWith(`${root}/`))) throw new Error('workspace containment violation'); await mkdir(directory, { recursive: true }); await atomicWriteFile(join(directory, `${id}.json`), JSON.stringify(value, null, 2)) }
  private outputDir(project: RailwiseProjectV1, runId: string): string { const root = resolve(project.workspace); const out = resolve(root, '.workwise', 'deliverables', project.id, runId); if (!(out === root || out.startsWith(`${root}/`))) throw new Error('workspace containment violation'); return out }
  private replay(key: string): unknown | null { const row = this.db.prepare('SELECT result_json FROM engineering_idempotency WHERE key = ?').get(key) as { result_json: string } | undefined; return row ? JSON.parse(row.result_json) : null }
  private remember(key: string, value: unknown): void { this.db.prepare('INSERT OR IGNORE INTO engineering_idempotency(key, result_json, created_at) VALUES (?, ?, ?)').run(key, JSON.stringify(value), this.nowIso()) }
  private async withIdempotencyLock<T>(key: string, operation: () => Promise<T> | T): Promise<T> {
    const previous = this.idempotencyLocks.get(key) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const queued = previous.then(() => gate)
    this.idempotencyLocks.set(key, queued)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.idempotencyLocks.get(key) === queued) this.idempotencyLocks.delete(key)
    }
  }
}

function validateStoredDataset(value: unknown): StoredDataset { return value as StoredDataset }

const ALIASES: Record<keyof zInferMapping, string[]> = {
  project: ['project', '项目', '工程'], period: ['period', '周期', '期次'], monitoringItem: ['monitoringItem', '监测项', '监测项目', '类型'], point: ['point', '测点', '测点编号', '点号'], timestamp: ['timestamp', 'time', '时间', '日期'], value: ['value', '当前变化', '数值', '观测值'], unit: ['unit', '单位'], cumulative: ['cumulative', '累计变化'], rate: ['rate', '速率'], warningThreshold: ['warningThreshold', '预警阈值', '预警'], alarmThreshold: ['alarmThreshold', '报警阈值', '报警'], controlThreshold: ['controlThreshold', '控制阈值', '控制'], valid: ['valid', '有效性'], note: ['note', '备注']
}
type zInferMapping = { project?: string; period?: string; monitoringItem?: string; point?: string; timestamp?: string; value?: string; unit?: string; cumulative?: string; rate?: string; warningThreshold?: string; alarmThreshold?: string; controlThreshold?: string; valid?: string; note?: string }
function inferMapping(row: Row): FieldMappingV1 { const keys = Object.keys(row); const out: Record<string, string> = {}; for (const [canonical, aliases] of Object.entries(ALIASES)) { const found = keys.find((key) => aliases.some((alias) => key.trim().toLowerCase() === alias.toLowerCase())); if (found) out[canonical] = found } return FieldMappingV1.parse(out) }
function normalizeRows(rows: Row[], mapping: FieldMappingV1, project: RailwiseProjectV1, sourceHash: string): { observations: MonitoringObservationV1[]; findings: QualityFindingV1[]; unknownColumns: string[]; columnCount: number; timeRange: { start?: string; end?: string } } {
  const known = new Set(Object.values(mapping).filter(Boolean)); const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]; const unknownColumns = columns.filter((key) => !known.has(key) && !key.startsWith('__')); const observations: MonitoringObservationV1[] = []; const findings: QualityFindingV1[] = []; let start: string | undefined; let end: string | undefined; const seen = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]; const point = mapping.point ? row[mapping.point] : ''; const item = mapping.monitoringItem ? row[mapping.monitoringItem] : project.monitoringType; const timestamp = mapping.timestamp ? row[mapping.timestamp] : ''; const rawValue = mapping.value ? row[mapping.value] : ''; const value = Number(rawValue);
    if (!point || !timestamp) findings.push(finding(`missing-${i}`, 'missing_identifier', 'blocking', i + 2, '缺少测点或时间', '补齐测点编号和时间'));
    if (!rawValue) findings.push(finding(`missing-value-${i}`, 'missing_value', 'blocking', i + 2, '缺少观测数值', '补齐数值字段'));
    else if (!Number.isFinite(value)) findings.push(finding(`number-${i}`, 'invalid_number', 'blocking', i + 2, '数值无效', '修正数值字段'));
    if (timestamp && Number.isNaN(Date.parse(timestamp))) findings.push(finding(`time-invalid-${i}`, 'time_order', 'blocking', i + 2, '时间格式无效', '使用 ISO 8601 或可识别日期'));
    const key = `${item}|${point}|${timestamp}`; if (seen.has(key)) findings.push(finding(`duplicate-${i}`, 'duplicate_observation', 'warning', i + 2, '存在重复观测', '确认是否保留其中一条')); seen.add(key);
    if (Number.isFinite(value) && point && timestamp) { const obs = MonitoringObservationV1.parse({ schemaVersion: 1, id: `obs_${sourceHash.slice(0, 12)}_${i}`, projectId: project.id, datasetId: 'pending', monitoringItem: item || project.monitoringType, point, timestamp, value, unit: mapping.unit ? row[mapping.unit] : project.unit, cumulative: mapping.cumulative && Number.isFinite(Number(row[mapping.cumulative])) ? Number(row[mapping.cumulative]) : undefined, rate: mapping.rate && Number.isFinite(Number(row[mapping.rate])) ? Number(row[mapping.rate]) : undefined, sourceRow: i + 2, sourceFields: row }); observations.push(obs); start = !start || timestamp < start ? timestamp : start; end = !end || timestamp > end ? timestamp : end }
  }
  if (rows.length > 500_000) findings.push(finding('row-limit', 'row_limit', 'blocking', 1, '观测记录超过 500,000 条运行上限', '拆分文件或缩小运行范围'))
  if (Object.keys(project.thresholds).length === 0) findings.push(finding('threshold-missing', 'missing_threshold', 'warning', 1, '项目未配置阈值', '在项目设置中补充阈值'))
  return { observations, findings, unknownColumns, columnCount: columns.filter((key) => !key.startsWith('__')).length, timeRange: { ...(start ? { start } : {}), ...(end ? { end } : {}) } }
}
function mergeFindings(existing: QualityFindingV1[], generated: QualityFindingV1[]): QualityFindingV1[] {
  const byKey = new Map<string, QualityFindingV1>()
  for (const item of [...existing, ...generated]) {
    const key = `${item.code}|${item.row ?? 0}|${item.message}`
    const previous = byKey.get(key)
    // Keep a user resolution/acceptance if a re-check produces the same finding.
    byKey.set(key, previous && previous.status !== 'open' ? previous : item)
  }
  return [...byKey.values()]
}
function finding(id: string, code: QualityFindingV1['code'], severity: QualityFindingV1['severity'], row: number, message: string, suggestion: string, createdAt = new Date().toISOString()): QualityFindingV1 { return QualityFindingV1.parse({ schemaVersion: 1, id, datasetId: 'pending', code, severity, row, message, suggestion, status: 'open', createdAt }) }
function runQualityChecks(observations: MonitoringObservationV1[], project: RailwiseProjectV1, nowIso: () => string): QualityFindingV1[] {
  const findings: QualityFindingV1[] = []
  const byPoint = new Map<string, MonitoringObservationV1[]>()
  for (const obs of observations) {
    const key = `${obs.monitoringItem}|${obs.point}`
    const list = byPoint.get(key) ?? []
    list.push(obs)
    byPoint.set(key, list)
    if (obs.unit && obs.unit !== project.unit) findings.push(finding(`unit-${obs.id}`, 'unit_conflict', 'warning', obs.sourceRow, `单位 ${obs.unit} 与项目单位 ${project.unit} 不一致`, '统一单位后重新校核', nowIso()))
  }
  for (const list of byPoint.values()) {
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].timestamp < list[i - 1].timestamp) findings.push(finding(`time-${list[i].id}`, 'time_order', 'warning', list[i].sourceRow, '时间顺序异常', '按时间升序整理', nowIso()))
    }
  }
  if (Object.keys(project.thresholds).length === 0) findings.push(finding('threshold-missing', 'missing_threshold', 'warning', 1, '项目未配置阈值', '在项目设置中补充阈值', nowIso()))
  return findings
}
/**
 * Parse the three tabular formats advertised by the engineering workbench.
 * JSON is intentionally normalised into the same row representation as CSV
 * and XLSX so field mapping, provenance and quality checks stay deterministic.
 */
async function parseTabular(name: string, bytes: Buffer, requestedMapping?: FieldMappingV1): Promise<Row[]> {
  const extension = extname(name).toLowerCase()
  if (extension === '.xlsx') return parseXlsx(bytes, requestedMapping)
  if (extension === '.json') return parseJsonRows(bytes)
  return parseCsv(bytes)
}

function parseJsonRows(bytes: Buffer): Row[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`invalid JSON dataset: ${error instanceof Error ? error.message : String(error)}`)
  }
  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? (() => {
        const object = parsed as Record<string, unknown>
        for (const key of ['rows', 'data', 'records', 'observations']) {
          if (Array.isArray(object[key])) return object[key]
        }
        return undefined
      })()
      : undefined
  if (!candidate) throw new Error('JSON dataset must be an array or an object containing rows, data, records, or observations')
  if (candidate.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('JSON dataset rows must be objects')
  }
  return candidate.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  ])))
}
function parseCsv(bytes: Buffer): Row[] { const text = decodeText(bytes).replace(/^\uFEFF/, ''); const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0); if (!lines.length) return []; const rows = lines.map(parseCsvLine); const headers = rows[0].map((h) => h.trim()); return rows.slice(1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']))) }
function parseCsvLine(line: string): string[] { const out: string[] = []; let current = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"' && line[i + 1] === '"') { current += '"'; i += 1 } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { out.push(current); current = '' } else current += c } out.push(current); return out }
function decodeText(bytes: Buffer): string { const utf8 = bytes.toString('utf8').replace(/^\uFEFF/, ''); if (!utf8.includes('\uFFFD')) return utf8; try { return new TextDecoder('gb18030').decode(bytes) } catch { return utf8 } }
async function parseXlsx(bytes: Buffer, requestedMapping?: FieldMappingV1): Promise<Row[]> {
  const zip = await JSZip.loadAsync(bytes)
  const sharedText = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml')!.async('text') : ''
  const shared = [...sharedText.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((text) => decodeXml(text[1])).join('')
  )
  const sheetNames = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()
  if (!sheetNames.length) throw new Error('xlsx has no worksheet')
  const output: Row[] = []
  let observationSheetCount = 0
  for (const sheetName of sheetNames) {
    const sheet = zip.file(sheetName)
    if (!sheet) continue
    const xml = await sheet.async('text')
    const rows: string[][] = []
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const reference = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1]
        if (!reference) continue
        const col = lettersToIndex(reference); const type = cell[1].match(/\bt="([^"]+)"/)?.[1]; const body = cell[2]
        const value = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '')
        cells[col] = type === 's' ? (shared[Number(value)] ?? value) : value
      }
      rows.push(cells)
    }
    const headers = (rows[0] ?? []).map((v, i) => v.trim() || `column_${i + 1}`)
    const headerRow = Object.fromEntries(headers.map((header) => [header, '']))
    const sheetMapping = FieldMappingV1.parse({ ...inferMapping(headerRow), ...(requestedMapping ?? {}) })
    if (!hasRequiredObservationColumns(headers, sheetMapping)) continue
    observationSheetCount += 1
    for (const cells of rows.slice(1)) {
      output.push({ ...Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])), __worksheet: sheetName })
    }
  }
  if (observationSheetCount === 0) throw new Error('xlsx has no worksheet containing point, timestamp, and value columns')
  return output
}
function hasRequiredObservationColumns(headers: string[], mapping: FieldMappingV1): boolean {
  const headerSet = new Set(headers)
  return [mapping.point, mapping.timestamp, mapping.value].every((column) => Boolean(column && headerSet.has(column)))
}
function lettersToIndex(value: string): number { let n = 0; for (const c of value) n = n * 26 + c.charCodeAt(0) - 64; return n - 1 }
function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex: string) => decodeCodePoint(entity, Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (entity, decimal: string) => decodeCodePoint(entity, Number.parseInt(decimal, 10)))
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}
function decodeCodePoint(entity: string, codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : entity
}
function reportText(project: RailwiseProjectV1, dataset: StoredDataset, analysis: MonitoringAnalysisV1, citations: KnowledgeCitationV1[] = [], adjustments: AdjustmentResultV1[] = []): string {
  const period = project.reportPeriod.start || project.reportPeriod.end
    ? `${project.reportPeriod.start ?? '-'} ~ ${project.reportPeriod.end ?? '-'}`
    : `${dataset.timeRange.start ?? '-'} ~ ${dataset.timeRange.end ?? '-'}`
  const thresholdLines = Object.entries(project.thresholds).map(([name, value]) => `${name}: ${value} ${project.unit}`)
  const measurement = (value: number | undefined, unit: string): string => value === undefined ? '-' : `${value} ${unit}`
  return [
    `项目：${project.name}`,
    `监测类型：${project.monitoringType}`,
    `报告周期：${period}`,
    `单位：${project.unit}；符号约定：${project.signConvention}`,
    `数据来源：${dataset.sourceFileName}`,
    `源文件 SHA-256：${dataset.sourceFileHash}`,
    `字段映射：${JSON.stringify(dataset.fieldMapping)}`,
    `观测记录：${dataset.observationCount}（原始行 ${dataset.rowCount}，列 ${dataset.columnCount}）`,
    '',
    '阈值配置',
    ...(thresholdLines.length ? thresholdLines : ['待确认']),
    '',
    '分析结果',
    ...analysis.results.map((r) => `${r.monitoringItem} / ${r.point}: 当前=${r.currentValue ?? '-'} 上期=${r.previousValue ?? '-'} 累计=${r.cumulativeChange ?? '-'} 速率=${r.changeRate ?? '-'} 趋势=${r.trend} 异常=${r.anomaly ? '是' : '否'} 阈值=${r.thresholdStatus}`),
    `分析输入 SHA-256：${analysis.inputHash}`,
    `算法版本：${analysis.algorithmVersion}`,
    '',
    '测量平差结果',
    ...(adjustments.length ? adjustments.flatMap((adjustment) => [
      `平差运行 ${adjustment.runId}：网络=${adjustment.networkId}，观测=${adjustment.observationCount}，未知数=${adjustment.unknownCount}，多余观测=${adjustment.redundancy}`,
      `单位权中误差=${adjustment.unitWeightStdDev}（无量纲），最大点位中误差=${adjustment.precision.maxPointStdDev} ${adjustment.linearUnit}，状态=${adjustment.validation}，输入 SHA-256=${adjustment.inputHash}`,
      `闭合量=${Object.entries(adjustment.closure).map(([key, value]) => `${key}:${value} ${adjustment.closureUnits[key] ?? '单位未记录'}`).join('；') || '无'}`,
      `解算参数=${Object.entries(adjustment.parameters).map(([key, value]) => `${key}:${value} ${adjustment.parameterUnits[key] ?? '单位未记录'}`).join('；') || '无'}`,
      ...(adjustment.displacements.length ? adjustment.displacements.map((item) => `位移 ${item.pointId}: dX=${measurement(item.dX, adjustment.linearUnit)} dY=${measurement(item.dY, adjustment.linearUnit)} dH=${measurement(item.dH, adjustment.linearUnit)} 模长=${measurement(item.magnitude, adjustment.linearUnit)}`) : ['位移结果：无可用初始坐标/高程'])
    ]) : ['本报告未关联测量平差运行']),
    '',
    '质量问题',
    ...(dataset.findings.length ? dataset.findings.map((f) => `${f.severity}: ${f.message}（第 ${f.row ?? '-'} 行，${f.code}，${f.status}）`) : ['无']),
    '',
    '来源引用',
    ...(citations.length ? citations.map((citation) => `${citation.id}: ${citation.sourceType} ${citation.source}${citation.page ? ` 第 ${citation.page} 页` : ''}${citation.worksheet ? ` 工作表 ${citation.worksheet}` : ''}${citation.row ? ` 第 ${citation.row} 行` : ''}${citation.locator ? ` (${citation.locator})` : ''}`) : ['无']),
    '',
    '审查记录：本报告由 WorkWise 确定性工程分析生成，最终归档前需人工确认阻断项、警告项和来源引用。'
  ].join('\n')
}
async function fileOutput(path: string, mediaType: string, workspace: string): Promise<{ path: string; mediaType: string; sha256: string; sizeBytes: number }> { const data = await readFile(path); return { path: relative(workspace, path), mediaType, sha256: createHash('sha256').update(data).digest('hex'), sizeBytes: data.byteLength } }
async function makeDocx(text: string): Promise<Buffer> { const zip = new JSZip(); zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'); zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'); zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split('\n').map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('')}<w:sectPr/></w:body></w:document>`); return zip.generateAsync({ type: 'nodebuffer' }) }
function makePdf(text: string): Buffer { const body = text.replace(/[()\\]/g, (m) => `\\${m}`).slice(0, 5000); const stream = `BT /F1 10 Tf 40 760 Td (${body.replaceAll('\n', ') Tj 0 -14 Td (')}) Tj ET`; const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length ${Buffer.byteLength(stream)}>>stream\n${stream}\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF`; return Buffer.from(pdf) }
async function makeXlsx(project: RailwiseProjectV1, dataset: StoredDataset, analysis: MonitoringAnalysisV1, citations: KnowledgeCitationV1[], adjustments: AdjustmentResultV1[], runtimeVersion: string): Promise<Buffer> {
  const zip = new JSZip()
  const sheets: Array<{ name: string; rows: string[][] }> = [
    { name: 'field_mapping', rows: [['canonical_field', 'source_column'], ...Object.entries(dataset.fieldMapping).map(([key, value]) => [key, value ?? ''])] },
    { name: 'normalized_data', rows: [['id', 'monitoringItem', 'point', 'timestamp', 'value', 'unit', 'cumulative', 'rate', 'sourceRow', 'sourceFileHash'], ...dataset.observations.map((o) => [o.id, o.monitoringItem, o.point, o.timestamp, String(o.value), o.unit ?? '', String(o.cumulative ?? ''), String(o.rate ?? ''), String(o.sourceRow), dataset.sourceFileHash])] },
    { name: 'quality_findings', rows: [['id', 'severity', 'code', 'row', 'status', 'message', 'suggestion'], ...dataset.findings.map((f) => [f.id, f.severity, f.code, String(f.row ?? ''), f.status, f.message, f.suggestion])] },
    { name: 'analysis_results', rows: [['monitoringItem', 'point', 'currentValue', 'previousValue', 'cumulativeChange', 'changeRate', 'trend', 'anomaly', 'thresholdStatus', 'inputHash'], ...analysis.results.map((r) => [r.monitoringItem, r.point, String(r.currentValue ?? ''), String(r.previousValue ?? ''), String(r.cumulativeChange ?? ''), String(r.changeRate ?? ''), r.trend, String(r.anomaly), r.thresholdStatus, analysis.inputHash])] },
    { name: 'threshold_status', rows: [['monitoringItem', 'point', 'thresholdStatus', 'configuredThreshold', 'unit'], ...analysis.results.map((r) => [r.monitoringItem, r.point, r.thresholdStatus, String(project.thresholds[r.monitoringItem] ?? project.thresholds.default ?? ''), project.unit])] },
    { name: 'chart_data', rows: [['monitoringItem', 'point', 'currentValue'], ...analysis.results.map((r) => [r.monitoringItem, r.point, String(r.currentValue ?? '')])] },
    { name: 'survey_adjustments', rows: [['runId', 'networkId', 'resultId', 'observationCount', 'unknownCount', 'redundancy', 'unitWeightStdDev', 'unitWeightStdDevUnit', 'maxPointStdDev', 'maxPointStdDevUnit', 'validation', 'inputHash'], ...adjustments.map((a) => [a.runId, a.networkId, a.id, String(a.observationCount), String(a.unknownCount), String(a.redundancy), String(a.unitWeightStdDev), 'dimensionless', String(a.precision.maxPointStdDev), a.linearUnit, a.validation, a.inputHash])] },
    { name: 'survey_closures', rows: [['runId', 'closureKey', 'value', 'unit'], ...adjustments.flatMap((a) => Object.entries(a.closure).map(([key, value]) => [a.runId, key, String(value), a.closureUnits[key] ?? '']))] },
    { name: 'survey_parameters', rows: [['runId', 'parameterKey', 'value', 'unit'], ...adjustments.flatMap((a) => Object.entries(a.parameters).map(([key, value]) => [a.runId, key, String(value), a.parameterUnits[key] ?? '']))] },
    { name: 'survey_residuals', rows: [['runId', 'observationId', 'correction', 'residual', 'unit', 'standardizedResidual', 'standardizedResidualUnit', 'outlier', 'sourceRow'], ...adjustments.flatMap((a) => a.observations.map((o) => [a.runId, o.observationId, String(o.correction), String(o.residual), o.unit ?? '', String(o.standardizedResidual ?? ''), 'sigma', String(o.outlier), String(o.sourceRow ?? '')]))] },
    { name: 'survey_displacements', rows: [['runId', 'pointId', 'dX', 'dY', 'dH', 'magnitude', 'unit', 'kind'], ...adjustments.flatMap((a) => a.displacements.map((d) => [a.runId, d.pointId, String(d.dX ?? ''), String(d.dY ?? ''), String(d.dH ?? ''), String(d.magnitude), a.linearUnit, d.kind]))] },
    { name: 'citations', rows: [['id', 'sourceType', 'source', 'page', 'worksheet', 'row', 'url', 'locator'], ...citations.map((c) => [c.id, c.sourceType, c.source, String(c.page ?? ''), c.worksheet ?? '', String(c.row ?? ''), c.url ?? '', c.locator ?? ''])] },
    { name: 'manifest_summary', rows: [['schemaVersion', 'projectId', 'datasetId', 'sourceFileHash', 'analysisId', 'analysisInputHash', 'adjustmentIds', 'runtimeVersion', 'generatedAt'], ['1', project.id, dataset.id, dataset.sourceFileHash, analysis.id, analysis.inputHash, adjustments.map((a) => a.id).join(','), runtimeVersion, new Date().toISOString()]] }
  ]
  const xmlEscape = (value: string): string => escapeXml(value)
  const sheetXml = (rows: string[][]): string => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => `<c r="${columnName(ci)}${ri + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`)
  zip.file('xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`)
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows)))
  return zip.generateAsync({ type: 'nodebuffer' })
}
function columnName(index: number): string { let n = index + 1; let result = ''; while (n > 0) { const remainder = (n - 1) % 26; result = String.fromCharCode(65 + remainder) + result; n = Math.floor((n - 1) / 26) } return result }
function escapeXml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;') }
