import { z } from 'zod'
import { stopBashSession } from '../../adapters/tool/builtin-bash-tool.js'
import { jsonResponse, type JsonResponse } from '../response.js'
import { readJsonBody } from '../read-json-body.js'
import { ERRORS } from './runtime-error.js'
import type { ServerRuntime } from './server-runtime.js'

const TerminateShellRequest = z.object({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1).max(256)
}).strict()

export function listShellSessions(runtime: ServerRuntime, request: Request): JsonResponse {
  if (!runtime.taskRepository) return ERRORS.unavailable('task engine is unavailable')
  const taskId = new URL(request.url).searchParams.get('taskId')?.trim()
  return jsonResponse(runtime.taskRepository.listShellSessions(taskId || undefined))
}

export async function terminateShellSession(
  runtime: ServerRuntime,
  sessionId: string,
  request: Request
): Promise<JsonResponse | Response> {
  if (!runtime.taskRepository) return ERRORS.unavailable('task engine is unavailable')
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = TerminateShellRequest.safeParse(body.value)
  if (!parsed.success) return ERRORS.validation('invalid shell termination body', parsed.error.issues)
  const current = runtime.taskRepository.getShellSession(sessionId)
  if (!current) return ERRORS.notFound(`shell session not found: ${sessionId}`)
  if (current.revision !== parsed.data.expectedRevision) return ERRORS.conflict('shell session revision conflict')
  if (current.status !== 'starting' && current.status !== 'running') return jsonResponse(current)
  const stopped = await stopBashSession(sessionId)
  if (!stopped) return ERRORS.conflict('shell process is no longer attached to this application')
  return jsonResponse(runtime.taskRepository.getShellSession(sessionId) ?? current)
}
