import type { RuntimeSpan } from '../contracts/tasks.js'
import { RuntimeSpanSchema } from '../contracts/tasks.js'
import type { TaskRunRepository } from './task-run-repository.js'

const SENSITIVE_KEY = /(authorization|cookie|secret|token|api[-_]?key|password|prompt|document|body|headers?|command|args?)/i
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/-]+=*|sk-[a-z0-9_-]{12,}|[a-f0-9]{32,})/i
const ABSOLUTE_PATH = /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[a-z]:\\Users\\[^\\\s]+\\|\\\\[^\\\s]+\\)/i

export class RuntimeSpanService {
  constructor(private readonly repository: TaskRunRepository, private readonly nowIso: () => string) {}

  start(input: Omit<RuntimeSpan, 'status' | 'startedAt' | 'attributes'> & {
    startedAt?: string
    attributes?: RuntimeSpan['attributes']
  }): RuntimeSpan {
    return this.repository.upsertRuntimeSpan(RuntimeSpanSchema.parse({
      ...input,
      status: 'running',
      startedAt: input.startedAt ?? this.nowIso(),
      attributes: redactAttributes(input.attributes ?? {})
    }))
  }

  finish(spanId: string, input: {
    status: 'ok' | 'error' | 'cancelled'
    errorCode?: string
    inputTokens?: number
    outputTokens?: number
    cacheHit?: boolean
    attributes?: RuntimeSpan['attributes']
  }): RuntimeSpan | null {
    const current = this.repository.getRuntimeSpan(spanId)
    if (!current || current.status !== 'running') return current
    const finishedAt = this.nowIso()
    return this.repository.upsertRuntimeSpan({
      ...current,
      ...input,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(current.startedAt)),
      attributes: redactAttributes({ ...current.attributes, ...(input.attributes ?? {}) })
    })
  }

  finishTurn(taskId: string, turnId: string, input: Parameters<RuntimeSpanService['finish']>[1]): RuntimeSpan | null {
    const active = this.repository.listRuntimeSpans({ taskId, turnId, limit: 20 })
      .find((span) => span.kind === 'turn' && span.status === 'running')
    return active ? this.finish(active.id, input) : null
  }

  list(taskId: string): RuntimeSpan[] {
    return this.repository.listRuntimeSpans({ taskId })
  }

  diagnostics(taskId: string): {
    taskId: string
    summary: { total: number; running: number; errors: number; retries: number; durationMs: number }
    spans: RuntimeSpan[]
  } {
    const spans = this.list(taskId)
    return {
      taskId,
      summary: {
        total: spans.length,
        running: spans.filter((span) => span.status === 'running').length,
        errors: spans.filter((span) => span.status === 'error').length,
        retries: spans.reduce((sum, span) => sum + span.retryCount, 0),
        durationMs: spans.reduce((sum, span) => sum + (span.durationMs ?? 0), 0)
      },
      spans
    }
  }

  prune(retentionDays = 30): number {
    const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    return this.repository.pruneRuntimeSpans(before)
  }
}

export function redactAttributes(
  attributes: RuntimeSpan['attributes']
): RuntimeSpan['attributes'] {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => {
    if (SENSITIVE_KEY.test(key)) return [key, '<redacted>']
    if (typeof value !== 'string') return [key, value]
    if (SECRET_VALUE.test(value)) return [key, '<redacted-secret>']
    if (ABSOLUTE_PATH.test(value)) return [key, '<redacted-path>']
    return [key, value.slice(0, 1_000)]
  }))
}
