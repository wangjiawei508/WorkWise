import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCoreFlowAdapters } from '../../flow/core-adapters.js'
import { buildFlowNodeRegistry } from '../../flow/node-registry.js'
import { FlowRepository } from '../../flow/repository.js'
import { FlowRuntimeService } from '../../flow/service.js'
import { flowRoutes } from './flows.js'

describe('Flow HTTP route contracts', () => {
  it('supports create, publish, version listing and archival deletion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-flow-routes-')); const service = new FlowRuntimeService(new FlowRepository(join(root, 'flow.sqlite')), buildFlowNodeRegistry(), buildCoreFlowAdapters())
    const draft = { schemaVersion: 1 as const, id: 'flow-route', name: 'Route Flow', description: '', nodes: [{ id: 'manual', type: 'manual_trigger', label: 'Manual', position: { x: 0, y: 0 }, bindings: {}, config: {}, policy: { timeoutMs: 1_000, retryAttempts: 0, retryBackoffMs: 0, errorBehavior: 'fail' as const, concurrencyLimit: 1, resumable: false, breakpoint: false }, disabled: false }], edges: [], variables: {} }
    const created = await flowRoutes.create(service, new Request('http://runtime/v1/flows', { method: 'POST', body: JSON.stringify(draft) })); expect(created.status).toBe(201)
    const published = await flowRoutes.publish(service, new Request('http://runtime/v1/flows/publish', { method: 'POST', body: JSON.stringify({ id: draft.id }) })); expect(published.status).toBe(201)
    expect(JSON.parse(flowRoutes.versions(service, draft.id).body).versions).toHaveLength(1)
    expect(flowRoutes.archive(service, draft.id).status).toBe(200); await expect(service.run(draft.id, {})).rejects.toThrow('archived')
    service.shutdown()
  })
})
