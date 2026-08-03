import { describe, expect, it, vi } from 'vitest'
import type { ToolHostContext } from '../../ports/tool-host.js'
import { buildFlowToolProviders } from './flow-tool-provider.js'

describe('run_flow tool provider', () => {
  it('propagates the Runtime-owned invocation stack to the published Flow service', async () => {
    const run = vi.fn(async () => ({ id: 'run-1' })); const tool = buildFlowToolProviders({ run } as never)[0]!.tools[0]!
    const context = { flowInvocationStack: ['flow-parent'] } as ToolHostContext
    await expect(tool.execute({ flow_id: 'flow-child', input: { value: 1 } }, context)).resolves.toEqual({ output: { run: { id: 'run-1' } } })
    expect(run).toHaveBeenCalledWith('flow-child', { value: 1 }, ['flow-parent'])
  })
  it('returns a guarded error when recursion or depth is rejected', async () => {
    const run = vi.fn(async () => { throw new Error('recursive Flow invocation rejected') }); const tool = buildFlowToolProviders({ run } as never)[0]!.tools[0]!
    await expect(tool.execute({ flow_id: 'flow-parent' }, { flowInvocationStack: ['flow-parent'] } as ToolHostContext)).resolves.toMatchObject({ isError: true, output: { error: 'recursive Flow invocation rejected' } })
  })
})
