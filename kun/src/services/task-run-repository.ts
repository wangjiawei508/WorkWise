import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3'
import {
  TaskCheckpointSchema,
  TaskNodeSchema,
  TaskRunSchema,
  ShellSessionSchema,
  RuntimeSpanSchema,
  type TaskCheckpoint,
  type TaskEvent,
  type TaskLease,
  type TaskNode,
  type TaskRun,
  type TaskRunStatus,
  type ShellSession,
  type RuntimeSpan
} from '../contracts/tasks.js'

const TERMINAL_TASK_STATUSES = new Set<TaskRunStatus>(['completed', 'failed', 'cancelled'])

type TaskRunRow = {
  id: string
  thread_id: string
  status: string
  updated_at: string
  revision: number
  data_json: string
}

type ShellSessionRow = {
  id: string
  task_id: string
  status: string
  updated_at: string
  revision: number
  data_json: string
}

type RuntimeSpanRow = {
  data_json: string
}

export class TaskRevisionConflictError extends Error {
  readonly code = 'stale_request'

  constructor(readonly expectedRevision: number, readonly actualRevision: number) {
    super(`task revision conflict: expected ${expectedRevision}, actual ${actualRevision}`)
  }
}

export class TaskRunRepository {
  private readonly db: BetterSqliteDatabase

