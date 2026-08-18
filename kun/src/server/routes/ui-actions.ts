import { UiActionRequest, UiActionStartResponse } from '../../contracts/ui-actions.js'
import { UiActionError, UiActionService } from '../../services/ui-action-service.js'
import { readJsonBody } from '../read-json-body.js'
import { jsonResponse, type JsonResponse } from '../response.js'
import { ERRORS } from './runtime-error.js'

export async function startUiAction(
  actions: UiActionService,
  threadId: string,
  request: Request,
  onStarted?: (response: UiActionStartResponse) => void
): Promise<JsonResponse | Response> {
  const body = await readJsonBody(request)
  if (!body.ok) return body.response
  const parsed = UiActionRequest.safeParse(body.value)
  if (!parsed.success) return ERRORS.validation('invalid UI action body', parsed.error.issues)
  try {
    const response = await actions.execute({ threadId, request: parsed.data })
    onStarted?.(response)
    return jsonResponse(response, 202)
  } catch (error) {
    if (error instanceof UiActionError) {
      if (error.code === 'ui_action_not_found') return ERRORS.notFound(error.message)
      if (error.code === 'ui_action_unavailable') return ERRORS.unavailable(error.message)
      if (error.code === 'ui_action_stale' || error.code === 'ui_action_expired') {
        return ERRORS.staleRequest(error.message)
      }
      return ERRORS.validation(error.message)
    }
    if (
      (error as { code?: unknown })?.code === 'turn_in_progress' ||
      (error as { code?: unknown })?.code === 'idempotency_conflict' ||
      (error as { code?: unknown })?.code === 'ui_action_consumed'
    ) {
      return ERRORS.conflict(error instanceof Error ? error.message : 'UI action conflict')
    }
    if ((error as { code?: unknown })?.code === 'resource_limit') {
      return ERRORS.resourceLimit('the application turn concurrency limit has been reached')
    }
    if (error instanceof Error && /not found/i.test(error.message)) return ERRORS.notFound(error.message)
    throw error
  }
}
