import { describe, expect, it, vi } from 'vitest'
import type { EngineeringRunPlanV1 } from '../../contracts/engineering-ai.js'
import type { ServerRuntime } from './server-runtime.js'
import { createPlan, latestPlan } from './engineering-ai.js'

function plan(): EngineeringRunPlanV1 {
  return {
    schemaVersion: 1,
    id: 'eplan-route-1',
    threadId: 'thread-route-1',
    projectId: 'project-route-1',
    contextHash: 'context-route-1',
    revision: 1,
    goal: '检查本期水准网',
    steps: [{
      id: 'validate',
      title: '校核观测数据',
      tool: 'monitoring_data_first_check',
      risk: 'read',
      dependsOn: [],
      inputHash: 'context-route-1',
      approval: 'pending'
    }],
    status: 'awaiting_approval',
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z'
  }
}

describe('engineering AI HTTP handlers', () => {
  it('awaits plan creation and returns the persisted approval boundary', async () => {
    const created = plan()
    const approval = {
      schemaVersion: 1 as const,
      planId: created.id,
      planRevision: created.revision,
      contextHash: created.contextHash,
      stepIds: ['validate'],
      token: 'approval-token-route-0001',
      expiresAt: '2026-09-04T00:15:00.000Z'
    }
    const create = vi.fn(async () => ({ plan: created, approval }))
    const response = await createPlan({ engineeringAi: { createPlan: create } } as never, new Request('http://runtime/v1/engineering/ai/plans', {
      method: 'POST',
      body: JSON.stringify({
        threadId: created.threadId,
        projectId: created.projectId,
        goal: created.goal,
        idempotencyKey: 'route-create-plan-001'
      })
    }))

    expect(response.status).toBe(201)
    expect(JSON.parse(String(response.body))).toEqual({ plan: created, approval })
    expect(create).toHaveBeenCalledOnce()
  })

  it('restores only a plan scoped to the requested thread and project', async () => {
    const restored = plan()
    const latest = vi.fn(async () => ({ plan: restored }))
    const runtime = { engineeringAi: { latestPlan: latest } } as unknown as ServerRuntime
    const response = await latestPlan(runtime, new Request(`http://runtime/v1/engineering/ai/plans?threadId=${restored.threadId}&projectId=${restored.projectId}`))

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ plan: restored })
    expect(latest).toHaveBeenCalledWith({ threadId: restored.threadId, projectId: restored.projectId })

    const invalid = await latestPlan(runtime, new Request('http://runtime/v1/engineering/ai/plans?threadId=thread-only'))
    expect(invalid.status).toBe(400)
    expect(latest).toHaveBeenCalledOnce()
  })

  it('returns not found instead of inventing a recovered plan', async () => {
    const runtime = { engineeringAi: { latestPlan: vi.fn(async () => null) } } as unknown as ServerRuntime
    const response = await latestPlan(runtime, new Request('http://runtime/v1/engineering/ai/plans?threadId=thread-missing&projectId=project-missing'))

    expect(response.status).toBe(404)
    expect(JSON.parse(response.body)).toMatchObject({ code: 'not_found' })
  })
})
