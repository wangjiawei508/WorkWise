import { Router } from '../router.js'
import { healthJsonResponse } from './health.js'
import { buildWorkspaceStatusResponse, searchWorkspaceReferences } from './workspace.js'
import {
  createThread,
  clearThreadGoal,
  clearThreadTodos,
  deleteThread,
  forkThread,
  getThreadGoal,
  getThreadTodos,
  getThread,
  listThreads,
  setThreadGoal,
  setThreadAgent,
  setThreadTodos,
  updateThread
} from './threads.js'
import {
  compactTurn,
  getTurn,
  interruptTurn,
  startTurn,
  steerTurn
} from './turns.js'
import { startReview } from './review.js'
import { buildEventStreamResponse } from './events.js'
import { decideApproval } from './approvals.js'
import { resolveUserInput } from './user-inputs.js'
import { resumeSession } from './sessions.js'
import { usageJsonResponse } from './usage.js'
import { runtimeInfoJsonResponse, runtimeToolDiagnosticsJsonResponse } from './runtime-info.js'
import { listSkills } from './skills.js'
import {
  attachmentDiagnostics,
  getAttachmentContent,
  getAttachmentMetadata,
  importDocumentAttachment,
  ingestParsedAttachmentBatch,
  listAttachmentSections,
  readAttachmentSection,
  searchAttachmentSections,
  uploadAttachment
} from './attachments.js'
import {
  createMemory,
  deleteMemory,
  listMemories,
  memoryDiagnostics,
  updateMemory
} from './memory.js'
import { flowRoutes } from './flows.js'
import { isAuthorized, bearerToken } from '../auth.js'
import { ERRORS } from './runtime-error.js'
import type { ServerRuntime } from './server-runtime.js'
import { cancelTask, getTask, getTaskDiagnostics, listTasks, resumeTask, retryTask } from './tasks.js'
import { listShellSessions, terminateShellSession } from './shell-sessions.js'
import { startUiAction } from './ui-actions.js'

/**
 * Build the full router used by the HTTP server. The router exposes:
 * - `GET /health` (unauthenticated)
 * - `GET /v1/runtime/info` (auth)
 * - `GET /v1/runtime/tools` (auth)
 * - `GET /v1/skills` (auth)
 * - `POST /v1/attachments` (auth)
 * - `GET /v1/attachments/diagnostics` (auth)
 * - `GET /v1/attachments/{id}` and `{id}/content` (auth)
 * - `GET/POST /v1/memory`, `PATCH/DELETE /v1/memory/{id}`, diagnostics (auth)
 * - `GET /v1/workspace/status` (auth)
 * - `GET/POST /v1/threads` (auth)
 * - `GET/PATCH/DELETE /v1/threads/{id}` (auth)
 * - `POST /v1/threads/{id}/fork` (auth)
 * - `POST /v1/threads/{id}/agent` (auth)
 * - `GET/POST/DELETE /v1/threads/{id}/goal` (auth)
 * - `GET/POST/DELETE /v1/threads/{id}/todos` (auth)
 * - `POST /v1/threads/{id}/turns` (auth)
 * - `POST /v1/threads/{id}/ui-actions` (auth)
 * - `POST /v1/threads/{id}/review` (auth)
 * - `GET /v1/threads/{id}/turns/{turnId}` (auth)
 * - `POST /v1/threads/{id}/turns/{turnId}/steer` (auth)
 * - `POST /v1/threads/{id}/turns/{turnId}/interrupt` (auth)
 * - `POST /v1/threads/{id}/compact` (auth)
 * - `GET /v1/threads/{id}/events` (auth)
 * - `POST /v1/approvals/{id}` (auth)
 * - `POST /v1/user-inputs/{id}` and `/v1/user-input/{id}` (auth)
 * - `POST /v1/sessions/{id}/resume-thread` (auth)
 * - `GET /v1/usage` (auth)
 */
