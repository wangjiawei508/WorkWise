import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createThreadRecord } from '../../domain/thread.js'
import { HybridThreadStore } from './hybrid-thread-store.js'

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('HybridThreadStore Agent index', () => {
  it('preserves selected Agent metadata in SQLite summaries and after restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-thread-agent-index-'))
    cleanup.push(root)
    const sqlitePath = join(root, 'index.sqlite3')
    const thread = createThreadRecord({
      id: 'thread_agent_index',
      title: 'Agent index',
      workspace: root,
      model: 'default-model',
      agentId: 'review',
      agentRevision: 2,
      agentProfile: {
        id: 'review', name: 'Review', role: '审查', color: '#f59e0b',
        systemPrompt: '只读审查。', model: 'review-model',
        toolAllowlist: ['read'], mcpAllowlist: [], trustLevel: 'read-only',
        budget: { maxAttempts: 3, maxDurationMs: 60_000 }, revision: 1
      }
    })
    const first = new HybridThreadStore({ dataDir: root, sqlitePath })
    await first.ready()
    await first.upsert(thread)
    expect((await first.list({ includeArchived: true }))[0]).toMatchObject({
      agentId: 'review', agentRevision: 2, agentProfile: { model: 'review-model' }
    })
    first.close()

    const reopened = new HybridThreadStore({ dataDir: root, sqlitePath })
    await reopened.ready()
    expect(await reopened.get(thread.id)).toMatchObject({
      agentId: 'review', agentRevision: 2, agentProfile: { trustLevel: 'read-only' }
    })
    reopened.close()
  })
})
