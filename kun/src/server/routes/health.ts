import { jsonResponse, type JsonResponse } from '../response.js'
import { WORKWISE_RUNTIME_PROTOCOL_VERSION } from '../../contracts/runtime-protocol.js'

/** Build the `GET /health` response. The endpoint is unauthenticated. */
export function healthJsonResponse(): JsonResponse {
  return jsonResponse({
    status: 'ok',
    service: 'kun',
    mode: 'serve',
    protocolVersion: WORKWISE_RUNTIME_PROTOCOL_VERSION
  })
}
