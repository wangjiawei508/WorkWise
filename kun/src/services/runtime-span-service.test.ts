import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuntimeSpanService } from './runtime-span-service.js'
import { TaskRunRepository } from './task-run-repository.js'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('RuntimeSpanService', () => {
  it('records duration and exports only redacted diagnostic attributes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-spans-'))
    cleanup.push(root)
    const repository = new TaskRunRepository(join(root, 'tasks.sqlite3'))
    let now = '2026-07-18T00:00:00.000Z'
    const spans = new RuntimeSpanService(repository, () => now)
    spans.start({
      id: 'span_1',
      taskId: 'task_1',
      turnId: 'turn_1',
      kind: 'turn',
      name: 'task-attempt',
      retryCount: 1,
      attributes: {
        attempt: 2,
        apiKey: 'sk-should-never-leak',
        workspace: '/Users/alice/private/customer-a',
        outcome: 'retrying'
      }
    })
    now = '2026-07-18T00:00:02.500Z'
    spans.finish('span_1', { status: 'error', errorCode: 'model_timeout' })

    const diagnostics = spans.diagnostics('task_1')
    expect(diagnostics.summary).toMatchObject({ total: 1, errors: 1, retries: 1, durationMs: 2500 })
    expect(diagnostics.spans[0]).toMatchObject({
      status: 'error',
      errorCode: 'model_timeout',
      attributes: {
        apiKey: '<redacted>',
        workspace: '<redacted-path>',
        outcome: 'retrying'
      }
    })
    expect(JSON.stringify(diagnostics)).not.toContain('should-never-leak')
    expect(JSON.stringify(diagnostics)).not.toContain('/Users/alice')
    repository.close()
  })
})
