import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import JSZip from 'jszip'
import { atomicWriteFile } from '../adapters/file/atomic-write.js'
import {
  AdjustmentMutationRequestV1,
  AdjustmentRequestV1,
  AdjustmentResultV1,
  AdjustmentRunV1,
  AdjustmentDisplacementV1,
  SurveyNetworkImportRequest,
  SurveyNetworkV1,
  SurveyNetworkValidateRequest,
  SurveyObservationV1,
  SurveyPointV1,
  SurveyProjectV1,
  SurveyQualityFindingV1
} from '../contracts/survey.js'
import { iterativeWeightedLeastSquares, numericalJacobian, weightedLeastSquares, wrapRadians } from './survey-adjustment-core.js'

type SurveyProjectLookup = (id: string) => { id: string; workspace: string; revision: number } | null
type StoredAdjustment = { run: AdjustmentRunV1; result?: AdjustmentResultV1 }

const ALGORITHM_VERSION = 'workwise-survey-adjustment-4'
const MAX_POINTS = 10_000
const MAX_OBSERVATIONS = 100_000
const MAX_UNKNOWN_PARAMETERS = 20_000
const MAX_MATRIX_NON_ZERO = 5_000_000

function pointMap(network: SurveyNetworkV1): Map<string, SurveyPointV1> {
  return new Map([...network.knownPoints, ...network.unknownPoints].map((point) => [point.id, point]))
}

function observationEndpointIds(observation: SurveyObservationV1): string[] {
  return [observation.from, observation.to, observation.station, observation.target, observation.left, observation.right].filter((id): id is string => Boolean(id))
}

function finding(networkId: string, code: SurveyQualityFindingV1['code'], severity: SurveyQualityFindingV1['severity'], message: string, suggestion: string, row?: number, nowIso = () => new Date().toISOString()): SurveyQualityFindingV1 {
  return SurveyQualityFindingV1.parse({ schemaVersion: 1, id: `survey_finding_${randomUUID()}`, networkId, code, severity, message, suggestion, ...(row === undefined ? {} : { row }), status: 'open', createdAt: nowIso() })
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

function angleValue(value: unknown): number | undefined {
  const numeric = asNumber(value)
  if (numeric !== undefined) return numeric
  if (typeof value !== 'string' || !value.trim()) return undefined
  const text = value.trim().replace(/[º°]/g, ' ').replace(/[′']/g, ' ').replace(/[″"]/g, ' ')
  const parts = text.split(/\s+/).filter(Boolean).map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return undefined
  const sign = parts[0]! < 0 ? -1 : 1
  const degrees = Math.abs(parts[0]!)
  const minutes = Math.abs(parts[1] ?? 0)
  const seconds = Math.abs(parts[2] ?? 0)
  return sign * (degrees + minutes / 60 + seconds / 3600)
}

function parseDelimited(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const parseLine = (line: string): string[] => {
    const values: string[] = []; let current = ''; let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]!
      if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1 }
      else if (char === '"') quoted = !quoted
      else if (char === ',' && !quoted) { values.push(current.trim()); current = '' }
      else current += char
    }
    values.push(current.trim()); return values
  }
  const headers = parseLine(lines[0]!).map((value, index) => value || `column_${index + 1}`)
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseLine(line)[index] ?? ''])))
}

async function parseNetworkPayload(name: string, bytes: Buffer, projectId: string, nowIso: () => string, networkType?: SurveyNetworkV1['networkType'], inputAttachmentHash?: string): Promise<SurveyNetworkV1> {
  let parsed: unknown
  try { parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) } catch { parsed = undefined }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const candidate = parsed as Record<string, unknown>
    const value = candidate.network && typeof candidate.network === 'object' ? candidate.network : candidate
    const normalized = value as Record<string, unknown>
    const { heightDatum: legacyHeightDatum, ...normalizedWithoutLegacyDatum } = normalized
    return SurveyNetworkV1.parse({
      ...normalizedWithoutLegacyDatum,
      schemaVersion: 1,
      id: typeof normalized.id === 'string' ? normalized.id : `network_${randomUUID()}`,
      projectId,
      networkType: normalized.networkType ?? networkType ?? 'leveling',
      coordinateSystem: normalized.coordinateSystem ?? '待确认',
      projection: normalized.projection ?? '待确认',
      ellipsoid: normalized.ellipsoid ?? '待确认',
      verticalDatum: normalized.verticalDatum ?? legacyHeightDatum ?? '待确认',
      unit: normalized.unit ?? 'm',
      knownPoints: Array.isArray(normalized.knownPoints) ? normalized.knownPoints : [],
      unknownPoints: Array.isArray(normalized.unknownPoints) ? normalized.unknownPoints : [],
      observations: Array.isArray(normalized.observations) ? normalized.observations : [],
      inputAttachmentHash,
      qualityStatus: 'imported', revision: 1, createdAt: nowIso(), updatedAt: nowIso()
    })
  }
  const rows = name.toLowerCase().endsWith('.xlsx') ? await parseXlsxRows(bytes) : parseDelimited(bytes.toString('utf8'))
  const observations: SurveyObservationV1[] = rows.map((row, index) => {
    const type = String(row.type || row.observationType || (networkType === 'leveling' || networkType === 'height-control' ? 'height-difference' : 'distance')) as SurveyObservationV1['type']
    const rawValue = row.value || row.heightDiff || row.distance || row.angle || row.direction
    const value = ['angle', 'direction', 'zenith'].includes(type) ? angleValue(rawValue) : asNumber(rawValue)
    if (value === undefined) throw new Error(`invalid observation value at row ${index + 2}`)
    return SurveyObservationV1.parse({ id: row.id || `obs_${index + 1}`, type, from: row.from || row.start || row.station, to: row.to || row.end || row.target, station: row.station, target: row.target, left: row.left, right: row.right, value, unit: row.unit || (['height-difference', 'distance', 'slope-distance', 'gnss-baseline'].includes(type) ? 'm' : 'deg'), sigma: asNumber(row.sigma), sigmaUnit: row.sigmaUnit || row.sigma_unit || undefined, covariance: row.covariance ? row.covariance.split(/[;\s]+/).map(Number).filter(Number.isFinite) : undefined, targetX: asNumber(row.targetX || row.target_x), targetY: asNumber(row.targetY || row.target_y), targetHeight: asNumber(row.targetHeight || row.target_h), stationHeightOffset: asNumber(row.stationHeightOffset || row.instrumentHeight || row.instrument_height), targetHeightOffset: asNumber(row.targetHeightOffset || row.prismHeight || row.prism_height), routeLength: asNumber(row.routeLength), sourceRow: index + 2, sourceLocator: row.worksheet ? `${row.worksheet}!${index + 2}` : undefined })
  })
  const ids = [...new Set(observations.flatMap(observationEndpointIds))]
  const points = ids.map((id) => SurveyPointV1.parse({ id, pointClass: 'unknown', known: false }))
    return SurveyNetworkV1.parse({ schemaVersion: 1, id: `network_${randomUUID()}`, projectId, networkType: networkType ?? 'leveling', coordinateSystem: '待确认', projection: '待确认', ellipsoid: '待确认', verticalDatum: '待确认', unit: 'm', knownPoints: [], unknownPoints: points, observations, inputAttachmentHash, qualityStatus: 'imported', findings: [], revision: 1, createdAt: nowIso(), updatedAt: nowIso() })
}

async function parseXlsxRows(bytes: Buffer): Promise<Record<string, string>[]> {
  const zip = await JSZip.loadAsync(bytes)
  const sharedXml = zip.file('xl/sharedStrings.xml') ? await zip.file('xl/sharedStrings.xml')!.async('text') : ''
  const shared = [...sharedXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ''))
  const files = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()
  const output: Record<string, string>[] = []
  for (const fileName of files) {
    const xml = await zip.file(fileName)!.async('text'); const rows: string[][] = []
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cell of rowMatch[1]!.matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*?(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g)) {
        const index = lettersToIndex(cell[1]!); const value = decodeXml(cell[3]!.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? cell[3]!.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '')
        cells[index] = cell[2] === 's' ? (shared[Number(value)] ?? value) : value
      }
      rows.push(cells)
    }
    const headers = (rows[0] ?? []).map((value, index) => value || `column_${index + 1}`)
    for (const cells of rows.slice(1)) output.push({ ...Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])), worksheet: fileName })
  }
  return output
}

