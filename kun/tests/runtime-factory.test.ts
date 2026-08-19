import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { InMemorySessionStore } from '../src/adapters/in-memory-session-store.js'
import { InMemoryThreadStore } from '../src/adapters/in-memory-thread-store.js'
import { createThreadRecord } from '../src/domain/thread.js'
import { UsageService } from '../src/services/usage-service.js'
import { KunCapabilitiesConfig } from '../src/contracts/capabilities.js'
import { createKunServeRuntime, seedUsageCarryover } from '../src/server/runtime-factory.js'
import type { UsageSnapshot } from '../src/contracts/usage.js'
import type { SessionStore } from '../src/ports/session-store.js'

function usage(overrides: Partial<UsageSnapshot>): UsageSnapshot {
  const promptTokens = overrides.promptTokens ?? 10
  const completionTokens = overrides.completionTokens ?? 5
  const cacheHitTokens = overrides.cacheHitTokens ?? 0
  const cacheMissTokens = overrides.cacheMissTokens ?? Math.max(promptTokens - cacheHitTokens, 0)
  const cacheTotal = cacheHitTokens + cacheMissTokens
  return {
    promptTokens,
    completionTokens,
    totalTokens: overrides.totalTokens ?? promptTokens + completionTokens,
    cachedTokens: overrides.cachedTokens ?? cacheHitTokens,
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate: cacheTotal === 0 ? null : cacheHitTokens / cacheTotal,
    turns: overrides.turns ?? 1,
    ...(overrides.costUsd !== undefined ? { costUsd: overrides.costUsd } : {})
  }
}

describe('runtime factory usage carryover', () => {
  it('seeds runtime usage from the latest persisted cumulative usage event per thread', async () => {
    const threadStore = new InMemoryThreadStore()
    const sessionStore = new InMemorySessionStore()
    const usageService = new UsageService()
    await threadStore.upsert(createThreadRecord({
      id: 'thr_seed',
      title: 'Seeded thread',
      workspace: '/tmp/project',
      model: 'deepseek-chat'
    }))
    await sessionStore.appendEvent('thr_seed', {
      kind: 'usage',
      seq: 2,
      timestamp: '2026-06-02T09:00:00.000Z',
      threadId: 'thr_seed',
      usage: usage({ promptTokens: 20, completionTokens: 5, cacheHitTokens: 10, cacheMissTokens: 10, turns: 1 })
    })
    await sessionStore.appendEvent('thr_seed', {
      kind: 'usage',
      seq: 5,
      timestamp: '2026-06-02T09:05:00.000Z',
      threadId: 'thr_seed',
      usage: usage({ promptTokens: 80, completionTokens: 20, cacheHitTokens: 72, cacheMissTokens: 8, turns: 3 })
    })

    await seedUsageCarryover({ threadStore, sessionStore, usageService })

    expect(usageService.forThread('thr_seed')).toMatchObject({
      promptTokens: 80,
      completionTokens: 20,
      totalTokens: 100,
      cacheHitTokens: 72,
      cacheMissTokens: 8,
      turns: 3
    })
    expect(usageService.cacheSnapshot('thr_seed')).toMatchObject({
      hits: 72,
      misses: 8,
      hitRate: 0.9
    })
  })

  it('seeds runtime usage from indexed latest snapshots without replaying event logs', async () => {
    const threadStore = new InMemoryThreadStore()
    const sessionStore = new InMemorySessionStore() as InMemorySessionStore & {
      loadLatestUsageSnapshots: NonNullable<SessionStore['loadLatestUsageSnapshots']>
    }
    const usageService = new UsageService()
    sessionStore.loadLatestUsageSnapshots = vi.fn(async () => [
      {
        threadId: 'thr_indexed',
        seq: 9,
        usage: usage({ promptTokens: 120, completionTokens: 30, cacheHitTokens: 100, cacheMissTokens: 20, turns: 4 })
      }
    ])
    const loadEventsSince = vi.spyOn(sessionStore, 'loadEventsSince')

    await seedUsageCarryover({ threadStore, sessionStore, usageService })

    expect(loadEventsSince).not.toHaveBeenCalled()
    expect(usageService.forThread('thr_indexed')).toMatchObject({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      cacheHitTokens: 100,
      cacheMissTokens: 20,
      turns: 4
    })
  })
})

describe('runtime factory vision evidence configuration', () => {
  it.each(['', 'not a valid endpoint'])('starts without an analyzer for enabled invalid endpoint %j and fails only image turns', async (endpoint) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'kun-runtime-vision-'))
    let runtime: Awaited<ReturnType<typeof createKunServeRuntime>> | undefined
    try {
      runtime = await createKunServeRuntime({
        host: '127.0.0.1',
        port: 0,
        dataDir,
        runtimeToken: 'test-token',
        apiKey: 'not-used',
        baseUrl: 'http://127.0.0.1:9',
        model: 'deepseek-v4-pro',
        approvalPolicy: 'on-request',
        sandboxMode: 'workspace-write',
        tokenEconomyMode: false,
        insecure: false,
        storage: { backend: 'file' },
        capabilities: KunCapabilitiesConfig.parse({ attachments: { enabled: true } }),
        visionEvidence: { enabled: true, endpoint }
      })
      const thread = await runtime.threadService.create({
        workspace: dataDir,
        model: 'deepseek-v4-pro',
        mode: 'agent'
      })
      const attachment = await runtime.attachmentStore?.create({
        name: 'evidence.png',
        data: png(1, 1),
        threadId: thread.id,
        workspace: dataDir
      })
      expect(attachment).toBeDefined()
      const turn = await runtime.turnService.startTurn({
        threadId: thread.id,
        request: { prompt: 'read this image', attachmentIds: [attachment!.id] }
      })

      await expect(runtime.runTurn(thread.id, turn.turnId)).resolves.toBe('failed')
      await expect(runtime.turnService.getTurn(thread.id, turn.turnId)).resolves.toMatchObject({
        status: 'failed',
        error: expect.stringContaining('attachment_analysis_unavailable')
      })
      const events = await runtime.sessionStore.loadEventsSince(thread.id, 0)
      expect(events.find((event) => event.kind === 'attachment_evidence_failed')).toMatchObject({
        attachmentId: attachment!.id,
        status: 'failed',
        message: 'vision evidence is not configured for this text-only model'
      })
    } finally {
      await runtime?.shutdown?.()
      await rm(dataDir, { recursive: true, force: true })
    }
  })
})

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  buffer[0] = 0x89
  buffer[1] = 0x50
  buffer[2] = 0x4e
  buffer[3] = 0x47
  buffer[4] = 0x0d
  buffer[5] = 0x0a
  buffer[6] = 0x1a
  buffer[7] = 0x0a
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}
