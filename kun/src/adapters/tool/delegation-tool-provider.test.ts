import { describe, expect, it } from 'vitest'
import { CapabilityRegistry } from './capability-registry.js'
import { buildDelegationToolProviders } from './delegation-tool-provider.js'
import type { DelegationRuntime } from '../../delegation/delegation-runtime.js'
import type { ToolHostContext } from '../../ports/tool-host.js'

function context(enabled: boolean): ToolHostContext {
  return {
    threadId: 'thread',
    turnId: 'turn',
    workspace: '/tmp/workspace',
    threadMode: 'agent',
    delegationPolicy: { enabled, maxParallel: 2, maxChildRuns: 8 },
    approvalPolicy: 'auto',
    sandboxMode: 'workspace-write',
    abortSignal: new AbortController().signal,
    awaitApproval: async () => 'allow'
  }
}

describe('delegation tool policy', () => {
  it('only advertises delegation when the effective Agent policy enables it', () => {
    const runtime = {} as DelegationRuntime
    const registry = new CapabilityRegistry(buildDelegationToolProviders(runtime))
    expect(registry.listTools(context(false))).toEqual([])
    expect(registry.listTools(context(true)).map((tool) => tool.name)).toEqual(['delegate_task'])
  })
})
