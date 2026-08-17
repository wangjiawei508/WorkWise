import { jsonResponse, type JsonResponse } from '../response.js'
import type { WorkspaceInspector } from '../../ports/workspace-inspector.js'
import { WorkspaceReferenceSearchRequestSchema } from '../../contracts/workspace-references.js'
import type { WorkspaceReferenceService } from '../../services/workspace-reference-service.js'
import type { ThreadService } from '../../services/thread-service.js'
import { readJsonBody } from '../read-json-body.js'
import { ERRORS } from './runtime-error.js'

/**
 * Build the `GET /v1/workspace/status` response. The path comes from
 * the `?path=` query string and falls back to an empty status when
 * the caller does not provide one.
 */
export function buildWorkspaceStatusResponse(input: {
  inspector: WorkspaceInspector
  path: string | null
}): Promise<JsonResponse> {
  if (!input.path) {
    return Promise.resolve(
      jsonResponse({
        path: '',
        exists: false,
        isGitRepository: false,
        branch: null,
        headSha: null,
        isDirty: null,
        fileChangeCount: null,
        checkedAt: new Date().toISOString()
      })
    )
  }
  return input.inspector.status(input.path).then((status) => jsonResponse(status))
}

export async function searchWorkspaceReferences(input: {
  service: WorkspaceReferenceService
  threads: ThreadService
  threadId: string
  request: Request
}): Promise<JsonResponse | Response> {
  const body = await readJsonBody(input.request)
  if (!body.ok) return body.response
  const parsed = WorkspaceReferenceSearchRequestSchema.safeParse(body.value)
  if (!parsed.success) {
    return ERRORS.validation('invalid workspace reference search body', parsed.error.issues)
  }
  const thread = await input.threads.get(input.threadId)
  if (!thread) return ERRORS.notFound(`thread not found: ${input.threadId}`)
  try {
    return jsonResponse(await input.service.search({
      workspaceRoot: thread.workspace,
      query: parsed.data.query,
      limit: parsed.data.limit
    }))
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'workspace_reference_invalid') {
      return ERRORS.validation(error instanceof Error ? error.message : 'invalid thread workspace')
    }
    throw error
  }
}
