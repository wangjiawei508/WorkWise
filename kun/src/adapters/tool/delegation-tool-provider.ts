import type { DelegationRuntime } from '../../delegation/delegation-runtime.js'
import type { CapabilityToolProvider } from './capability-registry.js'
import { LocalToolHost } from './local-tool-host.js'

export function buildDelegationToolProviders(runtime: DelegationRuntime | undefined): CapabilityToolProvider[] {
  if (!runtime) return []
  return [{
    id: 'delegation',
    kind: 'delegation',
    enabled: true,
    available: true,
    tools: [
      LocalToolHost.defineTool({
        name: 'delegate_task',
        description: 'Run, detach, inspect, or terminate a bounded child agent task.',
        inputSchema: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            prompt: { type: 'string' },
            workspace: { type: 'string' },
            model: { type: 'string' }
            ,action: { type: 'string', enum: ['run', 'status', 'terminate'] }
            ,child_id: { type: 'string' }
            ,detached: { type: 'boolean' }
            ,max_duration_ms: { type: 'number' }
          },
          required: ['prompt'],
          additionalProperties: false
        },
        policy: 'auto',
        shouldAdvertise: (context) => context.delegationPolicy?.enabled === true,
        execute: async (args, context) => {
          const action = typeof args.action === 'string' ? args.action : 'run'
          const childId = typeof args.child_id === 'string' ? args.child_id.trim() : ''
          if (action === 'status') {
            if (!childId) return { output: { error: 'child_id is required' }, isError: true }
            const record = (await runtime.diagnostics(context.threadId)).childRuns.find((child) => child.id === childId)
            return record
              ? { output: record }
              : { output: { error: 'child task not found' }, isError: true }
          }
          if (action === 'terminate') {
            if (!childId) return { output: { error: 'child_id is required' }, isError: true }
            const record = await runtime.terminateChild(childId)
            return record
              ? { output: record, isError: record.status === 'failed' }
              : { output: { error: 'child task not found' }, isError: true }
          }
          const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
          if (!prompt) return { output: { error: 'prompt is required' }, isError: true }
          const requestedModel = typeof args.model === 'string' ? args.model.trim() : ''
          const inheritedModel = context.model?.id
          if (
            requestedModel &&
            requestedModel !== inheritedModel &&
            !context.delegationPolicy?.allowedModels?.includes(requestedModel)
          ) {
            return { output: { error: 'requested child model is outside the effective Agent policy' }, isError: true }
          }
          const spawnIndex = (await runtime.diagnostics(context.threadId)).childRuns.length + 1
          const detached = args.detached === true
          const childInput = {
            parentThreadId: context.threadId,
            parentTurnId: context.turnId,
            label: typeof args.label === 'string' ? args.label : undefined,
            prompt,
            workspace: typeof args.workspace === 'string' ? args.workspace : context.workspace,
            model: requestedModel || inheritedModel,
            signal: context.abortSignal,
            ...(typeof args.max_duration_ms === 'number' ? { maxDurationMs: args.max_duration_ms } : {})
          }
          const record = detached
            ? await runtime.startChild({ ...childInput, executionMode: 'detached' })
            : await runtime.runChild(childInput)
          return {
            output: {
              childId: record.id,
              status: record.status,
              summary: record.summary,
              error: record.error,
              usage: record.usage,
              ...(spawnIndex > 1
                ? { warning: `This is child agent spawn #${spawnIndex} for the thread. Spawn only when the extra prefix/cache cost is worth it.` }
                : {})
            },
            isError: record.status === 'failed' || record.status === 'aborted'
          }
        }
      })
    ]
  }]
}
