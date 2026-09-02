import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ThreadStore } from '../ports/thread-store.js'
import type { StartTurnResponse } from '../contracts/turns.js'
import type { EngineeringContextService } from './engineering-context-service.js'
import {
  EngineeringApprovalV1,
  EngineeringRunPlanV1,
  EngineeringPlanStepV1,
  type EngineeringApprovalV1 as EngineeringApproval,
  type EngineeringRunPlanV1 as EngineeringRunPlan,
  type EngineeringPlanStepV1 as EngineeringPlanStep
} from '../contracts/engineering-ai.js'
import type { TurnService } from '../services/turn-service.js'
import type { TaskController } from '../services/task-controller.js'
import type { RuntimeEventRecorder } from '../services/runtime-event-recorder.js'

export const EngineeringPlanDraftRequest = z.object({
  threadId: z.string().min(1),
  projectId: z.string().min(1),
  goal: z.string().trim().min(1).max(4_000),
  contextHash: z.string().min(1).optional(),
  steps: z.array(EngineeringPlanStepV1).min(1).max(32).optional(),
  idempotencyKey: z.string().min(8).max(200)
}).strict()
export type EngineeringPlanDraftRequest = z.infer<typeof EngineeringPlanDraftRequest>

export const EngineeringPlanApprovalRequest = z.object({
  expectedRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  stepIds: z.array(z.string().min(1)).min(1).max(32),
  token: z.string().min(16).optional(),
  idempotencyKey: z.string().min(8).max(200)
}).strict()
export type EngineeringPlanApprovalRequest = z.infer<typeof EngineeringPlanApprovalRequest>

export const EngineeringPlanStartRequest = z.object({
  expectedRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  model: z.string().trim().min(1).max(256).optional(),
  idempotencyKey: z.string().min(8).max(200)
}).strict()
export type EngineeringPlanStartRequest = z.infer<typeof EngineeringPlanStartRequest>

export const EngineeringPlanValidateRequest = z.object({
  expectedRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200)
}).strict()
export type EngineeringPlanValidateRequest = z.infer<typeof EngineeringPlanValidateRequest>

export const EngineeringPlanCancelRequest = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2_000).optional(),
  idempotencyKey: z.string().min(8).max(200)
}).strict()
export type EngineeringPlanCancelRequest = z.infer<typeof EngineeringPlanCancelRequest>

export const EngineeringPlanResumeRequest = z.object({
  expectedRevision: z.number().int().positive(),
  contextHash: z.string().min(1),
  model: z.string().trim().min(1).max(256).optional(),
  idempotencyKey: z.string().min(8).max(200)
}).strict()
export type EngineeringPlanResumeRequest = z.infer<typeof EngineeringPlanResumeRequest>

export class EngineeringAiError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

function defaultSteps(contextHash: string, goal = ''): EngineeringPlanStep[] {
  if (/(平差|水准|导线|控制网|三角网|CPIII|GNSS|坐标转换|测量)/i.test(goal)) {
    return [
      { id: 'inspect-survey-network', title: '校核测量网络与基准', tool: 'survey_calculator', risk: 'read', dependsOn: [], inputHash: contextHash, approval: 'pending' },
      { id: 'adjust-survey-network', title: '执行加权最小二乘平差', tool: 'control_network', risk: 'write', dependsOn: ['inspect-survey-network'], inputHash: contextHash, approval: 'pending' },
      { id: 'review-survey-quality', title: '检查闭合差、残差与精度', tool: 'cpiii_adjustment', risk: 'read', dependsOn: ['adjust-survey-network'], inputHash: contextHash, approval: 'pending' },
      { id: 'prepare-survey-report', title: '准备测量成果与证据包', tool: 'report_export', risk: 'export', dependsOn: ['review-survey-quality'], inputHash: contextHash, approval: 'pending' }
    ]
  }
  return [
    { id: 'inspect-data', title: '校核工程数据', tool: 'monitoring_data_first_check', risk: 'read', dependsOn: [], inputHash: contextHash, approval: 'pending' },
    { id: 'analyse-trend', title: '计算趋势与阈值', tool: 'deformation_rate', risk: 'read', dependsOn: ['inspect-data'], inputHash: contextHash, approval: 'pending' },
    { id: 'build-chart', title: '生成趋势图', tool: 'chart_generator', risk: 'export', dependsOn: ['analyse-trend'], inputHash: contextHash, approval: 'pending' },
    { id: 'prepare-report', title: '准备报告与证据包', tool: 'report_export', risk: 'export', dependsOn: ['build-chart'], inputHash: contextHash, approval: 'pending' }
  ]
}

