import { readJsonBody } from '../read-json-body.js'
import { jsonResponse, type JsonResponse } from '../response.js'
import { ERRORS } from './runtime-error.js'
import type { EngineeringService } from '../../engineering/engineering-service.js'

export async function listProjects(service: EngineeringService | undefined): Promise<JsonResponse> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  return jsonResponse({ projects: service.listProjects() })
}
export async function createProject(service: EngineeringService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ project: service.createProject(body.value) }, 201) } catch (error) { return ERRORS.validation(errorMessage(error)) }
}
export async function getProjectOverview(service: EngineeringService | undefined, id: string): Promise<JsonResponse> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  try { return jsonResponse(service.getProjectOverview(id)) } catch (error) { return mapError(error) }
}
export async function updateProject(service: EngineeringService | undefined, id: string, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ project: service.updateProject(id, body.value) }) } catch (error) { return mapError(error) }
}
export async function importDataset(service: EngineeringService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ dataset: await service.importDataset(body.value) }, 201) } catch (error) { return mapError(error) }
}
export async function validateDataset(service: EngineeringService | undefined, request: Request, pathDatasetId?: string): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ dataset: service.validateDataset({ ...(body.value as Record<string, unknown>), ...(pathDatasetId ? { datasetId: pathDatasetId } : {}) }) }) } catch (error) { return mapError(error) }
}
export async function acceptWarningFinding(service: EngineeringService | undefined, request: Request, pathDatasetId?: string, pathFindingId?: string): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ dataset: service.acceptWarningFinding({ ...(body.value as Record<string, unknown>), ...(pathDatasetId ? { datasetId: pathDatasetId } : {}), ...(pathFindingId ? { findingId: pathFindingId } : {}) }) }) } catch (error) { return mapError(error) }
}
export async function createAnalysis(service: EngineeringService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ analysis: service.createAnalysis(body.value) }, 201) } catch (error) { return mapError(error) }
}
export async function createChart(service: EngineeringService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ chart: await service.createChart(body.value) }, 201) } catch (error) { return mapError(error) }
}
export async function previewReport(service: EngineeringService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse(await service.previewReport(body.value), 201) } catch (error) { return mapError(error) }
}
export async function finalizeDeliverable(service: EngineeringService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ manifest: await service.finalize(body.value) }, 201) } catch (error) { return mapError(error) }
}
export async function getRun(service: EngineeringService | undefined, id: string): Promise<JsonResponse> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  const run = service.getRun(id); return run ? jsonResponse({ run }) : ERRORS.notFound(`run not found: ${id}`)
}
export async function cancelRun(service: EngineeringService | undefined, id: string, request?: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  try { const body = request ? await readJsonBody(request) : { ok: true as const, value: undefined }; if (!body.ok) return body.response; return jsonResponse({ run: service.cancelRun(id, body.value) }) } catch (error) { return mapError(error) }
}
export async function resumeRun(service: EngineeringService | undefined, id: string, request?: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('engineering workbench is unavailable')
  try { const body = request ? await readJsonBody(request) : { ok: true as const, value: undefined }; if (!body.ok) return body.response; return jsonResponse({ run: service.resumeRun(id, body.value) }) } catch (error) { return mapError(error) }
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function mapError(error: unknown): JsonResponse { const code = (error as { code?: string })?.code; if (code === 'stale_request') return ERRORS.staleRequest(errorMessage(error)); if (errorMessage(error).includes('not found')) return ERRORS.notFound(errorMessage(error)); if (errorMessage(error).includes('blocking findings') || errorMessage(error).includes('warnings require')) return ERRORS.conflict(errorMessage(error)); return ERRORS.validation(errorMessage(error)) }
