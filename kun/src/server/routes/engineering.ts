import { readJsonBody } from '../read-json-body.js'
import { jsonResponse, type JsonResponse } from '../response.js'
import { ERRORS } from './runtime-error.js'
import type { EngineeringService } from '../../engineering/engineering-service.js'
import type { SurveyService } from '../../engineering/survey-service.js'
import { SkillProvenanceV1, type EngineeringCapabilityV1 } from '../../contracts/survey.js'
import { AUDITED_SPECIALIST_SKILLS, SPECIALIST_SKILL_ALIASES, SPECIALIST_SKILL_SOURCE } from '../../engineering/specialist-skill-provenance.generated.js'

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

export async function importSurveyNetwork(service: SurveyService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ network: await service.importNetwork(body.value) }, 201) } catch (error) { return mapSurveyError(error) }
}

export function listSurveyNetworks(service: SurveyService | undefined, projectId?: string): JsonResponse {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  return jsonResponse({ networks: service.listNetworks(projectId) })
}

export async function validateSurveyNetwork(service: SurveyService | undefined, request: Request, networkId: string): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ network: service.validateNetwork(networkId, body.value) }) } catch (error) { return mapSurveyError(error) }
}

export async function createAdjustment(service: SurveyService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse(service.createAdjustment(body.value), 201) } catch (error) { return mapSurveyError(error) }
}

export function getAdjustment(service: SurveyService | undefined, id: string): JsonResponse {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const adjustment = service.getAdjustment(id); return adjustment ? jsonResponse(adjustment) : ERRORS.notFound(`adjustment not found: ${id}`)
}

export function listAdjustments(service: SurveyService | undefined, projectId?: string): JsonResponse {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  return jsonResponse({ adjustments: service.listAdjustments(projectId) })
}

export async function cancelAdjustment(service: SurveyService | undefined, id: string, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ run: service.cancelAdjustment(id, body.value) }) } catch (error) { return mapSurveyError(error) }
}

export async function resumeAdjustment(service: SurveyService | undefined, id: string, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse(service.resumeAdjustment(id, body.value), 202) } catch (error) { return mapSurveyError(error) }
}

export function previewAdjustment(service: SurveyService | undefined, id: string): JsonResponse {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const adjustment = service.previewAdjustment(id); return adjustment ? jsonResponse(adjustment) : ERRORS.notFound(`adjustment not found: ${id}`)
}

export async function compareDeformation(service: SurveyService | undefined, request: Request): Promise<JsonResponse | Response> {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const body = await readJsonBody(request); if (!body.ok) return body.response
  try { return jsonResponse({ deformation: service.compareDeformation(body.value) }, 201) } catch (error) { return mapSurveyError(error) }
}

export function getDeformation(service: SurveyService | undefined, id: string): JsonResponse {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  const deformation = service.getDeformation(id); return deformation ? jsonResponse({ deformation }) : ERRORS.notFound(`deformation comparison not found: ${id}`)
}

export function listDeformations(service: SurveyService | undefined, projectId?: string): JsonResponse {
  if (!service) return ERRORS.unavailable('survey adjustment service is unavailable')
  return jsonResponse({ deformations: service.listDeformations(projectId) })
}

export function engineeringCapabilities(service: SurveyService | undefined): JsonResponse {
  const available = Boolean(service)
  const capabilities: EngineeringCapabilityV1[] = [
    { id: 'survey-adjustment', label: '工程测量与平差', category: 'survey', skillIds: ['data-analysis', 'adjustment-report'], toolIds: ['survey_network_validate', 'survey_calculator', 'control_network', 'cpiii_adjustment', 'coord_transform', 'survey_adjustment_read'], available, ...(available ? {} : { reason: 'survey runtime unavailable' }) },
    { id: 'third-party-monitoring', label: '地保与第三方监测', category: 'monitoring', skillIds: ['di-bao-monitoring', 'report-dibao', 'construction-monitoring', 'operational-monitoring'], toolIds: ['monitoring_csv', 'deformation_rate', 'alert_level'], available, ...(available ? {} : { reason: 'engineering runtime unavailable' }) },
    { id: 'engineering-delivery', label: '测绘成果交付', category: 'documents', skillIds: ['report-writing', 'docx-generation', 'excel-operations'], toolIds: ['report_export', 'excel_export', 'chart_generator'], available, ...(available ? {} : { reason: 'survey runtime unavailable' }) },
    { id: 'tender-master', label: '标书编制', category: 'documents', skillIds: ['tender-master', 'bidding-knowledge'], toolIds: ['standard_query'], available, ...(available ? {} : { reason: 'skill runtime unavailable' }) },
    { id: 'standards', label: '规范与知识库', category: 'standards', skillIds: ['standard-reference'], toolIds: ['standard_query', 'tool_norm_cite'], available, ...(available ? {} : { reason: 'skill runtime unavailable' }) }
  ]
  return jsonResponse({ schemaVersion: 1, product: { name: '工程测量工作台', subtitle: '测绘专业 AI Agent' }, capabilities })
}

export function skillsCatalog(): JsonResponse {
  const entries = [...AUDITED_SPECIALIST_SKILLS, ...SPECIALIST_SKILL_ALIASES].map((entry) => SkillProvenanceV1.parse(entry))
  return jsonResponse({
    schemaVersion: SPECIALIST_SKILL_SOURCE.schemaVersion,
    sourceRepository: SPECIALIST_SKILL_SOURCE.sourceRepository,
    commit: SPECIALIST_SKILL_SOURCE.sourceCommit,
    license: SPECIALIST_SKILL_SOURCE.sourceLicense,
    packagingPolicy: SPECIALIST_SKILL_SOURCE.packagingPolicy,
    skills: entries
  })
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function mapError(error: unknown): JsonResponse { const code = (error as { code?: string })?.code; if (code === 'stale_request') return ERRORS.staleRequest(errorMessage(error)); if (errorMessage(error).includes('not found')) return ERRORS.notFound(errorMessage(error)); if (errorMessage(error).includes('blocking findings') || errorMessage(error).includes('warnings require')) return ERRORS.conflict(errorMessage(error)); return ERRORS.validation(errorMessage(error)) }
function mapSurveyError(error: unknown): JsonResponse { const code = (error as { code?: string })?.code; if (code === 'survey_stale_request') return ERRORS.staleRequest(errorMessage(error)); if (errorMessage(error).includes('not found')) return ERRORS.notFound(errorMessage(error)); if (errorMessage(error).includes('exceeds limits') || errorMessage(error).includes('blocking')) return ERRORS.conflict(errorMessage(error)); return ERRORS.validation(errorMessage(error)) }
