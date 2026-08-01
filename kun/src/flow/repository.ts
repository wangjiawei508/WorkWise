import { createHash, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { FlowCredentialReferenceV1, FlowDefinitionV1, FlowEventV1, FlowNodeRunV1, FlowRunV1, FlowTriggerStateV1 } from '../contracts/flow.js'
import { FlowCredentialReferenceV1 as FlowCredentialReferenceSchema, FlowDefinitionV1 as FlowDefinitionSchema, FlowEventV1 as FlowEventSchema, FlowNodeRunV1 as FlowNodeRunSchema, FlowRunV1 as FlowRunSchema, FlowTriggerStateV1 as FlowTriggerStateSchema } from '../contracts/flow.js'

export class FlowRevisionConflictError extends Error {
  readonly code = 'flow_revision_conflict'
}

export class FlowRepository {
  private readonly db: Database.Database
  constructor(path: string, private readonly nowIso: () => string = () => new Date().toISOString()) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flow_definitions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, definition_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS flow_versions (id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, definition_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(flow_id, version), UNIQUE(flow_id, content_hash));
      CREATE TABLE IF NOT EXISTS flow_runs (id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, version_id TEXT NOT NULL, status TEXT NOT NULL, run_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS flow_node_runs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, node_id TEXT NOT NULL, attempt INTEGER NOT NULL, node_run_json TEXT NOT NULL, UNIQUE(run_id, node_id, attempt));
      CREATE TABLE IF NOT EXISTS flow_events (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, created_at TEXT NOT NULL, event_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS flow_events_run ON flow_events(run_id, created_at);
      CREATE TABLE IF NOT EXISTS flow_trigger_state (flow_id TEXT NOT NULL, node_id TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY(flow_id, node_id));
      CREATE TABLE IF NOT EXISTS flow_credential_references (id TEXT PRIMARY KEY, provider TEXT NOT NULL, safe_storage_key TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS flow_webhook_nonces (trigger_id TEXT NOT NULL, nonce TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(trigger_id, nonce));
      CREATE TABLE IF NOT EXISTS flow_migrations (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, completed_at TEXT NOT NULL);
    `)
  }

  create(input: Omit<FlowDefinitionV1, 'revision' | 'createdAt' | 'updatedAt'>): FlowDefinitionV1 {
    const now = this.nowIso(); const definition = FlowDefinitionSchema.parse({ ...input, revision: 1, createdAt: now, updatedAt: now })
    this.db.prepare('INSERT INTO flow_definitions(id, revision, definition_json, updated_at) VALUES (?, ?, ?, ?)')
      .run(definition.id, definition.revision, JSON.stringify(definition), now)
    return definition
  }

  get(id: string): FlowDefinitionV1 | null {
    const row = this.db.prepare('SELECT definition_json FROM flow_definitions WHERE id = ?').get(id) as { definition_json: string } | undefined
    return row ? FlowDefinitionSchema.parse(JSON.parse(row.definition_json)) : null
  }

  list(): FlowDefinitionV1[] {
    return (this.db.prepare('SELECT definition_json FROM flow_definitions ORDER BY updated_at DESC').all() as Array<{ definition_json: string }>)
      .map((row) => FlowDefinitionSchema.parse(JSON.parse(row.definition_json)))
  }

  update(definition: FlowDefinitionV1, expectedRevision: number): FlowDefinitionV1 {
    const current = this.get(definition.id)
    if (!current) throw new Error(`flow not found: ${definition.id}`)
    if (current.revision !== expectedRevision) throw new FlowRevisionConflictError(`Expected revision ${expectedRevision}, current revision is ${current.revision}`)
    const next = FlowDefinitionSchema.parse({ ...definition, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: this.nowIso() })
    const result = this.db.prepare('UPDATE flow_definitions SET revision = ?, definition_json = ?, updated_at = ? WHERE id = ? AND revision = ?')
      .run(next.revision, JSON.stringify(next), next.updatedAt, next.id, expectedRevision)
    if (result.changes !== 1) throw new FlowRevisionConflictError('Flow was updated concurrently')
    return next
  }

  publish(flowId: string): { id: string; flowId: string; version: number; hash: string; definition: FlowDefinitionV1; createdAt: string } {
    const definition = this.get(flowId); if (!definition) throw new Error(`flow not found: ${flowId}`)
    const canonical = stableStringify({ ...definition, publishedVersionId: undefined, updatedAt: undefined })
    const hash = createHash('sha256').update(canonical).digest('hex')
    const existing = this.db.prepare('SELECT * FROM flow_versions WHERE flow_id = ? AND content_hash = ?').get(flowId, hash) as VersionRow | undefined
    if (existing) return versionFromRow(existing)
    const current = this.db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM flow_versions WHERE flow_id = ?').get(flowId) as { version: number }
    const version = current.version + 1; const id = `flowver_${hash.slice(0, 24)}`; const createdAt = this.nowIso()
    this.db.prepare('INSERT INTO flow_versions(id, flow_id, version, content_hash, definition_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, flowId, version, hash, JSON.stringify(definition), createdAt)
    const next = FlowDefinitionSchema.parse({ ...definition, publishedVersionId: id })
    this.db.prepare('UPDATE flow_definitions SET definition_json = ? WHERE id = ?').run(JSON.stringify(next), flowId)
    return { id, flowId, version, hash, definition, createdAt }
  }

  getVersion(id: string) { const row = this.db.prepare('SELECT * FROM flow_versions WHERE id = ?').get(id) as VersionRow | undefined; return row ? versionFromRow(row) : null }
  listVersions(flowId: string): ReturnType<typeof versionFromRow>[] { return (this.db.prepare('SELECT * FROM flow_versions WHERE flow_id = ? ORDER BY version DESC').all(flowId) as VersionRow[]).map(versionFromRow) }

  createRun(input: Omit<FlowRunV1, 'id' | 'status' | 'startedAt' | 'updatedAt'> & { id?: string }): FlowRunV1 {
    const now = this.nowIso(); const run = FlowRunSchema.parse({ ...input, id: input.id ?? `flowrun_${randomUUID()}`, status: 'queued', startedAt: now, updatedAt: now })
    this.saveRun(run); return run
  }
  getRun(id: string): FlowRunV1 | null { const row = this.db.prepare('SELECT run_json FROM flow_runs WHERE id = ?').get(id) as { run_json: string } | undefined; return row ? FlowRunSchema.parse(JSON.parse(row.run_json)) : null }
  saveRun(run: FlowRunV1): void { const parsed = FlowRunSchema.parse(run); this.db.prepare(`INSERT INTO flow_runs(id, flow_id, version_id, status, run_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status, run_json=excluded.run_json, updated_at=excluded.updated_at`).run(parsed.id, parsed.flowId, parsed.versionId, parsed.status, JSON.stringify(parsed), parsed.updatedAt) }
  listRuns(flowId: string, limit = 100): FlowRunV1[] { return (this.db.prepare('SELECT run_json FROM flow_runs WHERE flow_id = ? ORDER BY updated_at DESC LIMIT ?').all(flowId, Math.max(1, Math.min(limit, 500))) as Array<{ run_json: string }>).map((row) => FlowRunSchema.parse(JSON.parse(row.run_json))) }
  listRunsByStatus(statuses: FlowRunV1['status'][]): FlowRunV1[] { if (!statuses.length) return []; const placeholders = statuses.map(() => '?').join(','); return (this.db.prepare(`SELECT run_json FROM flow_runs WHERE status IN (${placeholders}) ORDER BY updated_at`).all(...statuses) as Array<{ run_json: string }>).map((row) => FlowRunSchema.parse(JSON.parse(row.run_json))) }
  saveNodeRun(nodeRun: FlowNodeRunV1): void { const parsed = FlowNodeRunSchema.parse(nodeRun); this.db.prepare(`INSERT INTO flow_node_runs(id, run_id, node_id, attempt, node_run_json) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET node_run_json=excluded.node_run_json`).run(parsed.id, parsed.runId, parsed.nodeId, parsed.attempt, JSON.stringify(parsed)) }
  listNodeRuns(runId: string): FlowNodeRunV1[] { return (this.db.prepare('SELECT node_run_json FROM flow_node_runs WHERE run_id = ? ORDER BY node_id, attempt').all(runId) as Array<{ node_run_json: string }>).map((row) => FlowNodeRunSchema.parse(JSON.parse(row.node_run_json))) }
  deleteNodeRuns(runId: string, nodeIds: string[]): number { if (!nodeIds.length) return 0; const placeholders = nodeIds.map(() => '?').join(','); return this.db.prepare(`DELETE FROM flow_node_runs WHERE run_id = ? AND node_id IN (${placeholders})`).run(runId, ...nodeIds).changes }
  appendEvent(event: FlowEventV1): void { const parsed = FlowEventSchema.parse(event); this.db.prepare('INSERT INTO flow_events(id, run_id, created_at, event_json) VALUES (?, ?, ?, ?)').run(parsed.id, parsed.runId, parsed.createdAt, JSON.stringify(parsed)) }
  listEvents(runId: string): FlowEventV1[] { return (this.db.prepare('SELECT event_json FROM flow_events WHERE run_id = ? ORDER BY created_at').all(runId) as Array<{ event_json: string }>).map((row) => FlowEventSchema.parse(JSON.parse(row.event_json))) }
  saveTriggerState(state: FlowTriggerStateV1): void { const parsed = FlowTriggerStateSchema.parse(state); this.db.prepare(`INSERT INTO flow_trigger_state(flow_id, node_id, state_json) VALUES (?, ?, ?) ON CONFLICT(flow_id, node_id) DO UPDATE SET state_json=excluded.state_json`).run(parsed.flowId, parsed.nodeId, JSON.stringify(parsed)) }
  getTriggerState(flowId: string, nodeId: string): FlowTriggerStateV1 | null { const row = this.db.prepare('SELECT state_json FROM flow_trigger_state WHERE flow_id = ? AND node_id = ?').get(flowId, nodeId) as { state_json: string } | undefined; return row ? FlowTriggerStateSchema.parse(JSON.parse(row.state_json)) : null }
  listTriggerStates(flowId: string): FlowTriggerStateV1[] { return (this.db.prepare('SELECT state_json FROM flow_trigger_state WHERE flow_id = ?').all(flowId) as Array<{ state_json: string }>).map((row) => FlowTriggerStateSchema.parse(JSON.parse(row.state_json))) }
  listAllTriggerStates(): FlowTriggerStateV1[] { return (this.db.prepare('SELECT state_json FROM flow_trigger_state').all() as Array<{ state_json: string }>).map((row) => FlowTriggerStateSchema.parse(JSON.parse(row.state_json))) }
  findTriggerState(triggerId: string): FlowTriggerStateV1 | null { const rows = this.db.prepare('SELECT state_json FROM flow_trigger_state').all() as Array<{ state_json: string }>; for (const row of rows) { const state = FlowTriggerStateSchema.parse(JSON.parse(row.state_json)); if (state.state.triggerId === triggerId) return state } return null }
  saveCredentialReference(reference: FlowCredentialReferenceV1): void { const parsed = FlowCredentialReferenceSchema.parse(reference); this.db.prepare('INSERT INTO flow_credential_references(id, provider, safe_storage_key, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').run(parsed.id, parsed.provider, parsed.safeStorageKey, parsed.createdAt) }
  getCredentialReference(id: string): FlowCredentialReferenceV1 | null { const row = this.db.prepare('SELECT id, provider, safe_storage_key, created_at FROM flow_credential_references WHERE id = ?').get(id) as { id: string; provider: string; safe_storage_key: string; created_at: string } | undefined; return row ? FlowCredentialReferenceSchema.parse({ id: row.id, provider: row.provider, safeStorageKey: row.safe_storage_key, createdAt: row.created_at }) : null }
  rememberNonce(triggerId: string, nonce: string, acceptedAt: number): boolean { try { this.db.prepare('INSERT INTO flow_webhook_nonces(trigger_id, nonce, accepted_at) VALUES (?, ?, ?)').run(triggerId, nonce, acceptedAt); return true } catch { return false } }
  pruneNonces(before: number): number { return this.db.prepare('DELETE FROM flow_webhook_nonces WHERE accepted_at < ?').run(before).changes }
  setMigration(key: string, value: unknown): void { this.db.prepare(`INSERT INTO flow_migrations(key, value_json, completed_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING`).run(key, JSON.stringify(value), this.nowIso()) }
  saveMigration(key: string, value: unknown): void { this.db.prepare(`INSERT INTO flow_migrations(key, value_json, completed_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`).run(key, JSON.stringify(value), this.nowIso()) }
  getMigration(key: string): unknown | null { const row = this.db.prepare('SELECT value_json FROM flow_migrations WHERE key = ?').get(key) as { value_json: string } | undefined; return row ? JSON.parse(row.value_json) : null }
  close(): void { this.db.close() }
}

type VersionRow = { id: string; flow_id: string; version: number; content_hash: string; definition_json: string; created_at: string }
function versionFromRow(row: VersionRow) { return { id: row.id, flowId: row.flow_id, version: row.version, hash: row.content_hash, definition: FlowDefinitionSchema.parse(JSON.parse(row.definition_json)), createdAt: row.created_at } }
function stableStringify(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`; return JSON.stringify(value) }