function lettersToIndex(value: string): number { let index = 0; for (const char of value) index = index * 26 + char.charCodeAt(0) - 64; return index - 1 }
function decodeXml(value: string): string { return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'") }

function normalizeObservationValue(observation: SurveyObservationV1): number {
  if (observation.type === 'height-difference' || observation.type === 'distance' || observation.type === 'slope-distance' || observation.type === 'gnss-baseline') {
    const unit = observation.unit.toLowerCase()
    if (unit === 'mm') return observation.value / 1000
    if (unit === 'cm') return observation.value / 100
    if (unit === 'km') return observation.value * 1000
  }
  return observation.value
}

function normalizedResidualUnit(observation: SurveyObservationV1): 'm' | 'rad' {
  return observation.type === 'direction' || observation.type === 'angle' || observation.type === 'zenith' ? 'rad' : 'm'
}

function inferredClosureUnits(closure: Record<string, number>): Record<string, 'm' | 'rad' | 'ppm' | 'ratio'> {
  const units: Record<string, 'm' | 'rad' | 'ppm' | 'ratio'> = {}
  for (const key of Object.keys(closure)) {
    if (key === 'rotationRad' || key === 'angular') units[key] = 'rad'
    else if (key === 'scalePpm') units[key] = 'ppm'
    else if (key === 'relativeClosure') units[key] = 'ratio'
    else units[key] = 'm'
  }
  return units
}

function normalizeLengthUncertainty(value: number, unit: string): number {
  const lower = unit.toLowerCase()
  if (lower === 'mm') return value / 1000
  if (lower === 'cm') return value / 100
  if (lower === 'km') return value * 1000
  return value
}

function angleRadians(value: number, unit: string): number {
  const lower = unit.toLowerCase()
  if (lower.includes('rad')) return value
  if (lower.includes('gon')) return value * Math.PI / 200
  if (lower.includes('sec') || lower === '″') return value / 206264.806247
  return value * Math.PI / 180
}

function positiveRadians(value: number): number {
  const wrapped = wrapRadians(value)
  return wrapped < 0 ? wrapped + 2 * Math.PI : wrapped
}

function mergeFindings(...groups: SurveyQualityFindingV1[][]): SurveyQualityFindingV1[] {
  const unique = new Map<string, SurveyQualityFindingV1>()
  for (const item of groups.flat()) {
    const key = `${item.code}:${item.message}:${item.row ?? ''}`
    if (!unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()]
}

function levelingRouteClosure(network: SurveyNetworkV1, observations: SurveyObservationV1[], points = pointMap(network)): number | undefined {
  const first = observations[0]
  const last = observations[observations.length - 1]
  if (!first?.from || !last?.to) return undefined
  const ordered = observations.every((observation, index) => Boolean(observation.from && observation.to) && (index === 0 || observations[index - 1]!.to === observation.from))
  if (!ordered) return undefined
  const observed = observations.reduce((sum, observation) => sum + normalizeObservationValue(observation), 0)
  const declaredClosed = network.instrumentParameters.closedLoop === 1 || first.from === last.to
  if (declaredClosed) return first.from === last.to ? observed : undefined
  const start = points.get(first.from)
  const end = points.get(last.to)
  return start?.known && end?.known && start.height !== undefined && end.height !== undefined
    ? observed - (end.height - start.height)
    : undefined
}

function levelingStrategyFindings(network: SurveyNetworkV1, nowIso: () => string): SurveyQualityFindingV1[] {
  const observations = network.observations.filter((item) => item.type === 'height-difference')
  const points = pointMap(network)
  const findings: SurveyQualityFindingV1[] = []
  if (!observations.length) findings.push(finding(network.id, 'invalid_observation', 'blocking', '水准网没有高差观测', '导入包含 from、to 和高差值的水准观测', undefined, nowIso))
  const unsupported = network.observations.find((item) => item.type !== 'height-difference')
  if (unsupported) findings.push(finding(network.id, 'invalid_observation', 'blocking', `水准网不支持观测类型 ${unsupported.type}`, '水准/高程控制网仅导入高差观测，其他观测请使用对应网型', unsupported.sourceRow, nowIso))
  if (!network.knownPoints.some((point) => point.known && point.height !== undefined)) findings.push(finding(network.id, 'missing_datum', 'blocking', '水准网缺少已知高程基准点', '至少提供一个已知点高程并标记为已知', undefined, nowIso))
  const malformed = observations.find((item) => !item.from || !item.to)
  if (malformed) findings.push(finding(network.id, 'malformed_geometry', 'blocking', `水准观测 ${malformed.id} 缺少起点或终点`, '补充 from/to 点号后重新导入', malformed.sourceRow, nowIso))
  const missingPoint = observations.flatMap(observationEndpointIds).find((id) => !points.has(id))
  if (missingPoint) findings.push(finding(network.id, 'missing_point', 'blocking', `水准观测引用了不存在的点 ${missingPoint}`, '补充点记录或修正观测点号', undefined, nowIso))
  if (network.instrumentParameters.closedLoop === 1 && observations.length) {
    const first = observations[0]!
    const last = observations[observations.length - 1]!
    const ordered = observations.every((observation, index) => index === 0 || observations[index - 1]!.to === observation.from)
    if (!ordered || !first.from || first.from !== last.to) findings.push(finding(network.id, 'malformed_geometry', 'blocking', '声明的水准闭合路线不是首尾相接的连续观测序列', '按测段顺序整理观测，并确保最后一点回到起点', undefined, nowIso))
  }
  return findings
}

function traverseAzimuths(network: SurveyNetworkV1, distances: SurveyObservationV1[], angular: SurveyObservationV1[]): number[] | null {
  const routePointIds = [distances[0]?.from, ...distances.map((item) => item.to)]
  const startAzimuth = network.instrumentParameters.startAzimuthRad
    ?? (network.instrumentParameters.startAzimuthDeg === undefined ? undefined : network.instrumentParameters.startAzimuthDeg * Math.PI / 180)
  const azimuths: number[] = []
  for (let index = 0; index < distances.length; index += 1) {
    const edge = distances[index]!
    const direction = angular.find((item) => item.type === 'direction' && (item.from ?? item.station) === edge.from && (item.to ?? item.target) === edge.to)
    if (direction) {
      azimuths.push(angleRadians(direction.value, direction.unit))
      continue
    }
    if (index === 0) {
      if (startAzimuth === undefined) return null
      azimuths.push(startAzimuth)
      continue
    }
    const turn = angular.find((item) => item.type === 'angle' && item.station === routePointIds[index] && item.left === routePointIds[index - 1] && item.right === routePointIds[index + 1])
    if (!turn) return null
    azimuths.push(azimuths[index - 1]! + Math.PI + angleRadians(turn.value, turn.unit))
  }
  return azimuths
}

function traverseStrategyFindings(network: SurveyNetworkV1, nowIso: () => string): SurveyQualityFindingV1[] {
  const distances = network.observations.filter((item) => item.type === 'distance')
  const angular = network.observations.filter((item) => ['angle', 'direction'].includes(item.type))
  const findings: SurveyQualityFindingV1[] = []
  const unsupported = network.observations.find((item) => !['distance', 'angle', 'direction'].includes(item.type))
  if (unsupported) findings.push(finding(network.id, 'invalid_observation', 'blocking', `导线网不能把 ${unsupported.type} 直接作为水平边长或角度参与平差`, '先完成斜距化平/天顶距处理，或改用水平距离、方向和转折角', unsupported.sourceRow, nowIso))
  if (distances.length < 2 || !angular.length) findings.push(finding(network.id, 'invalid_observation', 'blocking', '导线平差至少需要两条有序边长和完整角度/方向观测', '补充导线边长及转折角或绝对方向观测', undefined, nowIso))
  if (distances.some((item) => !item.from || !item.to) || distances.some((item, index) => index > 0 && distances[index - 1]!.to !== item.from)) {
    findings.push(finding(network.id, 'malformed_geometry', 'blocking', '导线边长必须按 from→to 连续有序排列', '按导线行进顺序整理边长观测，确保上一边终点等于下一边起点', undefined, nowIso))
    return findings
  }
  if (!distances.length) return findings
  const points = pointMap(network)
  const start = points.get(distances[0]!.from!)
  const end = points.get(distances[distances.length - 1]!.to!)
  if (!start?.known || !end?.known || start.x === undefined || start.y === undefined || end.x === undefined || end.y === undefined) {
    findings.push(finding(network.id, 'missing_datum', 'blocking', '附合/闭合导线必须有已知起点和已知终点坐标', '将首尾控制点标记为已知并提供 X/Y 坐标', undefined, nowIso))
  }
  const routePointIds = [distances[0]!.from!, ...distances.map((item) => item.to!)]
  const missingCoordinate = routePointIds.find((id) => {
    const point = points.get(id)
    return !point || point.x === undefined || point.y === undefined
  })
  if (missingCoordinate) findings.push(finding(network.id, 'missing_point', 'blocking', `导线点 ${missingCoordinate} 缺少平面近似坐标`, '为路线内每个已知点和未知点提供 X/Y 坐标', undefined, nowIso))
  const interiorIds = new Set(routePointIds.slice(1, -1))
  if (!network.unknownPoints.some((point) => interiorIds.has(point.id))) findings.push(finding(network.id, 'invalid_observation', 'blocking', '导线没有需要平差的中间未知点', '至少提供一个位于有序导线中的未知点及其近似坐标', undefined, nowIso))
  const unmatchedAngular = angular.find((item) => {
    if (item.type === 'direction') return !distances.some((edge) => (item.from ?? item.station) === edge.from && (item.to ?? item.target) === edge.to)
    return !distances.slice(1).some((_, index) => item.station === routePointIds[index + 1] && item.left === routePointIds[index] && item.right === routePointIds[index + 2])
  })
  if (unmatchedAngular) findings.push(finding(network.id, 'malformed_geometry', 'blocking', `导线角度/方向观测 ${unmatchedAngular.id} 与有序路线不匹配`, '使用路线相邻点填写 direction 的 from/to，或 angle 的 station/left/right', unmatchedAngular.sourceRow, nowIso))
  if (!traverseAzimuths(network, distances, angular)) findings.push(finding(network.id, 'malformed_geometry', 'blocking', '导线缺少完整定向：每条边必须有绝对方向，或由起始方位角和连续转折角推算', '补充逐边方向，或设置 startAzimuthDeg 并按相邻点填写转折角', undefined, nowIso))
  return findings
}

function planeControlStrategyFindings(network: SurveyNetworkV1, nowIso: () => string): SurveyQualityFindingV1[] {
  const supported = network.observations.filter((item) => ['distance', 'direction', 'angle'].includes(item.type))
  const points = pointMap(network)
  const findings: SurveyQualityFindingV1[] = []
  if (supported.length < 2) findings.push(finding(network.id, 'invalid_observation', 'blocking', '平面控制网至少需要两条距离、绝对方向或测站角观测', '补充能够独立确定未知坐标的平面观测', undefined, nowIso))
  const unsupported = network.observations.find((item) => !['distance', 'direction', 'angle'].includes(item.type))
  if (unsupported) findings.push(finding(network.id, 'invalid_observation', 'blocking', `平面控制网不支持直接使用 ${unsupported.type}`, '先完成观测预处理，再导入水平距离、绝对方向或测站角', unsupported.sourceRow, nowIso))
  if (!network.unknownPoints.some((point) => !point.known)) findings.push(finding(network.id, 'invalid_observation', 'blocking', '平面控制网没有待平差未知点', '至少提供一个含 X/Y 近似坐标的未知点', undefined, nowIso))
  if (!network.knownPoints.some((point) => point.known && point.x !== undefined && point.y !== undefined)) findings.push(finding(network.id, 'missing_datum', 'blocking', '平面控制网缺少已知坐标约束', '至少提供一个已知平面控制点，或使用明确的自由网约束', undefined, nowIso))
  for (const observation of supported) {
    const fromId = observation.from ?? observation.station
    const toId = observation.to ?? observation.target
    if ((observation.type === 'distance' || observation.type === 'direction') && (!fromId || !toId)) {
      findings.push(finding(network.id, 'malformed_geometry', 'blocking', `观测 ${observation.id} 缺少 from/to 或 station/target`, '补充观测起点和目标点', observation.sourceRow, nowIso))
    }
    if (observation.type === 'angle' && (!observation.station || !observation.left || !observation.right || new Set([observation.station, observation.left, observation.right]).size < 3)) {
      findings.push(finding(network.id, 'malformed_geometry', 'blocking', `角度观测 ${observation.id} 缺少有效的 station/left/right 几何`, '填写三个互不相同且存在坐标的点号', observation.sourceRow, nowIso))
    }
    if (observation.type === 'angle' && observation.station && observation.left && observation.right) {
      const station = points.get(observation.station)
      const left = points.get(observation.left)
      const right = points.get(observation.right)
      if (station?.x !== undefined && station.y !== undefined && left?.x !== undefined && left.y !== undefined && right?.x !== undefined && right.y !== undefined
        && (Math.hypot(left.x - station.x, left.y - station.y) < 1e-9 || Math.hypot(right.x - station.x, right.y - station.y) < 1e-9)) {
        findings.push(finding(network.id, 'malformed_geometry', 'blocking', `角度观测 ${observation.id} 的测站与照准点坐标重合`, '修正点号或近似坐标，使两条照准方向具有有效长度', observation.sourceRow, nowIso))
      }
    }
    for (const id of observationEndpointIds(observation)) {
      const point = points.get(id)
      if (!point || point.x === undefined || point.y === undefined) findings.push(finding(network.id, 'missing_point', 'blocking', `平面观测 ${observation.id} 的点 ${id} 缺少 X/Y 坐标`, '补充已知坐标或未知点近似坐标', observation.sourceRow, nowIso))
    }
  }
  return mergeFindings(findings)
}

function triangulationStrategyFindings(network: SurveyNetworkV1, nowIso: () => string): SurveyQualityFindingV1[] {
  const angles = network.observations.filter((item) => item.type === 'angle')
  const supported = network.observations.filter((item) => ['angle', 'direction', 'distance'].includes(item.type))
  const points = pointMap(network)
  const findings: SurveyQualityFindingV1[] = []
  if (angles.length < 2) findings.push(finding(network.id, 'invalid_observation', 'blocking', angles.length === 0 ? '三角网不能使用纯距离观测冒充角度网络' : '三角网至少需要两条独立测站角观测', '提供采用 station/left/right 表达的三角网角度观测', undefined, nowIso))
  const unsupported = network.observations.find((item) => !['angle', 'direction', 'distance'].includes(item.type))
  if (unsupported) findings.push(finding(network.id, 'invalid_observation', 'blocking', `三角网不支持直接使用 ${unsupported.type}`, '先完成观测预处理，再导入测站角及必要的方向/尺度观测', unsupported.sourceRow, nowIso))
  if (network.knownPoints.filter((point) => point.known && point.x !== undefined && point.y !== undefined).length < 2) findings.push(finding(network.id, 'missing_datum', 'blocking', '三角网缺少两个已知平面控制点来固定基准和尺度', '至少提供两个不重合的已知控制点坐标', undefined, nowIso))
  const knownCoordinateKeys = new Set(network.knownPoints.filter((point) => point.known && point.x !== undefined && point.y !== undefined).map((point) => `${point.x}:${point.y}`))
  if (network.knownPoints.filter((point) => point.known && point.x !== undefined && point.y !== undefined).length >= 2 && knownCoordinateKeys.size < 2) findings.push(finding(network.id, 'malformed_geometry', 'blocking', '三角网已知控制点坐标重合，无法固定基准和尺度', '提供至少两个坐标不同的已知控制点', undefined, nowIso))
  if (!network.unknownPoints.some((point) => !point.known)) findings.push(finding(network.id, 'invalid_observation', 'blocking', '三角网没有待平差未知点', '至少提供一个含 X/Y 近似坐标的未知点', undefined, nowIso))
  for (const observation of supported) {
    const fromId = observation.from ?? observation.station
    const toId = observation.to ?? observation.target
    if (observation.type === 'angle' && (!observation.station || !observation.left || !observation.right || new Set([observation.station, observation.left, observation.right]).size < 3)) {
      findings.push(finding(network.id, 'malformed_geometry', 'blocking', `三角网角度 ${observation.id} 缺少有效的 station/left/right 几何`, '填写三个互不相同且存在坐标的点号', observation.sourceRow, nowIso))
    }
    if (observation.type === 'angle' && observation.station && observation.left && observation.right) {
      const station = points.get(observation.station)
      const left = points.get(observation.left)
      const right = points.get(observation.right)
      if (station?.x !== undefined && station.y !== undefined && left?.x !== undefined && left.y !== undefined && right?.x !== undefined && right.y !== undefined
        && (Math.hypot(left.x - station.x, left.y - station.y) < 1e-9 || Math.hypot(right.x - station.x, right.y - station.y) < 1e-9)) {
        findings.push(finding(network.id, 'malformed_geometry', 'blocking', `三角网角度 ${observation.id} 的测站与照准点坐标重合`, '修正点号或近似坐标，使两条照准方向具有有效长度', observation.sourceRow, nowIso))
      }
    }
    if ((observation.type === 'distance' || observation.type === 'direction') && (!fromId || !toId)) {
      findings.push(finding(network.id, 'malformed_geometry', 'blocking', `三角网观测 ${observation.id} 缺少起点或目标点`, '补充 from/to 或 station/target 点号', observation.sourceRow, nowIso))
    }
    for (const id of observationEndpointIds(observation)) {
      const point = points.get(id)
      if (!point || point.x === undefined || point.y === undefined) findings.push(finding(network.id, 'missing_point', 'blocking', `三角网观测 ${observation.id} 的点 ${id} 缺少 X/Y 坐标`, '补充已知坐标或未知点近似坐标', observation.sourceRow, nowIso))
    }
  }
  return mergeFindings(findings)
}

function cpiiiStrategyFindings(network: SurveyNetworkV1, nowIso: () => string): SurveyQualityFindingV1[] {
  const stations = network.unknownPoints.filter((point) => !point.known && point.pointClass === 'station')
  const stationIds = new Set(stations.map((point) => point.id))
  const points = pointMap(network)
  const findings: SurveyQualityFindingV1[] = []
  const supportedTypes: SurveyObservationV1['type'][] = ['distance', 'slope-distance', 'direction', 'zenith']
  const unsupported = network.observations.find((item) => !supportedTypes.includes(item.type))
  if (unsupported) findings.push(finding(network.id, 'invalid_observation', 'blocking', `CPIII 自由测站不支持观测类型 ${unsupported.type}`, '导入方向、水平距离、斜距和天顶距观测；测站角应先转换为方向读数', unsupported.sourceRow, nowIso))
  if (!stations.length) findings.push(finding(network.id, 'invalid_observation', 'blocking', 'CPIII 网络没有 pointClass=station 的未知测站', '至少提供一个含 X/Y 近似坐标的未知测站', undefined, nowIso))
  if (network.unknownPoints.some((point) => !point.known && point.pointClass !== 'station')) findings.push(finding(network.id, 'invalid_observation', 'blocking', 'CPIII 自由测站策略只允许测站坐标为未知参数', '将照准目标设置为已知 CPIII 控制点，其他未知点使用平面控制网策略', undefined, nowIso))
  for (const observation of network.observations.filter((item) => supportedTypes.includes(item.type))) {
    const stationId = observation.station ?? observation.from
    const targetId = observation.target ?? observation.to
    if (!stationId || !targetId || stationId === targetId) {
      findings.push(finding(network.id, 'malformed_geometry', 'blocking', `CPIII 观测 ${observation.id} 缺少有效 station/target`, '填写互不相同的测站和固定目标点号', observation.sourceRow, nowIso))
      continue
    }
    if (!stationIds.has(stationId)) findings.push(finding(network.id, 'malformed_geometry', 'blocking', `CPIII 观测 ${observation.id} 的测站 ${stationId} 不是未知 station 点`, '将测站定义为 pointClass=station 的未知点', observation.sourceRow, nowIso))
    const station = points.get(stationId)
    const target = points.get(targetId)
    if (!station || station.x === undefined || station.y === undefined) findings.push(finding(network.id, 'missing_point', 'blocking', `CPIII 测站 ${stationId} 缺少 X/Y 近似坐标`, '补充测站平面近似坐标', observation.sourceRow, nowIso))
    if (!target?.known || target.x === undefined || target.y === undefined) findings.push(finding(network.id, 'missing_datum', 'blocking', `CPIII 目标 ${targetId} 不是含 X/Y 坐标的固定控制点`, '补充固定 CPIII 目标坐标并标记为已知', observation.sourceRow, nowIso))
    if ((observation.type === 'slope-distance' || observation.type === 'zenith') && (station?.height === undefined || target?.height === undefined)) findings.push(finding(network.id, 'missing_datum', 'blocking', `CPIII 垂直观测 ${observation.id} 缺少测站或目标高程`, '补充测站近似高程和固定目标高程', observation.sourceRow, nowIso))
  }
  for (const station of stations) {
    const stationObservations = network.observations.filter((item) => (item.station ?? item.from) === station.id && supportedTypes.includes(item.type))
    const directions = stationObservations.filter((item) => item.type === 'direction')
    const directionTargets = new Set(directions.map((item) => item.target ?? item.to).filter((id): id is string => Boolean(id)))
    if (directions.length < 3 || directionTargets.size < 3) findings.push(finding(network.id, 'malformed_geometry', 'blocking', `CPIII 测站 ${station.id} 少于三个独立固定方向目标`, '每个测站至少观测三个不同的固定 CPIII 目标方向', undefined, nowIso))
    const verticalTargets = new Set(stationObservations.filter((item) => item.type === 'slope-distance' || item.type === 'zenith').map((item) => item.target ?? item.to).filter((id): id is string => Boolean(id)))
    for (const targetId of verticalTargets) {
      const hasSlope = stationObservations.some((item) => item.type === 'slope-distance' && (item.target ?? item.to) === targetId)
      const hasZenith = stationObservations.some((item) => item.type === 'zenith' && (item.target ?? item.to) === targetId)
      if (!hasSlope || !hasZenith) findings.push(finding(network.id, 'malformed_geometry', 'blocking', `CPIII 测站 ${station.id} 至目标 ${targetId} 的斜距/天顶距证据不成对`, '为同一 station/target 同时提供 slope-distance 和 zenith', undefined, nowIso))
    }
  }
  return mergeFindings(findings)
}

function buildLevelingResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const baseFindings = mergeFindings(network.findings.filter((item) => item.status === 'open'), levelingStrategyFindings(network, nowIso))
  if (baseFindings.some((item) => item.severity === 'blocking')) return invalidAdjustmentResult(network, run, baseFindings, nowIso)
  const points = pointMap(network); const unknown = network.unknownPoints.filter((point) => !point.known)
  const unknownIds = unknown.map((point) => point.id); const index = new Map(unknownIds.map((id, i) => [id, i]))
  const rows: Array<{ coefficients: number[]; misclosure: number; weight: number; observation: SurveyObservationV1 }> = []
  for (const observation of network.observations) {
    if (observation.type !== 'height-difference') continue
    if (!observation.from || !observation.to) continue
    const from = points.get(observation.from); const to = points.get(observation.to); if (!from || !to) continue
    const fromApprox = from.height ?? 0; const toApprox = to.height ?? 0
    const coefficients = Array.from({ length: unknownIds.length }, () => 0)
    const fromIndex = index.get(observation.from); const toIndex = index.get(observation.to)
    if (fromIndex !== undefined) coefficients[fromIndex] = -1
    if (toIndex !== undefined) coefficients[toIndex] = 1
    const weight = observation.sigma === undefined
      ? 1 / (observation.routeLength ?? 1)
      : 1 / normalizeLengthUncertainty(observation.sigma, observation.sigmaUnit ?? observation.unit) ** 2
    rows.push({ coefficients, misclosure: normalizeObservationValue(observation) - (toApprox - fromApprox), weight, observation })
  }
  const solved = weightedLeastSquares(rows)
  if (!solved) return invalidAdjustmentResult(network, run, baseFindings.concat(finding(network.id, 'rank_deficient', 'blocking', '水准网法方程秩亏或网形不连通', '补充已知点或观测，检查点号和网形')), nowIso)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const i = index.get(point.id); const correction = i === undefined ? 0 : solved.corrections[i]!
    const q = i === undefined ? undefined : solved.covariance[i]?.[i]
    return { id: point.id, ...(point.height === undefined ? {} : { height: point.height }), ...(i === undefined ? {} : { correctionHeight: correction, height: (point.height ?? 0) + correction, standardError: Math.sqrt(Math.max(0, (q ?? 0) * solved.varianceFactor)), covariance: solved.covariance[i] }) }
  })
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  const observationResults = rows.map((row, i) => ({ observationId: row.observation.id, correction: solved.residuals[i]!, residual: solved.residuals[i]!, unit: 'm' as const, standardizedResidual: Math.abs(solved.residuals[i]!) / Math.max(1e-12, Math.sqrt(1 / row.weight)), outlier: Math.abs(solved.residuals[i]!) / Math.max(1e-12, Math.sqrt(1 / row.weight)) > 3, sourceRow: row.observation.sourceRow }))
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `观测 ${item.observationId} 的标准化残差超过 3σ`, '复核原始观测、仪器和录入值', item.sourceRow, nowIso))
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  const closureValue = levelingRouteClosure(network, rows.map((row) => row.observation), points)
  const closure = closureValue === undefined ? {} : { heightDifference: closureValue }
  const closureUnits = closureValue === undefined ? {} : { heightDifference: 'm' as const }
  const reliabilityFindings = solved.varianceFactorEstimated ? [] : [finding(network.id, 'insufficient_redundancy', 'warning', '水准网没有多余观测，单位权中误差采用先验值，不能进行后验精度检验', '增加独立复测路线或闭合观测', undefined, nowIso)]
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: rows.length, unknownCount: unknownIds.length, redundancy: solved.dof, degreesOfFreedom: solved.dof, linearUnit: 'm', angularUnit: 'rad', closure, closureUnits, unitWeightStdDev: solved.unitWeightStdDev, varianceFactor: solved.varianceFactor, varianceFactorEstimated: solved.varianceFactorEstimated, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings, ...reliabilityFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length ? 'invalid' : 'valid', solverDiagnostics: { iterations: 1, rank: solved.rank, conditionEstimate: solved.conditionEstimate }, createdAt: nowIso() })
}