export function buildRouter(runtime: ServerRuntime): Router {
  const router = new Router()
  router.add('GET', '/health', () => healthJsonResponse())
  router.add('GET', '/v1/runtime/info', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return runtimeInfoJsonResponse(runtime)
  })
  router.add('GET', '/v1/runtime/tools', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return runtimeToolDiagnosticsJsonResponse(runtime)
  })
  router.add('GET', '/v1/skills', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listSkills(runtime)
  })
  router.add('POST', '/v1/attachments', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return uploadAttachment(runtime.attachmentStore, request)
  })
  router.add('POST', '/v1/attachments/documents', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return importDocumentAttachment(runtime.attachmentStore, request)
  })
  router.add('GET', '/v1/attachments/diagnostics', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return attachmentDiagnostics(runtime.attachmentStore)
  })
  router.add('GET', '/v1/attachments/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getAttachmentMetadata(runtime.attachmentStore, ctx.params.id, request)
  })
  router.add('GET', '/v1/attachments/:id/content', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getAttachmentContent(runtime.attachmentStore, ctx.params.id, request)
  })
  router.add('GET', '/v1/attachments/:id/sections', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listAttachmentSections(runtime.attachmentStore, ctx.params.id, request)
  })
  router.add('GET', '/v1/attachments/:id/sections/search', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return searchAttachmentSections(runtime.attachmentStore, ctx.params.id, request)
  })
  router.add('GET', '/v1/attachments/:id/sections/:sectionId', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return readAttachmentSection(runtime.attachmentStore, ctx.params.id, ctx.params.sectionId, request)
  })
  router.add('POST', '/v1/attachments/:id/parsed', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return ingestParsedAttachmentBatch(runtime.attachmentStore, ctx.params.id, request)
  })
  router.add('POST', '/v1/flow-webhooks/:id', async (request, ctx) => flowRoutes.webhook(runtime.flowService, ctx.params.id, request))
  router.add('GET', '/v1/flows', async (request) => authorize(request, runtime) ? flowRoutes.list(runtime.flowService) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows', async (request) => authorize(request, runtime) ? flowRoutes.create(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('GET', '/v1/flows/:id', async (request, ctx) => authorize(request, runtime) ? flowRoutes.get(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('DELETE', '/v1/flows/:id', async (request, ctx) => authorize(request, runtime) ? flowRoutes.archive(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('GET', '/v1/flows/:id/versions', async (request, ctx) => authorize(request, runtime) ? flowRoutes.versions(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('PUT', '/v1/flows/:id', async (request) => authorize(request, runtime) ? flowRoutes.update(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows/validate', async (request) => authorize(request, runtime) ? flowRoutes.validate(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows/publish', async (request) => authorize(request, runtime) ? flowRoutes.publish(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows/run', async (request) => authorize(request, runtime) ? flowRoutes.run(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows/test-node', async (request) => authorize(request, runtime) ? flowRoutes.testNode(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows/migrations/schedules', async (request) => authorize(request, runtime) ? flowRoutes.migrateSchedules(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('GET', '/v1/legacy-schedules', async (request) => authorize(request, runtime) ? flowRoutes.listLegacySchedules(runtime.flowService) : ERRORS.unauthorized())
  router.add('POST', '/v1/legacy-schedules', async (request) => authorize(request, runtime) ? flowRoutes.createLegacySchedule(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('PUT', '/v1/legacy-schedules/:id', async (request, ctx) => authorize(request, runtime) ? flowRoutes.updateLegacySchedule(runtime.flowService, ctx.params.id, request) : ERRORS.unauthorized())
  router.add('POST', '/v1/legacy-schedules/:id/run', async (request, ctx) => authorize(request, runtime) ? flowRoutes.runLegacySchedule(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('DELETE', '/v1/legacy-schedules/:id', async (request, ctx) => authorize(request, runtime) ? flowRoutes.archiveLegacySchedule(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('GET', '/v1/flows/:id/history', async (request, ctx) => authorize(request, runtime) ? flowRoutes.history(runtime.flowService, ctx.params.id, request) : ERRORS.unauthorized())
  router.add('GET', '/v1/flow-runs/:id', async (request, ctx) => authorize(request, runtime) ? flowRoutes.runDetails(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('POST', '/v1/flow-runs/:id/cancel', async (request, ctx) => authorize(request, runtime) ? flowRoutes.action(runtime.flowService, ctx.params.id, 'cancel', request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flow-runs/:id/resume', async (request, ctx) => authorize(request, runtime) ? flowRoutes.action(runtime.flowService, ctx.params.id, 'resume', request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flow-runs/:id/retry', async (request, ctx) => authorize(request, runtime) ? flowRoutes.action(runtime.flowService, ctx.params.id, 'retry', request) : ERRORS.unauthorized())
  router.add('POST', '/v1/flow-runs/decision', async (request) => authorize(request, runtime) ? flowRoutes.decide(runtime.flowService, request) : ERRORS.unauthorized())
  router.add('GET', '/v1/flows/:id/export', async (request, ctx) => authorize(request, runtime) ? flowRoutes.export(runtime.flowService, ctx.params.id) : ERRORS.unauthorized())
  router.add('POST', '/v1/flows/:id/webhooks', async (request, ctx) => authorize(request, runtime) ? flowRoutes.provisionWebhook(runtime.flowService, ctx.params.id, request) : ERRORS.unauthorized())
  router.add('GET', '/v1/memory', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listMemories(runtime.memoryStore, request)
  })
  router.add('POST', '/v1/memory', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return createMemory(runtime.memoryStore, request)
  })
  router.add('GET', '/v1/memory/diagnostics', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return memoryDiagnostics(runtime.memoryStore)
  })
  router.add('PATCH', '/v1/memory/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return updateMemory(runtime.memoryStore, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/memory/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return deleteMemory(runtime.memoryStore, ctx.params.id)
  })
  router.add('GET', '/v1/workspace/status', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    const url = new URL(request.url)
    const path = url.searchParams.get('path')
    return buildWorkspaceStatusResponse({ inspector: runtime.workspaceInspector, path })
  })
  router.add('POST', '/v1/threads/:id/workspace/references/search', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return searchWorkspaceReferences({
      service: runtime.workspaceReferenceService,
      threads: runtime.threadService,
      threadId: ctx.params.id,
      request
    })
  })
  router.add('GET', '/v1/threads', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listThreads(runtime.threadService, request)
  })
  router.add('GET', '/v1/tasks', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listTasks(runtime, request)
  })
  router.add('GET', '/v1/tasks/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getTask(runtime, ctx.params.id)
  })
  router.add('GET', '/v1/tasks/:id/diagnostics', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getTaskDiagnostics(runtime, ctx.params.id)
  })
  router.add('POST', '/v1/tasks/:id/resume', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resumeTask(runtime, ctx.params.id, request)
  })
  router.add('POST', '/v1/tasks/:id/retry', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return retryTask(runtime, ctx.params.id, request)
  })
  router.add('POST', '/v1/tasks/:id/cancel', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return cancelTask(runtime, ctx.params.id, request)
  })
  router.add('GET', '/v1/shell-sessions', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listShellSessions(runtime, request)
  })
  router.add('POST', '/v1/shell-sessions/:id/terminate', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return terminateShellSession(runtime, ctx.params.id, request)
  })
  router.add('POST', '/v1/threads', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return createThread(runtime.threadService, request)
  })
  router.add('GET', '/v1/threads/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThread(runtime.threadService, ctx.params.id, runtime.sessionStore)
  })
  router.add('PATCH', '/v1/threads/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return updateThread(runtime.threadService, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/threads/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return deleteThread(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/fork', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return forkThread(runtime.threadService, ctx.params.id, request)
  })
  router.add('POST', '/v1/threads/:id/agent', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return setThreadAgent(runtime.threadService, ctx.params.id, request)
  })
  router.add('GET', '/v1/threads/:id/goal', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThreadGoal(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/goal', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return setThreadGoal(runtime.threadService, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/threads/:id/goal', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return clearThreadGoal(runtime.threadService, ctx.params.id)
  })
  router.add('GET', '/v1/threads/:id/todos', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThreadTodos(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/todos', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return setThreadTodos(runtime.threadService, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/threads/:id/todos', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return clearThreadTodos(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/turns', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return startTurn(runtime.turnService, ctx.params.id, request, ({ threadId, turnId }) => {
      runtime.runTurn(threadId, turnId)
    })
  })
  router.add('POST', '/v1/threads/:id/ui-actions', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.uiActionService) return ERRORS.unavailable('UI actions are not available')
    return startUiAction(runtime.uiActionService, ctx.params.id, request, ({ threadId, turnId }) => {
      runtime.runTurn(threadId, turnId)
    })
  })
  router.add('POST', '/v1/threads/:id/review', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.reviewService || !runtime.runReview) {
      return ERRORS.unavailable('review is not available')
    }
    return startReview(
      runtime.turnService,
      ctx.params.id,
      request,
      ({ threadId, turnId, reviewItemId }, target, model) => {
        runtime.runReview?.({ threadId, turnId, reviewItemId, target, model })
      }
    )
  })
  router.add('GET', '/v1/threads/:id/turns/:turnId', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getTurn(runtime.turnService, ctx.params.id, ctx.params.turnId)
  })
  router.add('POST', '/v1/threads/:id/turns/:turnId/steer', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return steerTurn(runtime.turnService, ctx.params.id, ctx.params.turnId, request)
  })
  router.add('POST', '/v1/threads/:id/turns/:turnId/interrupt', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return interruptTurn(runtime.turnService, ctx.params.id, ctx.params.turnId, request)
  })
  router.add('POST', '/v1/threads/:id/compact', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return compactTurn(runtime.turnService, ctx.params.id, request)
  })
  router.add('GET', '/v1/threads/:id/events', (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return buildEventStreamResponse({
      request,
      threadId: ctx.params.id,
      eventBus: runtime.eventBus,
      sessionStore: runtime.sessionStore
    })
  })
  router.add('POST', '/v1/approvals/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return decideApproval({
      approvalId: ctx.params.id,
      request,
      gate: runtime.approvalGate,
      events: runtime.events
    })
  })
  router.add('POST', '/v1/user-inputs/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resolveUserInput({
      inputId: ctx.params.id,
      request,
      gate: runtime.userInputGate,
      events: runtime.events
    })
  })
  router.add('POST', '/v1/user-input/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resolveUserInput({
      inputId: ctx.params.id,
      request,
      gate: runtime.userInputGate,
      events: runtime.events
    })
  })
  router.add('POST', '/v1/sessions/:id/resume-thread', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resumeSession(runtime.threadService, ctx.params.id, request)
  })
  router.add('GET', '/v1/usage', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return usageJsonResponse(request, runtime)
  })
  return router
}

function authorize(request: Request, runtime: ServerRuntime): boolean {
  return isAuthorized(request.headers, runtime.runtimeToken, runtime.insecure)
}

void bearerToken