  constructor(path: string) {
    const sqlitePath = resolve(path)
    mkdirSync(dirname(sqlitePath), { recursive: true })
    this.db = new Database(sqlitePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  create(task: TaskRun): TaskRun {
    const parsed = TaskRunSchema.parse(task)
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO task_runs(id, thread_id, status, updated_at, revision, data_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(parsed.id, parsed.threadId, parsed.status, parsed.updatedAt, parsed.revision, JSON.stringify(parsed))
      this.replaceNodes(parsed)
      this.appendEventInternal(parsed.id, `task-created:${parsed.id}`, 'task_created', { status: parsed.status }, parsed.createdAt)
    })
    return parsed
  }

  get(taskId: string): TaskRun | null {
    const row = this.db.prepare('SELECT * FROM task_runs WHERE id = ?').get(taskId) as TaskRunRow | undefined
    return row ? this.parseRun(row) : null
  }

  findActiveByThread(threadId: string): TaskRun | null {
    const row = this.db.prepare(`
      SELECT * FROM task_runs
      WHERE thread_id = ? AND status NOT IN ('completed', 'failed', 'cancelled')
      ORDER BY updated_at DESC LIMIT 1
    `).get(threadId) as TaskRunRow | undefined
    return row ? this.parseRun(row) : null
  }

  list(input: { threadId?: string; status?: TaskRunStatus; limit?: number } = {}): TaskRun[] {
    const clauses: string[] = []
    const values: Array<string | number> = []
    if (input.threadId) {
      clauses.push('thread_id = ?')
      values.push(input.threadId)
    }
    if (input.status) {
      clauses.push('status = ?')
      values.push(input.status)
    }
    values.push(Math.max(1, Math.min(input.limit ?? 100, 500)))
    const rows = this.db.prepare(`
      SELECT * FROM task_runs
      ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY updated_at DESC LIMIT ?
    `).all(...values) as TaskRunRow[]
    return rows.map((row) => this.parseRun(row))
  }

  update(
    taskId: string,
    expectedRevision: number,
    mutator: (current: TaskRun) => TaskRun,
    event?: { key: string; kind: string; payload?: Record<string, unknown>; createdAt?: string }
  ): TaskRun {
    return this.transaction(() => {
      const current = this.get(taskId)
      if (!current) throw Object.assign(new Error(`task not found: ${taskId}`), { code: 'not_found' })
      if (current.revision !== expectedRevision) {
        throw new TaskRevisionConflictError(expectedRevision, current.revision)
      }
      const candidate = mutator(current)
      if (TERMINAL_TASK_STATUSES.has(current.status) && candidate.status !== current.status) {
        throw Object.assign(new Error(`terminal task cannot transition from ${current.status}`), {
          code: 'invalid_state'
        })
      }
      const next = TaskRunSchema.parse({
        ...candidate,
        id: current.id,
        threadId: current.threadId,
        createdAt: current.createdAt,
        revision: current.revision + 1
      })
      const result = this.db.prepare(`
        UPDATE task_runs SET status = ?, updated_at = ?, revision = ?, data_json = ?
        WHERE id = ? AND revision = ?
      `).run(next.status, next.updatedAt, next.revision, JSON.stringify(next), taskId, expectedRevision)
      if (result.changes !== 1) {
        const actual = this.get(taskId)?.revision ?? expectedRevision
        throw new TaskRevisionConflictError(expectedRevision, actual)
      }
      this.replaceNodes(next)
      if (event) {
        this.appendEventInternal(
          taskId,
          event.key,
          event.kind,
          event.payload ?? {},
          event.createdAt ?? next.updatedAt
        )
      }
      return next
    })
  }

  saveCheckpoint(checkpoint: TaskCheckpoint): TaskCheckpoint {
    const parsed = TaskCheckpointSchema.parse(checkpoint)
    this.db.prepare(`
      INSERT INTO task_checkpoints(id, task_id, created_at, revision, data_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        revision = excluded.revision,
        data_json = excluded.data_json
      WHERE excluded.revision >= task_checkpoints.revision
    `).run(parsed.id, parsed.taskId, parsed.createdAt, parsed.revision, JSON.stringify(parsed))
    return parsed
  }

  latestCheckpoint(taskId: string): TaskCheckpoint | null {
    const row = this.db.prepare(`
      SELECT data_json FROM task_checkpoints WHERE task_id = ?
      ORDER BY created_at DESC, revision DESC LIMIT 1
    `).get(taskId) as { data_json: string } | undefined
    return row ? TaskCheckpointSchema.parse(JSON.parse(row.data_json)) : null
  }

  events(taskId: string, afterSequence = 0): TaskEvent[] {
    const rows = this.db.prepare(`
      SELECT task_id, sequence, event_key, kind, payload_json, created_at
      FROM task_events WHERE task_id = ? AND sequence > ? ORDER BY sequence ASC
    `).all(taskId, afterSequence) as Array<{
      task_id: string
      sequence: number
      event_key: string
      kind: string
      payload_json: string
      created_at: string
    }>
    return rows.map((row) => ({
      taskId: row.task_id,
      sequence: row.sequence,
      eventKey: row.event_key,
      kind: row.kind,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at
    }))
  }

  acquireLease(taskId: string, ownerId: string, nowIso: string, expiresAt: string): TaskLease | null {
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM task_leases WHERE task_id = ?').get(taskId) as {
        task_id: string
        owner_id: string
        acquired_at: string
        expires_at: string
        revision: number
      } | undefined
      if (existing && existing.owner_id !== ownerId && existing.expires_at > nowIso) return null
      const nextRevision = (existing?.revision ?? -1) + 1
      this.db.prepare(`
        INSERT INTO task_leases(task_id, owner_id, acquired_at, expires_at, revision)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          owner_id = excluded.owner_id,
          acquired_at = excluded.acquired_at,
          expires_at = excluded.expires_at,
          revision = excluded.revision
      `).run(taskId, ownerId, nowIso, expiresAt, nextRevision)
      return { taskId, ownerId, acquiredAt: nowIso, expiresAt, revision: nextRevision }
    })
  }

  releaseLease(taskId: string, ownerId: string): boolean {
    return this.db.prepare('DELETE FROM task_leases WHERE task_id = ? AND owner_id = ?').run(taskId, ownerId).changes === 1
  }

  reconcileExpired(nowIso: string): TaskRun[] {
    const rows = this.db.prepare(`
      SELECT r.* FROM task_runs r
      LEFT JOIN task_leases l ON l.task_id = r.id
      WHERE r.status IN ('running', 'retrying') AND (l.task_id IS NULL OR l.expires_at <= ?)
    `).all(nowIso) as TaskRunRow[]
    return rows.map((row) => this.parseRun(row))
  }

  createShellSession(session: ShellSession): ShellSession {
    const parsed = ShellSessionSchema.parse(session)
    this.db.prepare(`
      INSERT INTO shell_sessions(id, task_id, status, updated_at, revision, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      parsed.id,
      parsed.taskId,
      parsed.status,
      parsed.startedAt ?? parsed.createdAt,
      parsed.revision,
      JSON.stringify(parsed)
    )
    return parsed
  }

  getShellSession(sessionId: string): ShellSession | null {
    const row = this.db.prepare('SELECT * FROM shell_sessions WHERE id = ?').get(sessionId) as ShellSessionRow | undefined
    return row ? ShellSessionSchema.parse(JSON.parse(row.data_json)) : null
  }

  listShellSessions(taskId?: string): ShellSession[] {
    const rows = (taskId
      ? this.db.prepare('SELECT * FROM shell_sessions WHERE task_id = ? ORDER BY updated_at DESC').all(taskId)
      : this.db.prepare('SELECT * FROM shell_sessions ORDER BY updated_at DESC LIMIT 500').all()) as ShellSessionRow[]
    return rows.map((row) => ShellSessionSchema.parse(JSON.parse(row.data_json)))
  }

  updateShellSession(
    sessionId: string,
    expectedRevision: number,
    mutator: (current: ShellSession) => ShellSession
  ): ShellSession {
    return this.transaction(() => {
      const current = this.getShellSession(sessionId)
      if (!current) throw Object.assign(new Error(`shell session not found: ${sessionId}`), { code: 'not_found' })
      if (current.revision !== expectedRevision) throw new TaskRevisionConflictError(expectedRevision, current.revision)
      const next = ShellSessionSchema.parse({
        ...mutator(current),
        id: current.id,
        taskId: current.taskId,
        createdAt: current.createdAt,
        revision: current.revision + 1
      })
      const updatedAt = next.finishedAt ?? next.startedAt ?? next.createdAt
      const result = this.db.prepare(`
        UPDATE shell_sessions SET status = ?, updated_at = ?, revision = ?, data_json = ?
        WHERE id = ? AND revision = ?
      `).run(next.status, updatedAt, next.revision, JSON.stringify(next), sessionId, expectedRevision)
      if (result.changes !== 1) throw new TaskRevisionConflictError(expectedRevision, this.getShellSession(sessionId)?.revision ?? expectedRevision)
      return next
    })
  }

  reconcileShellSessionsStartup(nowIso: string): ShellSession[] {
    const rows = this.db.prepare(`
      SELECT * FROM shell_sessions WHERE status IN ('starting', 'running')
    `).all() as ShellSessionRow[]
    return rows.map((row) => {
      const current = ShellSessionSchema.parse(JSON.parse(row.data_json))
      return this.updateShellSession(current.id, current.revision, (session) => ({
        ...session,
        status: 'interrupted',
        finishedAt: nowIso
      }))
    })
  }

  upsertRuntimeSpan(span: RuntimeSpan): RuntimeSpan {
    const parsed = RuntimeSpanSchema.parse(span)
    this.db.prepare(`
      INSERT INTO runtime_spans(id, task_id, turn_id, kind, status, started_at, finished_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        turn_id = excluded.turn_id,
        kind = excluded.kind,
        status = excluded.status,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        data_json = excluded.data_json
    `).run(
      parsed.id,
      parsed.taskId ?? null,
      parsed.turnId ?? null,
      parsed.kind,
      parsed.status,
      parsed.startedAt,
      parsed.finishedAt ?? null,
      JSON.stringify(parsed)
    )
    return parsed
  }

  getRuntimeSpan(spanId: string): RuntimeSpan | null {
    const row = this.db.prepare('SELECT data_json FROM runtime_spans WHERE id = ?').get(spanId) as RuntimeSpanRow | undefined
    return row ? RuntimeSpanSchema.parse(JSON.parse(row.data_json)) : null
  }

  listRuntimeSpans(input: { taskId?: string; turnId?: string; limit?: number } = {}): RuntimeSpan[] {
    const clauses: string[] = []
    const values: Array<string | number> = []
    if (input.taskId) {
      clauses.push('task_id = ?')
      values.push(input.taskId)
    }
    if (input.turnId) {
      clauses.push('turn_id = ?')
      values.push(input.turnId)
    }
    values.push(Math.max(1, Math.min(input.limit ?? 500, 5_000)))
    const rows = this.db.prepare(`
      SELECT data_json FROM runtime_spans
      ${clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY started_at DESC LIMIT ?
    `).all(...values) as RuntimeSpanRow[]
    return rows.map((row) => RuntimeSpanSchema.parse(JSON.parse(row.data_json)))
  }

  pruneRuntimeSpans(beforeIso: string, keepLatest = 5_000): number {
    const old = this.db.prepare('DELETE FROM runtime_spans WHERE started_at < ?').run(beforeIso).changes
    const overflow = this.db.prepare(`
      DELETE FROM runtime_spans WHERE id IN (
        SELECT id FROM runtime_spans ORDER BY started_at DESC LIMIT -1 OFFSET ?
      )
    `).run(Math.max(100, keepLatest)).changes
    return old + overflow
  }

  private replaceNodes(task: TaskRun): void {
    this.db.prepare('DELETE FROM task_nodes WHERE task_id = ?').run(task.id)
    const insert = this.db.prepare(`
      INSERT INTO task_nodes(id, task_id, kind, status, revision, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const rawNode of task.nodes) {
      const node = TaskNodeSchema.parse(rawNode)
      insert.run(node.id, node.taskId, node.kind, node.status, node.revision, JSON.stringify(node))
    }
  }

  private appendEventInternal(
    taskId: string,
    eventKey: string,
    kind: string,
    payload: Record<string, unknown>,
    createdAt: string
  ): void {
    const row = this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS seq FROM task_events WHERE task_id = ?')
      .get(taskId) as { seq: number }
    this.db.prepare(`
      INSERT OR IGNORE INTO task_events(task_id, sequence, event_key, kind, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(taskId, row.seq + 1, eventKey, kind, JSON.stringify(payload), createdAt)
  }

  private parseRun(row: TaskRunRow): TaskRun {
    return TaskRunSchema.parse(JSON.parse(row.data_json))
  }

  private transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_runs_thread_updated_idx
        ON task_runs(thread_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS task_runs_status_updated_idx
        ON task_runs(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS task_nodes (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_nodes_task_idx ON task_nodes(task_id);
      CREATE TABLE IF NOT EXISTS task_checkpoints (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        revision INTEGER NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_checkpoints_task_created_idx
        ON task_checkpoints(task_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS task_events (
        task_id TEXT NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        event_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(task_id, sequence),
        UNIQUE(task_id, event_key)
      );
      CREATE TABLE IF NOT EXISTS task_leases (
        task_id TEXT PRIMARY KEY REFERENCES task_runs(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS shell_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS shell_sessions_task_idx ON shell_sessions(task_id);
      CREATE TABLE IF NOT EXISTS runtime_spans (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        turn_id TEXT,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS runtime_spans_task_started_idx
        ON runtime_spans(task_id, started_at DESC);
    `)
  }
}