function validateSteps(steps: EngineeringPlanStep[]): void {
  const ids = new Set<string>()
  for (const step of steps) {
    if (ids.has(step.id)) throw new EngineeringAiError('engineering_plan_invalid', `duplicate plan step: ${step.id}`)
    ids.add(step.id)
    if (!['monitoring_data_first_check', 'deformation_rate', 'chart_generator', 'report_export', 'excel_export', 'standard_query', 'tool_norm_cite', 'survey_calculator', 'control_network', 'cpiii_adjustment', 'coord_transform', 'distance_calculator', 'angle_convert', 'railwise.survey_calculator', 'railwise.control_network', 'railwise.cpiii_adjustment', 'railwise.coord_transform', 'railwise.distance_calculator', 'railwise.angle_convert'].includes(step.tool)) {
      throw new EngineeringAiError('engineering_plan_invalid', `tool is not allowlisted: ${step.tool}`)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new EngineeringAiError('engineering_plan_invalid', 'plan dependencies contain a cycle')
    if (visited.has(id)) return
    const step = steps.find((candidate) => candidate.id === id)
    if (!step) throw new EngineeringAiError('engineering_plan_invalid', `missing dependency: ${id}`)
    visiting.add(id)
    for (const dependency of step.dependsOn) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const step of steps) visit(step.id)
}

function approvalToken(planId: string, revision: number, contextHash: string, stepIds: string[]): string {
  return `${planId}.${revision}.${Buffer.from(contextHash).toString('base64url').slice(0, 12)}.${randomBytes(18).toString('base64url')}.${stepIds.join(',')}`
}

/** Coordinates typed Engineering plans while delegating execution to TurnService/TaskController. */
export class EngineeringAiOrchestrator {
  private readonly plans = new Map<string, EngineeringRunPlan>()
  private readonly approvals = new Map<string, EngineeringApproval>()
  private readonly idempotency = new Map<string, unknown>()

  constructor(private readonly deps: {
    context: EngineeringContextService
    threadStore: ThreadStore
    turns: TurnService
    runTurn: (threadId: string, turnId: string) => Promise<'completed' | 'failed' | 'aborted'> | void
    tasks?: TaskController
    events?: RuntimeEventRecorder
    nowIso?: () => string
  }) {}

  getPlan(id: string): EngineeringRunPlan | null { return this.plans.get(id) ?? null }

  createPlan(input: EngineeringPlanDraftRequest): { plan: EngineeringRunPlan; approval: EngineeringApproval } {
    const replay = this.idempotency.get(input.idempotencyKey)
    if (replay) return replay as { plan: EngineeringRunPlan; approval: EngineeringApproval }
    const context = this.deps.context.snapshot(input.projectId)
    if (input.contextHash && input.contextHash !== context.contextHash) throw new EngineeringAiError('engineering_context_stale', 'engineering context has changed; refresh and replan')
    const steps = input.steps ?? defaultSteps(context.contextHash, input.goal)
    validateSteps(steps)
    const now = this.deps.nowIso?.() ?? new Date().toISOString()
    const plan = EngineeringRunPlanV1.parse({ schemaVersion: 1, id: `eplan_${randomUUID()}`, threadId: input.threadId, projectId: input.projectId, contextHash: context.contextHash, revision: 1, goal: input.goal, steps, status: 'awaiting_approval', createdAt: now, updatedAt: now })
    const approval = this.issueApproval(plan, plan.steps.map((step) => step.id))
    const result = { plan, approval }
    this.plans.set(plan.id, plan)
    this.idempotency.set(input.idempotencyKey, result)
    this.emit(plan, 'created')
    return result
  }

  validatePlan(planId: string, input: EngineeringPlanValidateRequest): EngineeringRunPlan {
    const replay = this.idempotency.get(input.idempotencyKey)
    if (replay) return replay as EngineeringRunPlan
    const plan = this.mustPlan(planId)
    const context = this.deps.context.snapshot(plan.projectId)
    if (input.expectedRevision !== plan.revision || input.contextHash !== plan.contextHash || context.contextHash !== plan.contextHash) {
      const stale = EngineeringRunPlanV1.parse({ ...plan, status: 'stale', revision: plan.revision + 1, updatedAt: this.deps.nowIso?.() ?? new Date().toISOString() })
      this.plans.set(plan.id, stale)
      this.emit(stale, 'stale')
      throw new EngineeringAiError('engineering_plan_stale', 'engineering plan is stale; refresh context and replan')
    }
    this.idempotency.set(input.idempotencyKey, plan)
    this.emit(plan, 'validated')
    return plan
  }

  issueApproval(plan: EngineeringRunPlan, stepIds: string[]): EngineeringApproval {
    const ids = [...new Set(stepIds)]
    if (!ids.length || ids.some((id) => !plan.steps.some((step) => step.id === id))) throw new EngineeringAiError('engineering_approval_invalid', 'approval references an unknown plan step')
    const approval = EngineeringApprovalV1.parse({ schemaVersion: 1, planId: plan.id, planRevision: plan.revision, contextHash: plan.contextHash, stepIds: ids, token: approvalToken(plan.id, plan.revision, plan.contextHash, ids), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })
    this.approvals.set(approval.token, approval)
    return approval
  }

  approvePlan(planId: string, input: EngineeringPlanApprovalRequest): EngineeringRunPlan {
    const replay = this.idempotency.get(input.idempotencyKey)
    if (replay) return replay as EngineeringRunPlan
    const plan = this.mustPlan(planId)
    if (input.expectedRevision !== plan.revision || input.contextHash !== plan.contextHash) throw new EngineeringAiError('engineering_approval_stale', 'approval does not match the current plan revision or context')
    const approval = input.token ? this.approvals.get(input.token) : undefined
    if (!approval || approval.planId !== plan.id || approval.planRevision !== plan.revision || approval.contextHash !== plan.contextHash || Date.parse(approval.expiresAt) <= Date.now() || input.stepIds.some((id) => !approval.stepIds.includes(id))) throw new EngineeringAiError('engineering_approval_invalid', 'approval token is missing, expired, or already scoped to another plan')
    const now = this.deps.nowIso?.() ?? new Date().toISOString()
    const next = EngineeringRunPlanV1.parse({ ...plan, revision: plan.revision + 1, status: 'approved', steps: plan.steps.map((step) => input.stepIds.includes(step.id) ? { ...step, approval: 'approved' } : step), updatedAt: now })
    this.plans.set(plan.id, next)
    this.approvals.delete(approval.token)
    this.idempotency.set(input.idempotencyKey, next)
    this.emit(next, 'approved')
    return next
  }

  async startPlan(planId: string, input: EngineeringPlanStartRequest): Promise<{ plan: EngineeringRunPlan; turn: StartTurnResponse }> {
    const replay = this.idempotency.get(input.idempotencyKey)
    if (replay) return replay as { plan: EngineeringRunPlan; turn: StartTurnResponse }
    const plan = this.mustPlan(planId)
    if (input.expectedRevision !== plan.revision || input.contextHash !== plan.contextHash) throw new EngineeringAiError('engineering_plan_stale', 'plan is stale; refresh context and replan')
    if (plan.status !== 'approved' || plan.steps.some((step) => step.approval !== 'approved')) throw new EngineeringAiError('engineering_approval_required', 'all plan steps require approval before execution')
    const thread = await this.deps.threadStore.get(plan.threadId)
    if (!thread || thread.domain !== 'engineering' || thread.projectId !== plan.projectId) throw new EngineeringAiError('engineering_thread_scope', 'plan thread is not scoped to this engineering project')
    const turn = await this.deps.turns.startTurn({ threadId: plan.threadId, request: { prompt: `Execute this approved Engineering Run Plan without changing numeric results:\n${JSON.stringify(plan)}`, displayText: plan.goal, model: input.model, mode: 'agent' } })
    this.deps.runTurn(turn.threadId, turn.turnId)
    const task = this.deps.tasks?.activeTask(plan.threadId)
    const now = this.deps.nowIso?.() ?? new Date().toISOString()
    const started = EngineeringRunPlanV1.parse({ ...plan, revision: plan.revision + 1, status: 'started', ...(task ? { taskId: task.id } : {}), updatedAt: now })
    this.plans.set(plan.id, started)
    const result = { plan: started, turn }
    this.idempotency.set(input.idempotencyKey, result)
    this.emit(started, 'started', turn.turnId)
    return result
  }

  async cancelPlan(planId: string, input: EngineeringPlanCancelRequest): Promise<EngineeringRunPlan> {
    const replay = this.idempotency.get(input.idempotencyKey)
    if (replay) return replay as EngineeringRunPlan
    const plan = this.mustPlan(planId)
    if (input.expectedRevision !== plan.revision) throw new EngineeringAiError('engineering_plan_conflict', 'plan revision conflict')
    const task = this.deps.tasks?.activeTask(plan.threadId)
    if (task?.activeTurnId) await this.deps.turns.interruptTurn({ threadId: plan.threadId, turnId: task.activeTurnId })
    const now = this.deps.nowIso?.() ?? new Date().toISOString()
    const cancelled = EngineeringRunPlanV1.parse({ ...plan, status: 'cancelled', revision: plan.revision + 1, updatedAt: now })
    this.plans.set(plan.id, cancelled)
    this.idempotency.set(input.idempotencyKey, cancelled)
    this.emit(cancelled, 'cancelled')
    return cancelled
  }

  async resumePlan(planId: string, input: EngineeringPlanResumeRequest): Promise<{ plan: EngineeringRunPlan; turn: StartTurnResponse }> {
    const replay = this.idempotency.get(input.idempotencyKey)
    if (replay) return replay as { plan: EngineeringRunPlan; turn: StartTurnResponse }
    const plan = this.mustPlan(planId)
    if (input.expectedRevision !== plan.revision || input.contextHash !== plan.contextHash) throw new EngineeringAiError('engineering_plan_stale', 'plan is stale; refresh context and replan')
    const task = this.deps.tasks?.activeTask(plan.threadId)
    if (!task) throw new EngineeringAiError('engineering_task_missing', 'no resumable TaskRun is associated with this plan')
    const prepared = this.deps.tasks?.prepareResume(task.id, task.revision, input.model)
    if (!prepared) throw new EngineeringAiError('engineering_task_missing', 'no resumable TaskRun is associated with this plan')
    const turn = await this.deps.turns.startTurn({ threadId: prepared.threadId, request: { prompt: `Continue the approved Engineering Run Plan from its latest checkpoint:\n${JSON.stringify(plan)}`, displayText: '继续工程 AI 计划', model: input.model ?? prepared.model, mode: 'agent' } })
    this.deps.runTurn(turn.threadId, turn.turnId)
    const now = this.deps.nowIso?.() ?? new Date().toISOString()
    const resumed = EngineeringRunPlanV1.parse({ ...plan, status: 'started', revision: plan.revision + 1, updatedAt: now })
    this.plans.set(plan.id, resumed)
    const result = { plan: resumed, turn }
    this.idempotency.set(input.idempotencyKey, result)
    this.emit(resumed, 'resumed', turn.turnId)
    return result
  }

  private emit(plan: EngineeringRunPlan, action: string, turnId?: string): void {
    if (!this.deps.events) return
    void this.deps.events.record({
      kind: 'pipeline_stage',
      threadId: plan.threadId,
      ...(turnId ? { turnId } : {}),
      stage: 'setup',
      label: `engineering.plan.${action}`,
      details: { planId: plan.id, projectId: plan.projectId, revision: plan.revision, status: plan.status }
    }).catch(() => undefined)
  }

  private mustPlan(id: string): EngineeringRunPlan { const plan = this.plans.get(id); if (!plan) throw new EngineeringAiError('not_found', `engineering plan not found: ${id}`); return plan }
}
