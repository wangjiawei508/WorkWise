import { describe, expect, it } from 'vitest'
import type { ModelRequest, ModelStreamChunk } from '../src/ports/model-client.js'
import { bootstrapThread, makeHarness } from './loop-test-harness.js'

describe('AgentLoop sandbox policy', () => {
  it('uses the active turn sandbox when advertising tools to the model', async () => {
    let observedRequest: ModelRequest | null = null
    const h = makeHarness({
      provider: 'sandbox-observer',
      model: 'sandbox-observer',
      async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
        observedRequest = request
        yield { kind: 'completed', stopReason: 'stop' }
      }
    })
    await bootstrapThread(h, {
      request: {
        prompt: 'inspect only',
        approvalPolicy: 'on-request',
        sandboxMode: 'read-only'
      }
    })

    const status = await h.loop.runTurn(h.threadId, h.turnId)

    expect(status).toBe('completed')
    const request = observedRequest as ModelRequest | null
    if (!request) throw new Error('expected model request')
    const toolNames = request.tools.map((tool) => tool.name)
    expect(toolNames).toEqual(expect.arrayContaining(['read', 'grep', 'find', 'ls']))
    expect(toolNames).not.toContain('bash')
    expect(toolNames).not.toContain('edit')
    expect(toolNames).not.toContain('write')
    expect(request.contextInstructions?.join('\n') ?? '').not.toContain('Shell runtime:')
  })
})
