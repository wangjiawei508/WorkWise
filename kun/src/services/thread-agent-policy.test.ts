import { describe, expect, it } from 'vitest'
import { InMemoryEventBus } from '../adapters/in-memory-event-bus.js'
import { InMemorySessionStore } from '../adapters/in-memory-session-store.js'
import { InMemoryThreadStore } from '../adapters/in-memory-thread-store.js'
import { SequentialIdGenerator } from '../ports/id-generator.js'
import { RuntimeEventRecorder } from './runtime-event-recorder.js'
import { ThreadService } from './thread-service.js'

const PROFILE = {
  id: 'review',
  name: 'Review',
  role: '审查',
  color: '#f59e0b',
  systemPrompt: '只读审查并报告证据。',
  model: 'review-model',
  toolAllowlist: ['read', 'grep'],
  mcpAllowlist: [],
  trustLevel: 'read-only' as const,
  budget: { maxAttempts: 3, maxDurationMs: 60_000, maxCostUsd: 2 },
  revision: 1
}

describe('ThreadService Agent selection', () => {
  it('persists effective profile with revision checks and idempotent replay', async () => {
    const threadStore = new InMemoryThreadStore()
    const sessionStore = new InMemorySessionStore()
    const eventBus = new InMemoryEventBus()
    const nowIso = () => '2026-07-18T08:00:00.000Z'
    const service = new ThreadService({
      threadStore,
      sessionStore,
      ids: new SequentialIdGenerator(),
      nowIso,
      events: new RuntimeEventRecorder({
        eventBus,
        sessionStore,
        allocateSeq: (threadId) => eventBus.allocateSeq(threadId),
        nowIso
      })
    })
    const thread = await service.create({
      title: 'Agent policy',
      workspace: '/tmp/workwise-agent-policy',
      model: 'default-model',
      mode: 'agent'
    })

    const selected = await service.setAgent(thread.id, {
      agentId: 'review',
      profile: PROFILE,
      expectedRevision: 0,
      idempotencyKey: 'select-review-1'
    })
    expect(selected).toMatchObject({ agentId: 'review', agentRevision: 1, agentProfile: PROFILE })

    const replayed = await service.setAgent(thread.id, {
      agentId: 'review',
      profile: PROFILE,
      expectedRevision: 0,
      idempotencyKey: 'select-review-1'
    })
    expect(replayed.agentRevision).toBe(1)

    await expect(service.setAgent(thread.id, {
      agentId: 'review',
      profile: PROFILE,
      expectedRevision: 0,
      idempotencyKey: 'select-review-stale'
    })).rejects.toMatchObject({ code: 'stale_request' })
  })
})
