import type { KunErrorBody } from '../contracts/errors.js'
import { RUNTIME_RESOURCE_LIMITS_V1 } from '../contracts/resource-limits.js'
import { jsonResponse, type JsonResponse } from './response.js'

export type ReadJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: JsonResponse }

function payloadTooLarge(limit: number): ReadJsonBodyResult {
  return {
    ok: false,
    response: jsonResponse({
      code: 'payload_too_large',
      message: 'request body exceeds the allowed size',
      details: { limit }
    } satisfies KunErrorBody, 413)
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = RUNTIME_RESOURCE_LIMITS_V1.jsonRequestBodyBytes
): Promise<ReadJsonBodyResult> {
  const contentLength = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return payloadTooLarge(maxBytes)
  if (request.body === null) return { ok: true, value: {} }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('payload too large').catch(() => undefined)
        return payloadTooLarge(maxBytes)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (total === 0) return { ok: true, value: {} }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    const body: KunErrorBody = {
      code: 'validation_error',
      message: 'invalid JSON body',
      details: error instanceof Error ? error.message : String(error)
    }
    return { ok: false, response: jsonResponse(body, 400) }
  }
}
