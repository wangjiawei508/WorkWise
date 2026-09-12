import { z } from 'zod'
import type { ThreadStore } from '../../ports/thread-store.js'
import type { EngineeringAiOrchestrator } from '../../engineering/engineering-ai-orchestrator.js'
import type { CapabilityToolProvider } from './capability-registry.js'
import { LocalToolHost } from './local-tool-host.js'

const operationRisks = {
  survey_network_validate: 'read', survey_adjustment_read: 'read',
  survey_calculator: 'write', control_network: 'write', cpiii_adjustment: 'write', coord_transform: 'write',
  monitoring_data_first_check: 'read', deformation_rate: 'read',
  chart_generator: 'export', report_export: 'export', excel_export: 'export'
} as const
const operationNames = Object.keys(operationRisks) as [keyof typeof operationRisks, ...Array<keyof typeof operationRisks>]
const selectionSchema = z.object({ networkId: z.string().min(1).max(200).optional(), adjustmentId: z.string().min(1).max(200).optional() }).strict()
const draftSchema = z.object({
  goal: z.string().trim().min(1).max(4_000),
  steps: z.array(z.object({ tool: z.enum(operationNames), title: z.string().min(1).max(200) }).strict()).min(1).max(32)
}).strict()

export function buildEngineeringConversationTools(
  threadStore: ThreadStore,
  getOrchestrator: () => EngineeringAiOrchestrator
): CapabilityToolProvider {
  const projectForThread = async (threadId: string): Promise<string> => {
    const thread = await threadStore.get(threadId)
    if (thread?.domain !== 'engineering' || !thread.projectId) throw new Error('an engineering project thread is required')
    return thread.projectId
  }
  return {
    id: 'engineering-conversation', kind: 'gui', enabled: true, available: true,
    tools: [
      LocalToolHost.defineTool({
        name: 'survey_read_context',
        shouldAdvertise: (context) => context.allowedToolNames?.includes('survey_read_context') === true,
        description: 'Read the current Survey project summary and existing deterministic results, residuals, precision, units and evidence. Does not calculate, import or write anything. Results are bounded and project-scoped.',
        inputSchema: { type: 'object', properties: { networkId: { type: 'string', maxLength: 200 }, adjustmentId: { type: 'string', maxLength: 200 } }, additionalProperties: false },
        policy: 'auto',
        execute: async (args, context) => ({ output: await getOrchestrator().readConversationContext(context.threadId, await projectForThread(context.threadId), selectionSchema.parse(args)) })
      }),
      LocalToolHost.defineTool({
        name: 'survey_request_plan',
        shouldAdvertise: (context) => context.allowedToolNames?.includes('survey_request_plan') === true,
        description: 'Propose a typed Survey execution plan ONLY when the user requests computation, data analysis or deliverable generation, not ordinary questions. Include only the requested operations, in dependency order. This saves an unexecuted draft; the UI requires explicit human approval. Never request or return approval tokens.',
        inputSchema: {
          type: 'object', properties: {
            goal: { type: 'string', maxLength: 4_000 },
            steps: { type: 'array', minItems: 1, maxItems: 32, items: {
              type: 'object', properties: { tool: { type: 'string', enum: operationNames }, title: { type: 'string', maxLength: 200 } },
              required: ['tool', 'title'], additionalProperties: false
            } }
          }, required: ['goal', 'steps'], additionalProperties: false
        },
        policy: 'auto',
        execute: async (args, context) => {
          const draft = draftSchema.parse(args)
          const projectId = await projectForThread(context.threadId)
          const { plan } = await getOrchestrator().createPlan({
            threadId: context.threadId, projectId, goal: draft.goal,
            steps: draft.steps.map((step, index) => ({
              id: `step-${index + 1}`, title: step.title, tool: step.tool, risk: operationRisks[step.tool],
              dependsOn: index ? [`step-${index}`] : [], inputHash: 'server-resolved', approval: 'pending'
            })),
            idempotencyKey: `survey-conversation-plan:${context.turnId}`
          }, { conversationTurnId: context.turnId })
          return { output: { plan, executed: false, approvalRequired: true } }
        }
      })
    ]
  }
}