function displacement(point: SurveyPointV1, adjusted: { x?: number; y?: number; height?: number }): AdjustmentDisplacementV1 {
  const dX = adjusted.x === undefined || point.x === undefined ? undefined : adjusted.x - point.x
  const dY = adjusted.y === undefined || point.y === undefined ? undefined : adjusted.y - point.y
  const dH = adjusted.height === undefined || point.height === undefined ? undefined : adjusted.height - point.height
  const magnitude = Math.sqrt((dX ?? 0) ** 2 + (dY ?? 0) ** 2 + (dH ?? 0) ** 2)
  const kind = dH !== undefined && (dX !== undefined || dY !== undefined) ? 'three-dimensional' : dH !== undefined ? 'vertical' : 'horizontal'
  return AdjustmentDisplacementV1.parse({ pointId: point.id, ...(dX === undefined ? {} : { dX }), ...(dY === undefined ? {} : { dY }), ...(dH === undefined ? {} : { dH }), magnitude, kind })
}

/**
 * GNSS baselines have their own observation model.  A baseline value is the
 * horizontal baseline length for this first local implementation; its
 * variance is taken from sigma or the first covariance diagonal entry.  We do
 * not silently turn a baseline into a generic distance observation: missing
 * covariance, datum or endpoint coordinates are hard blockers.
 */
function buildGnssResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const points = pointMap(network)
  const unknown = network.unknownPoints.filter((point) => !point.known)
  const unknownIds = unknown.map((point) => point.id)
  const index = new Map(unknownIds.flatMap((id, i) => [[`${id}:x`, i * 2], [`${id}:y`, i * 2 + 1]]))
  const baselines = network.observations.filter((item) => item.type === 'gnss-baseline')
  const baseFindings = network.findings.filter((item) => item.status === 'open')
  const missingDatum = !network.knownPoints.some((point) => point.known)
  const missingCovariance = baselines.some((item) => !item.covariance?.length && !(item.sigma && item.sigma > 0))
  if (!baselines.length) return invalidAdjustmentResult(network, run, baseFindings.concat(finding(network.id, 'missing_baseline', 'blocking', 'GNSS 网络没有基线观测', '导入至少一条带端点和协方差的基线', undefined, nowIso)), nowIso)
  if (missingCovariance || missingDatum) {
    const findings = [...baseFindings]
    if (missingCovariance) findings.push(finding(network.id, 'missing_covariance', 'blocking', 'GNSS 基线缺少标准协方差', '补充基线协方差后重试', undefined, nowIso))
    if (missingDatum) findings.push(finding(network.id, 'missing_datum', 'blocking', 'GNSS 平差缺少固定基准点', '指定至少一个已知基准点后重试', undefined, nowIso))
    return invalidAdjustmentResult(network, run, findings, nowIso)
  }
  const rows: Array<{ coefficients: number[]; misclosure: number; weight: number; observation: SurveyObservationV1 }> = []
  for (const observation of baselines) {
    const fromId = observation.from; const toId = observation.to
    const from = fromId ? points.get(fromId) : undefined; const to = toId ? points.get(toId) : undefined
    const rawSigma = observation.sigma ?? (observation.covariance?.[0] && observation.covariance[0] > 0 ? Math.sqrt(observation.covariance[0]) : undefined)
    const sigma = rawSigma === undefined ? undefined : normalizeLengthUncertainty(rawSigma, observation.sigmaUnit ?? observation.unit)
    if (!from || !to || from.x === undefined || from.y === undefined || to.x === undefined || to.y === undefined || !sigma || !Number.isFinite(sigma) || sigma <= 0) {
      return invalidAdjustmentResult(network, run, baseFindings.concat(finding(network.id, 'missing_covariance', 'blocking', `GNSS 基线 ${observation.id} 缺少端点坐标或正定协方差`, '补充固定基准、点坐标和标准基线协方差', observation.sourceRow, nowIso)), nowIso)
    }
    const dx = to.x - from.x; const dy = to.y - from.y; const distance = Math.max(1e-12, Math.hypot(dx, dy))
    const coefficients = Array.from({ length: unknownIds.length * 2 }, () => 0)
    const fromX = index.get(`${fromId}:x`); const fromY = index.get(`${fromId}:y`); const toX = index.get(`${toId}:x`); const toY = index.get(`${toId}:y`)
    if (fromX !== undefined) coefficients[fromX] = -dx / distance
    if (fromY !== undefined) coefficients[fromY] = -dy / distance
    if (toX !== undefined) coefficients[toX] = dx / distance
    if (toY !== undefined) coefficients[toY] = dy / distance
    const observed = normalizeObservationValue(observation)
    rows.push({ coefficients, misclosure: observed - distance, weight: 1 / (sigma * sigma), observation })
  }
  const solved = weightedLeastSquares(rows)
  if (!solved) return invalidAdjustmentResult(network, run, baseFindings.concat(finding(network.id, 'rank_deficient', 'blocking', 'GNSS 基线法方程秩亏或基准不完整', '补充独立基线或检查固定点约束', undefined, nowIso)), nowIso)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const ix = index.get(`${point.id}:x`); const iy = index.get(`${point.id}:y`)
    if (ix === undefined || iy === undefined) return { id: point.id, x: point.x, y: point.y, ...(point.height === undefined ? {} : { height: point.height }) }
    const correctionX = solved.corrections[ix]!; const correctionY = solved.corrections[iy]!
    const qx = solved.covariance[ix]?.[ix] ?? 0; const qy = solved.covariance[iy]?.[iy] ?? 0
    return { id: point.id, x: (point.x ?? 0) + correctionX, y: (point.y ?? 0) + correctionY, correctionX, correctionY, standardError: Math.sqrt(Math.max(0, (qx + qy) * solved.varianceFactor / 2)), covariance: [...(solved.covariance[ix] ?? []), ...(solved.covariance[iy] ?? [])] }
  })
  const observationResults = rows.map((row, i) => {
    const sigma = Math.sqrt(1 / row.weight); const residual = solved.residuals[i]!; const standardized = Math.abs(residual) / Math.max(1e-12, sigma)
    return { observationId: row.observation.id, correction: residual, residual, unit: 'm' as const, standardizedResidual: standardized, outlier: standardized > 3, sourceRow: row.observation.sourceRow }
  })
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `GNSS 基线 ${item.observationId} 的标准化残差超过 3σ`, '复核基线解算、天线高和协方差', item.sourceRow, nowIso))
  const closure = Math.sqrt(observationResults.reduce((sum, item) => sum + item.residual ** 2, 0))
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: rows.length, unknownCount: unknownIds.length * 2, redundancy: solved.dof, degreesOfFreedom: solved.dof, linearUnit: 'm', angularUnit: 'rad', closure: { baseline: closure }, closureUnits: { baseline: 'm' }, unitWeightStdDev: solved.unitWeightStdDev, varianceFactor: solved.varianceFactor, varianceFactorEstimated: solved.varianceFactorEstimated, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 }, qualityFindings: baseFindings.concat(outlierFindings), inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length ? 'invalid' : 'valid', solverDiagnostics: { iterations: 1, rank: solved.rank, conditionEstimate: solved.conditionEstimate }, createdAt: nowIso() })
}

function buildPlaneControlResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const baseFindings = mergeFindings(network.findings.filter((item) => item.status === 'open'), planeControlStrategyFindings(network, nowIso))
  if (baseFindings.some((item) => item.severity === 'blocking')) return invalidAdjustmentResult(network, run, baseFindings, nowIso)
  const points = pointMap(network)
  const observations = network.observations.filter((item) => ['distance', 'direction', 'angle'].includes(item.type))
  const unknownIds = network.unknownPoints.filter((point) => !point.known).map((point) => point.id)
  const initialParameters = unknownIds.flatMap((id) => [points.get(id)!.x!, points.get(id)!.y!])
  const coordinates = (parameters: readonly number[]): Map<string, { x: number; y: number }> => new Map([...points].map(([id, point]) => {
    const index = unknownIds.indexOf(id)
    return [id, index < 0 ? { x: point.x!, y: point.y! } : { x: parameters[index * 2]!, y: parameters[index * 2 + 1]! }]
  }))
  const bearing = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.x - from.x, to.y - from.y)
  const model = (observation: SurveyObservationV1, parameters: readonly number[]): number | null => {
    const map = coordinates(parameters)
    if (observation.type === 'angle') {
      const station = observation.station ? map.get(observation.station) : undefined
      const left = observation.left ? map.get(observation.left) : undefined
      const right = observation.right ? map.get(observation.right) : undefined
      if (!station || !left || !right) return null
      const result = bearing(station, right) - bearing(station, left)
      return result < 0 ? result + 2 * Math.PI : result
    }
    const from = map.get((observation.from ?? observation.station)!)
    const to = map.get((observation.to ?? observation.target)!)
    if (!from || !to) return null
    return observation.type === 'direction' ? bearing(from, to) : Math.hypot(to.x - from.x, to.y - from.y)
  }
  const buildEquations = (parameters: readonly number[]) => observations.flatMap((observation) => {
    const computed = model(observation, parameters)
    if (computed === null) return []
    const angular = observation.type === 'angle' || observation.type === 'direction'
    const observed = angular ? angleRadians(observation.value, observation.unit) : normalizeObservationValue(observation)
    const sigma = angular
      ? angleRadians(observation.sigma ?? 2, observation.sigmaUnit ?? 'arcsec')
      : normalizeLengthUncertainty(observation.sigma ?? 0.002, observation.sigmaUnit ?? observation.unit)
    return [{ coefficients: numericalJacobian((candidate) => model(observation, candidate) ?? computed, parameters, { angular }), misclosure: angular ? wrapRadians(observed - computed) : observed - computed, weight: 1 / Math.max(1e-18, sigma * sigma) }]
  })
  const solved = iterativeWeightedLeastSquares(initialParameters, buildEquations, { maxIterations: 15, convergence: 1e-7 })
  if (!solved) return invalidAdjustmentResult(network, run, mergeFindings(baseFindings, [finding(network.id, 'rank_deficient', 'blocking', '平面控制网法方程秩亏或观测几何不足', '增加独立方向、测站角或距离观测，并检查固定控制点', undefined, nowIso)]), nowIso)
  const adjusted = coordinates(solved.parameters)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const coordinate = adjusted.get(point.id)!
    const index = unknownIds.indexOf(point.id)
    if (index < 0) return { id: point.id, x: coordinate.x, y: coordinate.y }
    const qx = solved.covariance[index * 2]?.[index * 2] ?? 0
    const qy = solved.covariance[index * 2 + 1]?.[index * 2 + 1] ?? 0
    return { id: point.id, x: coordinate.x, y: coordinate.y, correctionX: coordinate.x - point.x!, correctionY: coordinate.y - point.y!, standardError: Math.sqrt(Math.max(0, (qx + qy) * solved.varianceFactor)), covariance: [...(solved.covariance[index * 2] ?? []), ...(solved.covariance[index * 2 + 1] ?? [])] }
  })
  const equations = buildEquations(solved.parameters)
  const observationResults = observations.map((observation, index) => {
    const residual = -(equations[index]?.misclosure ?? 0)
    const sigma = Math.sqrt(1 / (equations[index]?.weight ?? 1))
    const standardizedResidual = Math.abs(residual) / Math.max(1e-12, sigma)
    return { observationId: observation.id, correction: residual, residual, unit: normalizedResidualUnit(observation), standardizedResidual, outlier: standardizedResidual > 3, sourceRow: observation.sourceRow }
  })
  const linearResiduals = observationResults.filter((item) => item.unit === 'm')
  const angularResiduals = observationResults.filter((item) => item.unit === 'rad')
  const closure = {
    ...(linearResiduals.length ? { horizontal: Math.sqrt(linearResiduals.reduce((sum, item) => sum + item.residual ** 2, 0)) } : {}),
    ...(angularResiduals.length ? { angular: Math.sqrt(angularResiduals.reduce((sum, item) => sum + item.residual ** 2, 0)) } : {})
  }
  const closureUnits = { ...(linearResiduals.length ? { horizontal: 'm' as const } : {}), ...(angularResiduals.length ? { angular: 'rad' as const } : {}) }
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `平面控制观测 ${item.observationId} 的标准化残差超过 3σ`, '复核原始观测、对中和定向', item.sourceRow, nowIso))
  const convergenceFindings = solved.converged ? [] : [finding(network.id, 'not_converged', 'blocking', `平面控制网在 ${solved.iterations} 次迭代后未收敛`, '检查近似坐标、粗差和网形后重试', undefined, nowIso)]
  const reliabilityFindings = solved.varianceFactorEstimated ? [] : [finding(network.id, 'insufficient_redundancy', 'warning', '平面控制网没有多余观测，不能进行后验精度检验', '增加独立复测方向、角度或边长', undefined, nowIso)]
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: observations.length, unknownCount: unknownIds.length * 2, redundancy: solved.dof, degreesOfFreedom: solved.dof, linearUnit: 'm', angularUnit: 'rad', closure, closureUnits, unitWeightStdDev: solved.unitWeightStdDev, varianceFactor: solved.varianceFactor, varianceFactorEstimated: solved.varianceFactorEstimated, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 && convergenceFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings, ...convergenceFindings, ...reliabilityFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length || convergenceFindings.length ? 'invalid' : 'valid', solverDiagnostics: { iterations: solved.iterations, rank: solved.rank, conditionEstimate: solved.conditionEstimate }, createdAt: nowIso() })
}

function buildTraverseResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const distances = network.observations.filter((item) => item.type === 'distance')
  const angular = network.observations.filter((item) => ['angle', 'direction'].includes(item.type))
  const baseFindings = mergeFindings(network.findings.filter((item) => item.status === 'open'), traverseStrategyFindings(network, nowIso))
  if (baseFindings.some((item) => item.severity === 'blocking')) return invalidAdjustmentResult(network, run, baseFindings, nowIso)
  const points = pointMap(network)
  const start = points.get(distances[0]!.from!)
  const end = points.get(distances[distances.length - 1]!.to!)
  const routePointIds = [distances[0]!.from!, ...distances.map((item) => item.to!)]

  const unknownIds = network.unknownPoints.filter((point) => !point.known).map((point) => point.id)
  const initialParameters = unknownIds.flatMap((id) => {
    const point = points.get(id)!
    return [point.x ?? 0, point.y ?? 0]
  })
  const coordinates = (parameters: readonly number[]): Map<string, { x: number; y: number }> => new Map([...points].map(([id, point]) => {
    const index = unknownIds.indexOf(id)
    return [id, index < 0 ? { x: point.x ?? 0, y: point.y ?? 0 } : { x: parameters[index * 2]!, y: parameters[index * 2 + 1]! }]
  }))
  const bearing = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.x - from.x, to.y - from.y)
  const model = (observation: SurveyObservationV1, parameters: readonly number[]): number | null => {
    const map = coordinates(parameters)
    if (observation.type === 'angle') {
      if (!observation.station || !observation.left || !observation.right) return null
      const station = map.get(observation.station); const left = map.get(observation.left); const right = map.get(observation.right)
      if (!station || !left || !right) return null
      const value = bearing(station, right) - bearing(station, left)
      return value < 0 ? value + 2 * Math.PI : value
    }
    const fromId = observation.from ?? observation.station; const toId = observation.to ?? observation.target
    const from = fromId ? map.get(fromId) : undefined; const to = toId ? map.get(toId) : undefined
    if (!from || !to) return null
    return observation.type === 'direction' ? bearing(from, to) : Math.hypot(to.x - from.x, to.y - from.y)
  }
  const usedObservations = [
    ...distances,
    ...angular.filter((item) => item.type === 'direction'
      ? distances.some((edge) => (item.from ?? item.station) === edge.from && (item.to ?? item.target) === edge.to)
      : distances.slice(1).some((_, index) => item.station === routePointIds[index + 1] && item.left === routePointIds[index] && item.right === routePointIds[index + 2]))
  ]
  const buildEquations = (parameters: readonly number[]) => usedObservations.flatMap((observation) => {
    const computed = model(observation, parameters)
    if (computed === null) return []
    const isAngular = observation.type === 'angle' || observation.type === 'direction'
    const observed = isAngular ? angleRadians(observation.value, observation.unit) : normalizeObservationValue(observation)
    const sigma = isAngular
      ? angleRadians(observation.sigma ?? 2, observation.sigmaUnit ?? 'arcsec')
      : normalizeLengthUncertainty(observation.sigma ?? 0.002, observation.sigmaUnit ?? observation.unit)
    return [{ coefficients: numericalJacobian((candidate) => model(observation, candidate) ?? computed, parameters, { angular: isAngular }), misclosure: isAngular ? wrapRadians(observed - computed) : observed - computed, weight: 1 / Math.max(1e-18, sigma * sigma) }]
  })
  const solved = iterativeWeightedLeastSquares(initialParameters, buildEquations, { maxIterations: 12, convergence: 1e-7 })
  if (!solved) return invalidAdjustmentResult(network, run, [finding(network.id, 'rank_deficient', 'blocking', '导线法方程秩亏，边长与方向/角度不足以确定全部坐标', '增加独立方向、角度或边长观测并检查固定端点', undefined, nowIso)], nowIso)

  const adjustedCoordinates = coordinates(solved.parameters)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const adjusted = adjustedCoordinates.get(point.id)
    const index = unknownIds.indexOf(point.id)
    if (!adjusted || index < 0) return { id: point.id, x: point.x, y: point.y }
    const qx = solved.covariance[index * 2]?.[index * 2] ?? 0; const qy = solved.covariance[index * 2 + 1]?.[index * 2 + 1] ?? 0
    return { id: point.id, x: adjusted.x, y: adjusted.y, correctionX: adjusted.x - (point.x ?? 0), correctionY: adjusted.y - (point.y ?? 0), standardError: Math.sqrt(Math.max(0, (qx + qy) * solved.varianceFactor)), covariance: [...(solved.covariance[index * 2] ?? []), ...(solved.covariance[index * 2 + 1] ?? [])] }
  })
  const equations = buildEquations(solved.parameters)
  const observationResults = usedObservations.map((observation, index) => {
    const residual = -(equations[index]?.misclosure ?? 0)
    const sigma = Math.sqrt(1 / (equations[index]?.weight ?? 1))
    const standardizedResidual = Math.abs(residual) / Math.max(1e-12, sigma)
    return { observationId: observation.id, correction: residual, residual, unit: normalizedResidualUnit(observation), standardizedResidual, outlier: standardizedResidual > 3, sourceRow: observation.sourceRow }
  })
  const azimuths = traverseAzimuths(network, distances, angular)!
  let sumX = 0; let sumY = 0; let totalLength = 0
  distances.forEach((observation, index) => { const length = normalizeObservationValue(observation); sumX += length * Math.sin(azimuths[index]!); sumY += length * Math.cos(azimuths[index]!); totalLength += Math.abs(length) })
  const targetDeltaX = end!.x! - start!.x!
  const targetDeltaY = end!.y! - start!.y!
  const fx = sumX - targetDeltaX; const fy = sumY - targetDeltaY
  const relativeClosure = totalLength > 0 ? Math.hypot(fx, fy) / totalLength : 0
  const endAzimuth = network.instrumentParameters.endAzimuthRad ?? (network.instrumentParameters.endAzimuthDeg === undefined ? undefined : network.instrumentParameters.endAzimuthDeg * Math.PI / 180)
  const angularClosure = endAzimuth === undefined ? undefined : wrapRadians(azimuths[azimuths.length - 1]! - endAzimuth)
  const closure = { fx, fy, relativeClosure, ...(angularClosure === undefined ? {} : { angular: angularClosure }) }
  const closureUnits = { fx: 'm' as const, fy: 'm' as const, relativeClosure: 'ratio' as const, ...(angularClosure === undefined ? {} : { angular: 'rad' as const }) }
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `导线观测 ${item.observationId} 的标准化残差超过 3σ`, '复核原始角度、边长、对中和定向', item.sourceRow, nowIso))
  const convergenceFindings = solved.converged ? [] : [finding(network.id, 'not_converged', 'blocking', `导线平差在 ${solved.iterations} 次迭代后未收敛`, '检查近似坐标、粗差和网形后重试', undefined, nowIso)]
  const reliabilityFindings = solved.varianceFactorEstimated ? [] : [finding(network.id, 'insufficient_redundancy', 'warning', '导线没有多余观测，精度仅能按先验权评定', '增加独立复测边或方向观测', undefined, nowIso)]
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: usedObservations.length, unknownCount: unknownIds.length * 2, redundancy: solved.dof, degreesOfFreedom: solved.dof, linearUnit: 'm', angularUnit: 'rad', closure, closureUnits, unitWeightStdDev: solved.unitWeightStdDev, varianceFactor: solved.varianceFactor, varianceFactorEstimated: solved.varianceFactorEstimated, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, ...(relativeClosure > 0 ? { relativePrecision: 1 / relativeClosure } : {}), passed: outlierFindings.length === 0 && convergenceFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings, ...convergenceFindings, ...reliabilityFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length || convergenceFindings.length ? 'invalid' : 'valid', solverDiagnostics: { iterations: solved.iterations, rank: solved.rank, conditionEstimate: solved.conditionEstimate }, createdAt: nowIso() })
}

function buildTriangulationResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const baseFindings = mergeFindings(network.findings.filter((item) => item.status === 'open'), triangulationStrategyFindings(network, nowIso))
  if (baseFindings.some((item) => item.severity === 'blocking')) return invalidAdjustmentResult(network, run, baseFindings, nowIso)
  const points = pointMap(network)
  const observations = network.observations.filter((item) => ['angle', 'direction', 'distance'].includes(item.type))
  const unknownIds = network.unknownPoints.filter((point) => !point.known).map((point) => point.id)
  const initialParameters = unknownIds.flatMap((id) => [points.get(id)!.x!, points.get(id)!.y!])
  const coordinates = (parameters: readonly number[]): Map<string, { x: number; y: number }> => new Map([...points].map(([id, point]) => {
    const index = unknownIds.indexOf(id)
    return [id, index < 0 ? { x: point.x!, y: point.y! } : { x: parameters[index * 2]!, y: parameters[index * 2 + 1]! }]
  }))
  const bearing = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.x - from.x, to.y - from.y)
  const model = (observation: SurveyObservationV1, parameters: readonly number[]): number | null => {
    const map = coordinates(parameters)
    if (observation.type === 'angle') {
      const station = observation.station ? map.get(observation.station) : undefined
      const left = observation.left ? map.get(observation.left) : undefined
      const right = observation.right ? map.get(observation.right) : undefined
      if (!station || !left || !right) return null
      const result = bearing(station, right) - bearing(station, left)
      return result < 0 ? result + 2 * Math.PI : result
    }
    const from = map.get((observation.from ?? observation.station)!)
    const to = map.get((observation.to ?? observation.target)!)
    if (!from || !to) return null
    return observation.type === 'direction' ? bearing(from, to) : Math.hypot(to.x - from.x, to.y - from.y)
  }
  const buildEquations = (parameters: readonly number[]) => observations.flatMap((observation) => {
    const computed = model(observation, parameters)
    if (computed === null) return []
    const angular = observation.type === 'angle' || observation.type === 'direction'
    const observed = angular ? angleRadians(observation.value, observation.unit) : normalizeObservationValue(observation)
    const sigma = angular
      ? angleRadians(observation.sigma ?? 2, observation.sigmaUnit ?? 'arcsec')
      : normalizeLengthUncertainty(observation.sigma ?? 0.002, observation.sigmaUnit ?? observation.unit)
    return [{ coefficients: numericalJacobian((candidate) => model(observation, candidate) ?? computed, parameters, { angular }), misclosure: angular ? wrapRadians(observed - computed) : observed - computed, weight: 1 / Math.max(1e-18, sigma * sigma) }]
  })
  const solved = iterativeWeightedLeastSquares(initialParameters, buildEquations, { maxIterations: 15, convergence: 1e-7 })
  if (!solved) return invalidAdjustmentResult(network, run, mergeFindings(baseFindings, [finding(network.id, 'rank_deficient', 'blocking', '三角网角度方程秩亏或交会几何不足', '增加独立测站角并检查已知基线、点号和近似坐标', undefined, nowIso)]), nowIso)
  const adjusted = coordinates(solved.parameters)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const coordinate = adjusted.get(point.id)!
    const index = unknownIds.indexOf(point.id)
    if (index < 0) return { id: point.id, x: coordinate.x, y: coordinate.y }
    const qx = solved.covariance[index * 2]?.[index * 2] ?? 0
    const qy = solved.covariance[index * 2 + 1]?.[index * 2 + 1] ?? 0
    return { id: point.id, x: coordinate.x, y: coordinate.y, correctionX: coordinate.x - point.x!, correctionY: coordinate.y - point.y!, standardError: Math.sqrt(Math.max(0, (qx + qy) * solved.varianceFactor)), covariance: [...(solved.covariance[index * 2] ?? []), ...(solved.covariance[index * 2 + 1] ?? [])] }
  })
  const equations = buildEquations(solved.parameters)
  const observationResults = observations.map((observation, index) => {
    const residual = -(equations[index]?.misclosure ?? 0)
    const sigma = Math.sqrt(1 / (equations[index]?.weight ?? 1))
    const standardizedResidual = Math.abs(residual) / Math.max(1e-12, sigma)
    return { observationId: observation.id, correction: residual, residual, unit: normalizedResidualUnit(observation), standardizedResidual, outlier: standardizedResidual > 3, sourceRow: observation.sourceRow }
  })
  const linearResiduals = observationResults.filter((item) => item.unit === 'm')
  const angularResiduals = observationResults.filter((item) => item.unit === 'rad')
  const closure = {
    ...(linearResiduals.length ? { horizontal: Math.sqrt(linearResiduals.reduce((sum, item) => sum + item.residual ** 2, 0)) } : {}),
    ...(angularResiduals.length ? { angular: Math.sqrt(angularResiduals.reduce((sum, item) => sum + item.residual ** 2, 0)) } : {})
  }
  const closureUnits = { ...(linearResiduals.length ? { horizontal: 'm' as const } : {}), ...(angularResiduals.length ? { angular: 'rad' as const } : {}) }
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `三角网观测 ${item.observationId} 的标准化残差超过 3σ`, '复核测回、归零差和观测点号', item.sourceRow, nowIso))
  const convergenceFindings = solved.converged ? [] : [finding(network.id, 'not_converged', 'blocking', `三角网在 ${solved.iterations} 次迭代后未收敛`, '检查近似坐标、病态交会和粗差后重试', undefined, nowIso)]
  const reliabilityFindings = solved.varianceFactorEstimated ? [] : [finding(network.id, 'insufficient_redundancy', 'warning', '三角网没有多余观测，不能进行后验精度检验', '增加独立测站角或复测测回', undefined, nowIso)]
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: observations.length, unknownCount: unknownIds.length * 2, redundancy: solved.dof, degreesOfFreedom: solved.dof, linearUnit: 'm', angularUnit: 'rad', closure, closureUnits, unitWeightStdDev: solved.unitWeightStdDev, varianceFactor: solved.varianceFactor, varianceFactorEstimated: solved.varianceFactorEstimated, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 && convergenceFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings, ...convergenceFindings, ...reliabilityFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length || convergenceFindings.length ? 'invalid' : 'valid', solverDiagnostics: { iterations: solved.iterations, rank: solved.rank, conditionEstimate: solved.conditionEstimate }, createdAt: nowIso() })
}

function buildCpiiiResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const baseFindings = mergeFindings(network.findings.filter((item) => item.status === 'open'), cpiiiStrategyFindings(network, nowIso))
  if (baseFindings.some((item) => item.severity === 'blocking')) return invalidAdjustmentResult(network, run, baseFindings, nowIso)
  const points = pointMap(network)
  const stations = network.unknownPoints.filter((point) => !point.known && point.pointClass === 'station')
  const observations = network.observations.filter((item) => ['distance', 'slope-distance', 'direction', 'zenith'].includes(item.type))
  type StationIndex = { x: number; y: number; height?: number; orientation: number }
  const stationIndexes = new Map<string, StationIndex>()
  let parameterCount = 0
  for (const station of stations) {
    const hasVerticalEvidence = observations.some((item) => (item.station ?? item.from) === station.id && (item.type === 'slope-distance' || item.type === 'zenith'))
    const index: StationIndex = { x: parameterCount++, y: parameterCount++, ...(hasVerticalEvidence ? { height: parameterCount++ } : {}), orientation: parameterCount++ }
    stationIndexes.set(station.id, index)
  }
  const bearing = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.x - from.x, to.y - from.y)
  const initialParameters = Array.from({ length: parameterCount }, () => 0)
  for (const station of stations) {
    const index = stationIndexes.get(station.id)!
    initialParameters[index.x] = station.x!
    initialParameters[index.y] = station.y!
    if (index.height !== undefined) initialParameters[index.height] = station.height!
    const firstDirection = observations.find((item) => item.type === 'direction' && (item.station ?? item.from) === station.id)!
    const target = points.get((firstDirection.target ?? firstDirection.to)!)!
    initialParameters[index.orientation] = positiveRadians(bearing({ x: station.x!, y: station.y! }, { x: target.x!, y: target.y! }) - angleRadians(firstDirection.value, firstDirection.unit))
  }
  const stationState = (stationId: string, parameters: readonly number[]) => {
    const point = points.get(stationId)!
    const index = stationIndexes.get(stationId)!
    return { x: parameters[index.x]!, y: parameters[index.y]!, height: index.height === undefined ? point.height : parameters[index.height]!, orientation: parameters[index.orientation]! }
  }
  const model = (observation: SurveyObservationV1, parameters: readonly number[]): number | null => {
    const stationId = observation.station ?? observation.from
    const targetId = observation.target ?? observation.to
    if (!stationId || !targetId) return null
    const station = stationState(stationId, parameters)
    const target = points.get(targetId)
    if (!target || target.x === undefined || target.y === undefined) return null
    const dx = target.x - station.x
    const dy = target.y - station.y
    const horizontal = Math.hypot(dx, dy)
    if (observation.type === 'direction') return positiveRadians(bearing(station, { x: target.x, y: target.y }) - station.orientation)
    if (observation.type === 'distance') return horizontal
    const instrumentHeight = (station.height ?? 0) + (observation.stationHeightOffset ?? 0)
    const targetHeight = (target.height ?? 0) + (observation.targetHeightOffset ?? 0)
    const deltaHeight = targetHeight - instrumentHeight
    return observation.type === 'slope-distance' ? Math.hypot(horizontal, deltaHeight) : Math.atan2(horizontal, deltaHeight)
  }
  const buildEquations = (parameters: readonly number[]) => observations.flatMap((observation) => {
    const computed = model(observation, parameters)
    if (computed === null) return []
    const angular = observation.type === 'direction' || observation.type === 'zenith'
    const observed = angular ? angleRadians(observation.value, observation.unit) : normalizeObservationValue(observation)
    const sigma = angular
      ? angleRadians(observation.sigma ?? 2, observation.sigmaUnit ?? 'arcsec')
      : normalizeLengthUncertainty(observation.sigma ?? 0.002, observation.sigmaUnit ?? observation.unit)
    return [{ coefficients: numericalJacobian((candidate) => model(observation, candidate) ?? computed, parameters, { angular }), misclosure: angular ? wrapRadians(observed - computed) : observed - computed, weight: 1 / Math.max(1e-18, sigma * sigma) }]
  })
  const solved = iterativeWeightedLeastSquares(initialParameters, buildEquations, { maxIterations: 20, convergence: 1e-7 })
  if (!solved) return invalidAdjustmentResult(network, run, mergeFindings(baseFindings, [finding(network.id, 'rank_deficient', 'blocking', 'CPIII 自由测站法方程秩亏或目标几何不足', '增加分布合理的固定目标方向/距离，检查测站近似坐标', undefined, nowIso)]), nowIso)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const index = stationIndexes.get(point.id)
    if (!index) return { id: point.id, x: point.x, y: point.y, height: point.height }
    const state = stationState(point.id, solved.parameters)
    const qx = solved.covariance[index.x]?.[index.x] ?? 0
    const qy = solved.covariance[index.y]?.[index.y] ?? 0
    const covarianceRows = [index.x, index.y, ...(index.height === undefined ? [] : [index.height])].flatMap((row) => solved.covariance[row] ?? [])
    return { id: point.id, x: state.x, y: state.y, ...(index.height === undefined ? {} : { height: state.height, correctionHeight: state.height! - point.height! }), correctionX: state.x - point.x!, correctionY: state.y - point.y!, standardError: Math.sqrt(Math.max(0, (qx + qy) * solved.varianceFactor)), covariance: covarianceRows }
  })
  const equations = buildEquations(solved.parameters)
  const observationResults = observations.map((observation, index) => {
    const residual = -(equations[index]?.misclosure ?? 0)
    const sigma = Math.sqrt(1 / (equations[index]?.weight ?? 1))
    const standardizedResidual = Math.abs(residual) / Math.max(1e-12, sigma)
    return { observationId: observation.id, correction: residual, residual, unit: normalizedResidualUnit(observation), standardizedResidual, outlier: standardizedResidual > 3, sourceRow: observation.sourceRow }
  })
  const linearResiduals = observationResults.filter((item) => item.unit === 'm')
  const angularResiduals = observationResults.filter((item) => item.unit === 'rad')
  const closure = {
    ...(linearResiduals.length ? { horizontal: Math.sqrt(linearResiduals.reduce((sum, item) => sum + item.residual ** 2, 0)) } : {}),
    ...(angularResiduals.length ? { angular: Math.sqrt(angularResiduals.reduce((sum, item) => sum + item.residual ** 2, 0)) } : {})
  }
  const closureUnits = { ...(linearResiduals.length ? { horizontal: 'm' as const } : {}), ...(angularResiduals.length ? { angular: 'rad' as const } : {}) }
  const parameters = Object.fromEntries(stations.map((station) => [`orientation:${station.id}`, positiveRadians(solved.parameters[stationIndexes.get(station.id)!.orientation]!)]))
  const parameterUnits = Object.fromEntries(stations.map((station) => [`orientation:${station.id}`, 'rad' as const]))
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `CPIII 观测 ${item.observationId} 的标准化残差超过 3σ`, '复核目标识别、对中、棱镜高和测回', item.sourceRow, nowIso))
  const convergenceFindings = solved.converged ? [] : [finding(network.id, 'not_converged', 'blocking', `CPIII 自由测站在 ${solved.iterations} 次迭代后未收敛`, '检查近似坐标、目标分布和粗差后重试', undefined, nowIso)]
  const reliabilityFindings = solved.varianceFactorEstimated ? [] : [finding(network.id, 'insufficient_redundancy', 'warning', 'CPIII 自由测站没有多余观测，不能进行后验精度检验', '增加固定目标或独立测回', undefined, nowIso)]
  const maxStd = pointResults.reduce((max, point) => Math.max(max, 'standardError' in point ? point.standardError ?? 0 : 0), 0)
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: observations.length, unknownCount: parameterCount, redundancy: solved.dof, degreesOfFreedom: solved.dof, linearUnit: 'm', angularUnit: 'rad', closure, closureUnits, parameters, parameterUnits, unitWeightStdDev: solved.unitWeightStdDev, varianceFactor: solved.varianceFactor, varianceFactorEstimated: solved.varianceFactorEstimated, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 && convergenceFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings, ...convergenceFindings, ...reliabilityFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length || convergenceFindings.length ? 'invalid' : 'valid', solverDiagnostics: { iterations: solved.iterations, rank: solved.rank, conditionEstimate: solved.conditionEstimate }, createdAt: nowIso() })
}

function invalidAdjustmentResult(network: SurveyNetworkV1, run: AdjustmentRunV1, findings: SurveyQualityFindingV1[], nowIso: () => string): AdjustmentResultV1 {
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: network.observations.length, unknownCount: network.unknownPoints.length, redundancy: 0, degreesOfFreedom: 0, closure: {}, unitWeightStdDev: 0, varianceFactor: 0, varianceFactorEstimated: false, points: [], observations: [], displacements: [], qualityFindings: findings, inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, precision: { maxPointStdDev: 0, passed: false }, validation: 'invalid', createdAt: nowIso() })
}

function adjustmentDimensionIssue(network: SurveyNetworkV1): string | null {
  const coordinateTypes = ['plane-control', 'traverse', 'triangulation', 'cpiii-free-station', 'cpiii-resection', 'gnss']
  const parameterCount = coordinateTypes.includes(network.networkType) ? network.unknownPoints.filter((point) => !point.known).length * 2 : network.unknownPoints.filter((point) => !point.known).length
  if (parameterCount > MAX_UNKNOWN_PARAMETERS) return `未知参数数量 ${parameterCount} 超过上限 ${MAX_UNKNOWN_PARAMETERS}`
  if (network.observations.length > MAX_OBSERVATIONS) return `观测记录数量 ${network.observations.length} 超过上限 ${MAX_OBSERVATIONS}`
  // Bound the dense normal matrix before coefficient arrays are allocated.
  const estimatedNonZero = Math.min(Number.MAX_SAFE_INTEGER, network.observations.length * Math.max(1, parameterCount))
  if (estimatedNonZero > MAX_MATRIX_NON_ZERO) return `预计矩阵非零元素 ${estimatedNonZero} 超过上限 ${MAX_MATRIX_NON_ZERO}`
  return null
}

function buildCoordinateTransformResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const p = network.instrumentParameters
  const hasExplicitParameter = ['tx', 'translationX', 'ty', 'translationY', 'tz', 'translationZ', 'rxRad', 'rxDeg', 'rx', 'ryRad', 'ryDeg', 'ry', 'rzRad', 'rzDeg', 'rz', 'rotationDeg', 'rotation', 'scalePpm'].some((key) => typeof p[key] === 'number' && Number.isFinite(p[key]))
  let tx = p.tx ?? p.translationX
  let ty = p.ty ?? p.translationY
  let tz = p.tz ?? p.translationZ
  let rx = p.rxRad ?? ((p.rxDeg ?? p.rx ?? 0) * Math.PI / 180)
  let ry = p.ryRad ?? ((p.ryDeg ?? p.ry ?? 0) * Math.PI / 180)
  let rz = p.rzRad ?? ((p.rzDeg ?? p.rz ?? p.rotationDeg ?? p.rotation ?? 0) * Math.PI / 180)
  let scale = 1 + (p.scalePpm ?? 0) * 1e-6

  // If explicit parameters are absent, fit a 2-D similarity transform from
  // paired source/target coordinates carried by observations.  This is a
  // deterministic four-parameter least-squares fit; it never falls back to
  // an identity transform when the control pairs are insufficient.
  if (!hasExplicitParameter) {
    const fitRows: Array<{ coefficients: number[]; misclosure: number; weight: number }> = []
    const points = pointMap(network)
    for (const observation of network.observations) {
      const source = observation.from ? points.get(observation.from) : undefined
      if (!source || source.x === undefined || source.y === undefined || observation.targetX === undefined || observation.targetY === undefined) continue
      const sigma = observation.sigma ?? 1
      fitRows.push({ coefficients: [1, 0, source.x, -source.y], misclosure: observation.targetX, weight: 1 / (sigma * sigma) })
      fitRows.push({ coefficients: [0, 1, source.y, source.x], misclosure: observation.targetY, weight: 1 / (sigma * sigma) })
    }
    const fitted = fitRows.length >= 4 ? weightedLeastSquares(fitRows) : null
    if (!fitted) return invalidAdjustmentResult(network, run, [finding(network.id, 'missing_datum', 'blocking', '坐标转换缺少明确参数或足够的源/目标控制点', '提供七参数，或至少两组非退化的源/目标坐标对', undefined, nowIso)], nowIso)
    tx = fitted.corrections[0]!
    ty = fitted.corrections[1]!
    const a = fitted.corrections[2]!
    const b = fitted.corrections[3]!
    scale = Math.hypot(a, b)
    rz = Math.atan2(b, a)
  }
  const resolvedTx = tx ?? 0; const resolvedTy = ty ?? 0
  const resolvedTz = tz ?? 0
  const points = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    if (point.x === undefined || point.y === undefined) return { id: point.id }
    // Small-angle Helmert linearisation. If no vertical/tilt parameters are
    // supplied this reduces to the legacy 2D transform exactly.
    const z = point.height ?? 0
    const x = scale * (point.x - rz * point.y + ry * z) + resolvedTx
    const y = scale * (rz * point.x + point.y - rx * z) + resolvedTy
    const height = scale * (-ry * point.x + rx * point.y + z) + resolvedTz
    return { id: point.id, x, y, ...(point.height === undefined && resolvedTz === 0 && rx === 0 && ry === 0 ? {} : { height }), correctionX: x - point.x, correctionY: y - point.y, ...(point.height === undefined && resolvedTz === 0 && rx === 0 && ry === 0 ? {} : { correctionHeight: height - z }), standardError: 0 }
  })
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const adjusted = points.find((candidate) => candidate.id === point.id) as { x?: number; y?: number; height?: number } | undefined
    return displacement(point, adjusted ?? {})
  })
  const observations = network.observations.map((observation) => ({ observationId: observation.id, correction: 0, residual: 0, unit: normalizedResidualUnit(observation), standardizedResidual: 0, outlier: false, sourceRow: observation.sourceRow }))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: network.observations.length, unknownCount: network.unknownPoints.length * 2, redundancy: 0, degreesOfFreedom: 0, linearUnit: 'm', angularUnit: 'rad', closure: { translationX: resolvedTx, translationY: resolvedTy, scalePpm: (scale - 1) * 1e6, rotationRad: rz }, closureUnits: { translationX: 'm', translationY: 'm', scalePpm: 'ppm', rotationRad: 'rad' }, unitWeightStdDev: 0, varianceFactor: 0, varianceFactorEstimated: false, points, observations, displacements, precision: { maxPointStdDev: 0, passed: true }, qualityFindings: network.findings.filter((item) => item.status === 'open'), inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: 'valid', solverDiagnostics: { iterations: hasExplicitParameter ? 0 : 1, rank: hasExplicitParameter ? undefined : 4 }, createdAt: nowIso() })
}

export class SurveyRevisionConflictError extends Error { readonly code = 'survey_stale_request' }

