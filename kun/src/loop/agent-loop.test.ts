import { describe, expect, it } from 'vitest'
import { AgentLoop, resolvePlanModeToolSpecs } from './agent-loop.js'
import type { ModelClient, ModelToolSpec } from '../ports/model-client.js'
import type { ToolHost } from '../ports/tool-host.js'
import { InMemoryThreadStore } from '../adapters/in-memory-thread-store.js'
import { InMemorySessionStore } from '../adapters/in-memory-session-store.js'
import { InMemoryEventBus } from '../adapters/in-memory-event-bus.js'
import { InMemoryApprovalGate } from '../adapters/in-memory-approval-gate.js'
import { InMemoryUserInputGate } from '../adapters/in-memory-user-input-gate.js'
import { RuntimeEventRecorder } from '../services/runtime-event-recorder.js'
import { TurnService } from '../services/turn-service.js'
import { UsageService } from '../services/usage-service.js'
import { InflightTracker } from './inflight-tracker.js'
import { SteeringQueue } from './steering-queue.js'
import { ContextCompactor } from './context-compactor.js'
import { SequentialIdGenerator } from '../ports/id-generator.js'
import { createImmutablePrefix } from '../cache/immutable-prefix.js'
import { createThreadRecord } from '../domain/thread.js'

function spec(name: string): ModelToolSpec {
  return {
    name,
    description: `Tool: ${name}`,
    toolKind: name === 'create_plan' || name === 'write' || name === 'edit'
      ? 'file_change'
      : 'tool_call',
    inputSchema: { type: 'object', properties: {} }
  }
}

const ALL_TOOLS: ModelToolSpec[] = [
  spec('read'),
  spec('write'),
  spec('edit'),
  spec('ls'),
  spec('find'),
  spec('grep'),
  spec('bash'),
  spec('web_search'),
  spec('web_fetch'),
  spec('create_plan')
]

const READ_ONLY_TOOLS = new Set([
  'read', 'ls', 'find', 'grep', 'web_search', 'web_fetch'
])