export class SurveyService {
  private readonly db: Database.Database
  private readonly nowIso: () => string
  constructor(private readonly options: { rootDir: string; getProject?: SurveyProjectLookup; nowIso?: () => string }) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    mkdirSync(resolve(options.rootDir), { recursive: true })
    this.db = new Database(resolve(options.rootDir, 'survey.sqlite3'))
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS survey_projects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS survey_networks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS survey_adjustments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, network_id TEXT NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS survey_idempotency (key TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at TEXT NOT NULL);`)
  }
  close(): void { this.db.close() }

  createProject(input: unknown): SurveyProjectV1 {
    const parsed = SurveyProjectV1.parse({ ...input as Record<string, unknown>, schemaVersion: 1, id: (input as { id?: string }).id ?? `survey_project_${randomUUID()}`, revision: 1, createdAt: this.nowIso(), updatedAt: this.nowIso() })
    this.db.prepare('INSERT OR REPLACE INTO survey_projects(id, project_id, revision, data_json, updated_at) VALUES (?, ?, ?, ?, ?)').run(parsed.id, parsed.projectId, parsed.revision, JSON.stringify(parsed), parsed.updatedAt)
    return parsed
  }

  listNetworks(projectId?: string): SurveyNetworkV1[] {
    const rows = projectId ? this.db.prepare('SELECT data_json FROM survey_networks WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) : this.db.prepare('SELECT data_json FROM survey_networks ORDER BY updated_at DESC').all()
    return (rows as Array<{ data_json: string }>).map((row) => SurveyNetworkV1.parse(JSON.parse(row.data_json)))
  }
  getNetwork(id: string): SurveyNetworkV1 | null { const row = this.db.prepare('SELECT data_json FROM survey_networks WHERE id = ?').get(id) as { data_json: string } | undefined; return row ? SurveyNetworkV1.parse(JSON.parse(row.data_json)) : null }

  async importNetwork(input: unknown): Promise<SurveyNetworkV1> {
    const req = SurveyNetworkImportRequest.parse(input)
    const replay = this.replay(req.idempotencyKey); if (replay) return SurveyNetworkV1.parse(replay)
    const project = this.options.getProject?.(req.projectId)
    if (project && req.expectedRevision !== 0 && req.expectedRevision !== project.revision) throw new SurveyRevisionConflictError(`project revision conflict: expected ${req.expectedRevision}, actual ${project.revision}`)
    let network: SurveyNetworkV1
    if (req.network) {
      const { heightDatum: legacyHeightDatum, ...networkWithoutLegacyDatum } = req.network as SurveyNetworkV1 & { heightDatum?: string }
      const requestedVerticalDatum = req.network.verticalDatum && req.network.verticalDatum !== '待确认' ? req.network.verticalDatum : legacyHeightDatum
      network = SurveyNetworkV1.parse({ ...networkWithoutLegacyDatum, schemaVersion: 1, id: req.network.id ?? `network_${randomUUID()}`, projectId: req.projectId, networkType: req.network.networkType ?? req.networkType ?? 'leveling', coordinateSystem: req.network.coordinateSystem ?? '待确认', projection: req.network.projection ?? '待确认', ellipsoid: req.network.ellipsoid ?? '待确认', verticalDatum: requestedVerticalDatum ?? '待确认', unit: req.network.unit ?? 'm', knownPoints: req.network.knownPoints ?? [], unknownPoints: req.network.unknownPoints ?? [], observations: req.network.observations ?? [], instrumentParameters: req.network.instrumentParameters ?? {}, qualityStatus: 'imported', findings: [], revision: 1, createdAt: this.nowIso(), updatedAt: this.nowIso(), inputAttachmentHash: req.inputAttachmentHash ?? req.network.inputAttachmentHash })
    }
    else network = await parseNetworkPayload(req.name ?? 'survey.json', Buffer.from(req.dataBase64!, 'base64'), req.projectId, this.nowIso, req.networkType, req.inputAttachmentHash)
    if (network.knownPoints.length + network.unknownPoints.length > MAX_POINTS || network.observations.length > MAX_OBSERVATIONS) throw new Error(`survey network exceeds limits (${MAX_POINTS} points, ${MAX_OBSERVATIONS} observations)`)
    const parsed = SurveyNetworkV1.parse(network)
    this.db.prepare('INSERT INTO survey_networks(id, project_id, revision, data_json, updated_at) VALUES (?, ?, ?, ?, ?)').run(parsed.id, parsed.projectId, parsed.revision, JSON.stringify(parsed), parsed.updatedAt)
    await this.persist(parsed, 'networks')
    this.remember(req.idempotencyKey, parsed)
    return parsed
  }

  validateNetwork(networkId: string, input: unknown): SurveyNetworkV1 {
    const req = SurveyNetworkValidateRequest.parse(input); const network = this.getNetwork(networkId); if (!network) throw new Error(`survey network not found: ${networkId}`)
    if (req.expectedRevision !== 0 && req.expectedRevision !== network.revision) throw new SurveyRevisionConflictError(`network revision conflict: expected ${req.expectedRevision}, actual ${network.revision}`)
    const points = pointMap(network); const findings: SurveyQualityFindingV1[] = []
    for (const observation of network.observations) {
      for (const id of observationEndpointIds(observation)) if (!points.has(id)) findings.push(finding(network.id, 'missing_point', 'blocking', `观测 ${observation.id} 引用了不存在的点 ${id}`, '补充点坐标/高程或修正点号', observation.sourceRow, this.nowIso))
      if (observation.covariance && observation.covariance.some((value) => !Number.isFinite(value))) findings.push(finding(network.id, 'invalid_observation', 'blocking', `观测 ${observation.id} 协方差包含非法数值`, '修正协方差后重新导入', observation.sourceRow, this.nowIso))
      const angular = ['direction', 'angle', 'zenith'].includes(observation.type)
      const unit = observation.unit.trim().toLowerCase()
      const validUnit = angular
        ? ['deg', 'degree', 'degrees', '°', 'gon', 'grad', 'rad', 'radian', 'arcsec', '″'].includes(unit)
        : ['m', 'meter', 'meters', 'km', 'mm', 'cm'].includes(unit)
      if (!validUnit) findings.push(finding(network.id, 'unit_conflict', 'warning', `观测 ${observation.id} 的单位 ${observation.unit} 不在受支持的单位集合中`, angular ? '使用 deg、gon、rad 或 arcsec' : '使用 m、km、cm 或 mm', observation.sourceRow, this.nowIso))
      if (!angular && network.unit && unit !== network.unit.trim().toLowerCase() && !(network.unit === 'm' && ['meter', 'meters'].includes(unit))) {
        findings.push(finding(network.id, 'unit_conflict', 'warning', `观测 ${observation.id} 的单位 ${observation.unit} 与网络单位 ${network.unit} 不一致`, '确认单位并在导入前统一，换算不会静默丢失', observation.sourceRow, this.nowIso))
      }
      if (['plane-control', 'traverse', 'triangulation', 'cpiii-free-station', 'cpiii-resection', 'coordinate-transform'].includes(network.networkType)) {
        for (const id of observationEndpointIds(observation)) {
          const point = points.get(id)
          if (point && (point.x === undefined || point.y === undefined)) findings.push(finding(network.id, 'missing_point', 'blocking', `平面观测 ${observation.id} 的点 ${id} 缺少平面坐标`, '补充 X/Y 初始坐标后重新导入', observation.sourceRow, this.nowIso))
        }
      }
    }
    if (!network.observations.length) findings.push(finding(network.id, 'invalid_observation', 'blocking', '网络没有观测记录', '导入至少一条有效观测'))
    if (network.networkType === 'leveling' || network.networkType === 'height-control') findings.push(...levelingStrategyFindings(network, this.nowIso))
    if (network.networkType === 'traverse') findings.push(...traverseStrategyFindings(network, this.nowIso))
    if (network.networkType === 'plane-control') findings.push(...planeControlStrategyFindings(network, this.nowIso))
    if (network.networkType === 'triangulation') findings.push(...triangulationStrategyFindings(network, this.nowIso))
    if (network.networkType === 'cpiii-free-station' || network.networkType === 'cpiii-resection') findings.push(...cpiiiStrategyFindings(network, this.nowIso))
    if (network.networkType === 'gnss' && network.observations.some((item) => item.type === 'gnss-baseline' && (!item.covariance || item.covariance.length === 0))) findings.push(finding(network.id, 'missing_covariance', 'blocking', 'GNSS 基线缺少标准协方差', '补充基线协方差，不能用模型猜测'))
    if (network.networkType === 'gnss' && !network.knownPoints.some((point) => point.known)) findings.push(finding(network.id, 'missing_datum', 'blocking', 'GNSS 网络缺少固定基准点', '指定至少一个固定基准点后再平差'))
    if (network.knownPoints.length === 0 && network.unknownPoints.length > 0) findings.push(finding(network.id, 'missing_datum', 'blocking', '网络没有已知约束点', '提供已知点或明确自由网约束'))
    const adjacency = new Map<string, Set<string>>(); for (const id of points.keys()) adjacency.set(id, new Set())
    for (const observation of network.observations) { const ids = observationEndpointIds(observation); for (const a of ids) for (const b of ids) if (a !== b) adjacency.get(a)?.add(b) }
    const roots = [...network.knownPoints].map((point) => point.id); const seen = new Set<string>(roots); const queue = [...roots]
    while (queue.length) for (const next of adjacency.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
    if (network.unknownPoints.some((point) => !seen.has(point.id))) findings.push(finding(network.id, 'disconnected_network', 'blocking', '存在与已知点不连通的网段', '检查点号、观测方向和缺失边'))
    const tolerance = network.instrumentParameters.closureTolerance
    if (typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance >= 0) {
      if (network.networkType === 'leveling' || network.networkType === 'height-control') {
        const closure = levelingRouteClosure(network, network.observations.filter((item) => item.type === 'height-difference'), points)
        if (closure !== undefined && Math.abs(closure) > tolerance) findings.push(finding(network.id, 'closure_exceeded', 'blocking', `水准闭合差 ${closure} 超过限差 ${tolerance}`, '复核附合/闭合路线观测、单位和权值', undefined, this.nowIso))
      }
    }
    const uniqueFindings = mergeFindings(findings)
    const next = SurveyNetworkV1.parse({ ...network, findings: uniqueFindings, qualityStatus: uniqueFindings.some((item) => item.severity === 'blocking') ? 'blocked' : 'validated', revision: network.revision + 1, updatedAt: this.nowIso() })
    this.saveNetwork(next); this.remember(req.idempotencyKey, next); return next
  }

  createAdjustment(input: unknown): { run: AdjustmentRunV1; result: AdjustmentResultV1 } {
    const req = AdjustmentRequestV1.parse(input); const network = this.getNetwork(req.networkId); if (!network) throw new Error(`survey network not found: ${req.networkId}`)
    if (req.expectedRevision !== 0 && req.expectedRevision !== network.revision) throw new SurveyRevisionConflictError(`network revision conflict: expected ${req.expectedRevision}, actual ${network.revision}`)
    const replay = this.replay(req.idempotencyKey)
    if (replay) {
      const restored = this.normalizeStoredAdjustment(replay)
      if (!restored.result) throw new Error('stored adjustment replay is missing its deterministic result')
      return { run: restored.run, result: restored.result }
    }
    const project = this.options.getProject?.(network.projectId)
    const inputHash = createHash('sha256').update(JSON.stringify(network)).digest('hex')
    const run = AdjustmentRunV1.parse({ schemaVersion: 1, id: `adjustment_${randomUUID()}`, projectId: network.projectId, networkId: network.id, method: req.method ?? (network.networkType === 'coordinate-transform' ? 'helmert-seven-parameter' : 'weighted-least-squares'), constraint: req.constraint ?? 'fixed-known-points', algorithmVersion: ALGORITHM_VERSION, inputHash, status: 'running', revision: 1, idempotencyKey: req.idempotencyKey, createdAt: this.nowIso(), updatedAt: this.nowIso() })
    let result: AdjustmentResultV1
    try {
      const dimensionIssue = adjustmentDimensionIssue(network)
      if (dimensionIssue) result = invalidAdjustmentResult(network, run, [finding(network.id, 'dimension_limit', 'blocking', dimensionIssue, '减少输入规模或拆分网络后重试', undefined, this.nowIso)], this.nowIso)
      else if (network.networkType === 'gnss') result = buildGnssResult(network, run, this.nowIso)
      else if (network.networkType === 'coordinate-transform') result = buildCoordinateTransformResult(network, run, this.nowIso)
      else if (network.networkType === 'leveling' || network.networkType === 'height-control') result = buildLevelingResult(network, run, this.nowIso)
      else if (network.networkType === 'plane-control') result = buildPlaneControlResult(network, run, this.nowIso)
      else if (network.networkType === 'traverse') result = buildTraverseResult(network, run, this.nowIso)
      else if (network.networkType === 'triangulation') result = buildTriangulationResult(network, run, this.nowIso)
      else if (network.networkType === 'cpiii-free-station' || network.networkType === 'cpiii-resection') result = buildCpiiiResult(network, run, this.nowIso)
      else result = invalidAdjustmentResult(network, run, [finding(network.id, 'invalid_observation', 'blocking', `暂不支持网型 ${network.networkType} 的确定性平差`, '选择受支持的测量网型或补充适配策略', undefined, this.nowIso)], this.nowIso)
      result = AdjustmentResultV1.parse({ ...result, strategyId: network.networkType })
      const completedRun = AdjustmentRunV1.parse({ ...run, status: result.validation === 'invalid' ? 'needs_attention' : 'completed', updatedAt: this.nowIso(), completedAt: this.nowIso() })
      const output = { run: completedRun, result }
      this.db.prepare('INSERT INTO survey_adjustments(id, project_id, network_id, data_json, updated_at) VALUES (?, ?, ?, ?, ?)').run(completedRun.id, completedRun.projectId, completedRun.networkId, JSON.stringify(output), completedRun.updatedAt)
      this.remember(req.idempotencyKey, output)
      void this.persist(output, 'adjustments', project?.workspace)
      return output
    } catch (error) {
      const failed = AdjustmentRunV1.parse({ ...run, status: 'failed', updatedAt: this.nowIso(), cancellationReason: error instanceof Error ? error.message : String(error) })
      const output = { run: failed, result: invalidAdjustmentResult(network, failed, [finding(network.id, 'invalid_observation', 'blocking', failed.cancellationReason ?? '平差失败', '修正输入后重试')], this.nowIso) }
      this.db.prepare('INSERT INTO survey_adjustments(id, project_id, network_id, data_json, updated_at) VALUES (?, ?, ?, ?, ?)').run(failed.id, failed.projectId, failed.networkId, JSON.stringify(output), failed.updatedAt)
      this.remember(req.idempotencyKey, output)
      return output
    }
  }

  getAdjustment(id: string): StoredAdjustment | null {
    const row = this.db.prepare('SELECT data_json FROM survey_adjustments WHERE id = ? OR json_extract(data_json, \'$.result.id\') = ?').get(id, id) as { data_json: string } | undefined
    return row ? this.normalizeStoredAdjustment(JSON.parse(row.data_json)) : null
  }
  cancelAdjustment(id: string, input: unknown): AdjustmentRunV1 { const req = AdjustmentMutationRequestV1.parse(input); const stored = this.getAdjustment(id); if (!stored) throw new Error(`adjustment not found: ${id}`); if (req.expectedRevision !== 0 && req.expectedRevision !== stored.run.revision) throw new SurveyRevisionConflictError('adjustment revision conflict'); if (stored.run.status === 'completed') return stored.run; const next = AdjustmentRunV1.parse({ ...stored.run, status: 'cancelled', revision: stored.run.revision + 1, updatedAt: this.nowIso(), cancellationReason: req.reason ?? 'cancelled by user' }); this.saveAdjustment({ ...stored, run: next }); return next }
  resumeAdjustment(id: string, input: unknown): StoredAdjustment { const req = AdjustmentMutationRequestV1.parse(input); const stored = this.getAdjustment(id); if (!stored) throw new Error(`adjustment not found: ${id}`); if (req.expectedRevision !== 0 && req.expectedRevision !== stored.run.revision) throw new SurveyRevisionConflictError('adjustment revision conflict'); if (!['cancelled', 'failed', 'needs_attention'].includes(stored.run.status)) return stored; const network = this.getNetwork(stored.run.networkId); if (!network) throw new Error(`survey network not found: ${stored.run.networkId}`); return this.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `${stored.run.id}-resume-${stored.run.resumeCount + 1}`, method: stored.run.method, constraint: stored.run.constraint }) }
  previewAdjustment(id: string): StoredAdjustment | null { return this.getAdjustment(id) }

  private saveNetwork(network: SurveyNetworkV1): void { this.db.prepare('UPDATE survey_networks SET revision = ?, data_json = ?, updated_at = ? WHERE id = ?').run(network.revision, JSON.stringify(network), network.updatedAt, network.id) }
  private normalizeStoredAdjustment(value: unknown): StoredAdjustment {
    const raw = value as { run?: unknown; result?: unknown }
    const run = AdjustmentRunV1.parse(raw.run)
    if (!raw.result) return { run }
    const network = this.getNetwork(run.networkId)
    const observationUnits = new Map(network?.observations.map((observation) => [observation.id, normalizedResidualUnit(observation)]) ?? [])
    const resultInput = raw.result as Record<string, unknown>
    const closure = resultInput.closure && typeof resultInput.closure === 'object' ? resultInput.closure as Record<string, number> : {}
    const observations = Array.isArray(resultInput.observations)
      ? resultInput.observations.map((item) => {
          const observation = item as Record<string, unknown>
          return observation.unit ? observation : { ...observation, unit: observationUnits.get(String(observation.observationId)) }
        })
      : []
    return { run, result: AdjustmentResultV1.parse({ ...resultInput, observations, closureUnits: resultInput.closureUnits ?? inferredClosureUnits(closure) }) }
  }
  private saveAdjustment(value: StoredAdjustment): void { this.db.prepare('UPDATE survey_adjustments SET data_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(value), value.run.updatedAt, value.run.id) }
  private replay(key: string): unknown | null { const row = this.db.prepare('SELECT result_json FROM survey_idempotency WHERE key = ?').get(key) as { result_json: string } | undefined; return row ? JSON.parse(row.result_json) : null }
  private remember(key: string, value: unknown): void { this.db.prepare('INSERT OR IGNORE INTO survey_idempotency(key, result_json, created_at) VALUES (?, ?, ?)').run(key, JSON.stringify(value), this.nowIso()) }
  private async persist(value: unknown, kind: string, workspace?: string): Promise<void> {
    if (!workspace) return
    const root = resolve(workspace); const directory = join(root, '.workwise', 'engineering', kind); await mkdir(directory, { recursive: true })
    const record = value as { id?: unknown; run?: { id?: unknown } } | null
    const id = typeof record?.id === 'string' ? record.id : typeof record?.run?.id === 'string' ? record.run.id : randomUUID()
    await atomicWriteFile(join(directory, `${id}.json`), JSON.stringify(value, null, 2))
  }
}