describe('resolvePlanModeToolSpecs', () => {
  it('step 0: read-only tools + create_plan only', () => {
    const result = resolvePlanModeToolSpecs(ALL_TOOLS, {
      planTurnActive: true,
      createPlanSatisfied: false,
      stepIndex: 0,
      readOnlyToolNames: READ_ONLY_TOOLS
    })
    const names = result.map((t) => t.name)
    expect(names).toContain('read')
    expect(names).toContain('ls')
    expect(names).toContain('find')
    expect(names).toContain('grep')
    expect(names).toContain('web_search')
    expect(names).toContain('web_fetch')
    expect(names).toContain('create_plan')
    expect(names).not.toContain('write')
    expect(names).not.toContain('edit')
    expect(names).not.toContain('bash')
  })

  it('step > 0: only create_plan', () => {
    const result = resolvePlanModeToolSpecs(ALL_TOOLS, {
      planTurnActive: true,
      createPlanSatisfied: false,
      stepIndex: 1,
      readOnlyToolNames: READ_ONLY_TOOLS
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('create_plan')
  })

  it('plan satisfied: returns all tools unchanged (pass-through)', () => {
    const result = resolvePlanModeToolSpecs(ALL_TOOLS, {
      planTurnActive: true,
      createPlanSatisfied: true,
      stepIndex: 0,
      readOnlyToolNames: READ_ONLY_TOOLS
    })
    expect(result).toBe(ALL_TOOLS)
  })

  it('not plan-active: returns all tools unchanged (pass-through)', () => {
    const result = resolvePlanModeToolSpecs(ALL_TOOLS, {
      planTurnActive: false,
      createPlanSatisfied: false,
      stepIndex: 0,
      readOnlyToolNames: READ_ONLY_TOOLS
    })
    expect(result).toBe(ALL_TOOLS)
  })

  it('uses PLAN_READ_ONLY_TOOL_NAMES default when readOnlyToolNames omitted', () => {
    const result = resolvePlanModeToolSpecs(ALL_TOOLS, {
      planTurnActive: true,
      createPlanSatisfied: false,
      stepIndex: 0
    })
    const names = result.map((t) => t.name)
    // Default set excludes bash
    expect(names).not.toContain('bash')
    expect(names).toContain('create_plan')
    expect(names).toContain('read')
  })

  it('uses CREATE_PLAN_TOOL_NAME default when planToolName omitted', () => {
    const result = resolvePlanModeToolSpecs(ALL_TOOLS, {
      planTurnActive: true,
      createPlanSatisfied: false,
      stepIndex: 1
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('create_plan')
  })

  it('custom readOnlyToolNames and planToolName', () => {
    const customTools: ModelToolSpec[] = [
      spec('custom-read'),
      spec('custom-plan'),
      spec('write'),
      spec('bash')
    ]
    const result = resolvePlanModeToolSpecs(customTools, {
      planTurnActive: true,
      createPlanSatisfied: false,
      stepIndex: 0,
      readOnlyToolNames: new Set(['custom-read']),
      planToolName: 'custom-plan'
    })
    const names = result.map((t) => t.name)
    expect(names).toContain('custom-read')
    expect(names).toContain('custom-plan')
    expect(names).not.toContain('write')
    expect(names).not.toContain('bash')
  })
})

describe('AgentLoop completion guard', () => {
  it('completes a marked Write knowledge reply with one model step and one assistant message', async () => {
    const threadId = 'thread_write_kb'
    const nowIso = () => '2026-07-17T00:00:00.000Z'
    const threadStore = new InMemoryThreadStore()
    const sessionStore = new InMemorySessionStore()
    const eventBus = new InMemoryEventBus()
    const ids = new SequentialIdGenerator()
    const inflight = new InflightTracker()
    const steering = new SteeringQueue()
    const compactor = new ContextCompactor()
    const approvalGate = new InMemoryApprovalGate()
    const userInputGate = new InMemoryUserInputGate()
    const events = new RuntimeEventRecorder({
      eventBus,
      sessionStore,
      allocateSeq: (id) => eventBus.allocateSeq(id),
      nowIso
    })
    const turns = new TurnService({
      threadStore,
      sessionStore,
      events,
      inflight,
      steering,
      compactor,
      ids,
      nowIso
    })
    let modelSteps = 0
    const model: ModelClient = {
      provider: 'test',
      model: 'deepseek-v4-flash',
      async *stream() {
        modelSteps += 1
        yield {
          kind: 'assistant_text_delta',
          text: [
            '1. 检查监测点完损状态。',
            '2. 检查自动化采集设备运行状态。',
            '3. 核对异常检测与预警记录。',
            '',
            '任务已完成'
          ].join('\n')
        }
        yield { kind: 'completed', stopReason: 'stop' }
      }
    }
    const toolHost: ToolHost = {
      id: 'empty-test-host',
      async listTools() {
        return []
      },
      async execute() {
        throw new Error('no tool should be called')
      }
    }

    await threadStore.upsert(createThreadRecord({
      id: threadId,
      title: 'Write KB completion guard',
      workspace: '',
      model: model.model,
      createdAt: nowIso()
    }))
    const prompt = [
      '[写作上下文]',
      '当前文件: qa-ppt-source.md',
      '',
      '[RailWise 知识库检索结果]',
      '[RailWise 1] AI监测报告生成工具',
      '生成报告的参考资料。',
      '',
      '[用户请求]',
      '基于知识库生成最多 6 项现场巡检清单，并在末尾写“任务已完成”。不要生成文件，不要调用工具，不要继续追问。'
    ].join('\n')
    const started = await turns.startTurn({
      threadId,
      request: { prompt }
    })
    const loop = new AgentLoop({
      threadStore,
      sessionStore,
      approvalGate,
      userInputGate,
      model,
      toolHost,
      usage: new UsageService(),
      events,
      turns,
      inflight,
      steering,
      compactor,
      prefix: createImmutablePrefix(),
      ids,
      nowIso
    })

    await expect(loop.runTurn(threadId, started.turnId)).resolves.toBe('completed')

    const items = await sessionStore.loadItems(threadId)
    const persistedEvents = await sessionStore.loadEventsSince(threadId, 0)
    expect(modelSteps).toBe(1)
    expect(items.filter((item) => item.kind === 'assistant_text')).toHaveLength(1)
    expect(items.filter((item) => item.kind === 'error')).toHaveLength(0)
    expect(persistedEvents.filter((event) => event.kind === 'turn_completed')).toHaveLength(1)
    expect(persistedEvents.filter((event) => event.kind === 'turn_failed')).toHaveLength(0)
  })
})
