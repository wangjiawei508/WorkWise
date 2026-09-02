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

type Matrix = number[][]
type SurveyProjectLookup = (id: string) => { id: string; workspace: string; revision: number } | null
type StoredAdjustment = { run: AdjustmentRunV1; result?: AdjustmentResultV1 }

const ALGORITHM_VERSION = 'workwise-survey-adjustment-1'
const MAX_POINTS = 10_000
const MAX_OBSERVATIONS = 100_000

const matrix = {
  transpose(a: Matrix): Matrix {
    if (!a.length) return []
    return a[0]!.map((_, column) => a.map((row) => row[column] ?? 0))
  },
  multiply(a: Matrix, b: Matrix): Matrix {
    if (!a.length || !b.length) return []
    return a.map((row) => b[0]!.map((_, col) => row.reduce((sum, value, index) => sum + value * (b[index]?.[col] ?? 0), 0)))
  },
  multiplyVector(a: Matrix, vector: number[]): number[] {
    return a.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0))
  },
  invert(source: Matrix): Matrix | null {
    const n = source.length
    if (!n || source.some((row) => row.length !== n)) return null
    const augmented = source.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])
    for (let column = 0; column < n; column += 1) {
      let pivot = column
      for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row
      if (Math.abs(augmented[pivot]![column]!) < 1e-12) return null
      ;[augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!]
      const scale = augmented[column]![column]!
      for (let j = 0; j < 2 * n; j += 1) augmented[column]![j]! /= scale
      for (let row = 0; row < n; row += 1) {
        if (row === column) continue
        const factor = augmented[row]![column]!
        if (Math.abs(factor) < 1e-18) continue
        for (let j = 0; j < 2 * n; j += 1) augmented[row]![j]! -= factor * augmented[column]![j]!
      }
    }
    return augmented.map((row) => row.slice(n))
  }
}

function weightedLeastSquares(rows: Array<{ coefficients: number[]; misclosure: number; weight: number }>): { corrections: number[]; residuals: number[]; covariance: Matrix; varianceFactor: number; dof: number } | null {
  if (!rows.length) return null
  const dimension = rows[0]!.coefficients.length
  if (!dimension) return null
  const a = rows.map((row) => row.coefficients)
  const at = matrix.transpose(a)
  const weightedA = a.map((row, index) => row.map((value) => value * rows[index]!.weight))
  const normal = matrix.multiply(at, weightedA)
  const rhs = matrix.multiplyVector(at, rows.map((row) => row.misclosure * row.weight))
  const covariance = matrix.invert(normal)
  if (!covariance) return null
  const corrections = matrix.multiplyVector(covariance, rhs)
  const residuals = matrix.multiplyVector(a, corrections).map((value, index) => value - rows[index]!.misclosure)
  const weightedSum = residuals.reduce((sum, value, index) => sum + value * value * rows[index]!.weight, 0)
  const dof = Math.max(0, rows.length - dimension)
  const varianceFactor = dof > 0 ? weightedSum / dof : 0
  return { corrections, residuals, covariance, varianceFactor, dof }
}

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
    return SurveyNetworkV1.parse({
      ...normalized,
      schemaVersion: 1,
      id: typeof normalized.id === 'string' ? normalized.id : `network_${randomUUID()}`,
      projectId,
      networkType: normalized.networkType ?? networkType ?? 'leveling',
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
    const value = asNumber(row.value || row.heightDiff || row.distance || row.angle || row.direction)
    if (value === undefined) throw new Error(`invalid observation value at row ${index + 2}`)
    return SurveyObservationV1.parse({ id: row.id || `obs_${index + 1}`, type, from: row.from || row.start || row.station, to: row.to || row.end || row.target, station: row.station, target: row.target, left: row.left, right: row.right, value, unit: row.unit || (type === 'height-difference' ? 'm' : type === 'distance' ? 'm' : 'deg'), sigma: asNumber(row.sigma), routeLength: asNumber(row.routeLength), sourceRow: index + 2, sourceLocator: row.worksheet ? `${row.worksheet}!${index + 2}` : undefined })
  })
  const ids = [...new Set(observations.flatMap(observationEndpointIds))]
  const points = ids.map((id) => SurveyPointV1.parse({ id, pointClass: 'unknown', known: false }))
  return SurveyNetworkV1.parse({ schemaVersion: 1, id: `network_${randomUUID()}`, projectId, networkType: networkType ?? 'leveling', knownPoints: [], unknownPoints: points, observations, inputAttachmentHash, qualityStatus: 'imported', findings: [], revision: 1, createdAt: nowIso(), updatedAt: nowIso() })
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
    if (observation.unit.toLowerCase() === 'mm') return observation.value / 1000
    if (observation.unit.toLowerCase() === 'km') return observation.value * 1000
  }
  return observation.value
}

function angleRadians(value: number, unit: string): number {
  const lower = unit.toLowerCase()
  if (lower.includes('rad')) return value
  if (lower.includes('gon')) return value * Math.PI / 200
  if (lower.includes('sec') || lower === '″') return value / 206264.806247
  return value * Math.PI / 180
}

function buildLevelingResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
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
    const weight = 1 / ((observation.sigma ?? observation.routeLength ?? 1) ** 2)
    rows.push({ coefficients, misclosure: normalizeObservationValue(observation) - (toApprox - fromApprox), weight, observation })
  }
  const solved = weightedLeastSquares(rows)
  const baseFindings = network.findings.filter((item) => item.status === 'open')
  if (!solved) return invalidAdjustmentResult(network, run, baseFindings.concat(finding(network.id, 'rank_deficient', 'blocking', '水准网法方程秩亏或网形不连通', '补充已知点或观测，检查点号和网形')), nowIso)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const i = index.get(point.id); const correction = i === undefined ? 0 : solved.corrections[i]!
    const q = i === undefined ? undefined : solved.covariance[i]?.[i]
    return { id: point.id, ...(point.height === undefined ? {} : { height: point.height }), ...(i === undefined ? {} : { correctionHeight: correction, height: (point.height ?? 0) + correction, standardError: Math.sqrt(Math.max(0, (q ?? 0) * solved.varianceFactor)), covariance: solved.covariance[i] }) }
  })
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  const observationResults = rows.map((row, i) => ({ observationId: row.observation.id, correction: solved.residuals[i]!, residual: solved.residuals[i]!, standardizedResidual: Math.abs(solved.residuals[i]!) / Math.max(1e-12, Math.sqrt(1 / row.weight)), outlier: Math.abs(solved.residuals[i]!) / Math.max(1e-12, Math.sqrt(1 / row.weight)) > 3, sourceRow: row.observation.sourceRow }))
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `观测 ${item.observationId} 的标准化残差超过 3σ`, '复核原始观测、仪器和录入值', item.sourceRow, nowIso))
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  const closureValue = rows.reduce((sum, row) => sum + normalizeObservationValue(row.observation), 0)
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: rows.length, unknownCount: unknownIds.length, redundancy: solved.dof, degreesOfFreedom: solved.dof, closure: { heightDifference: closureValue }, unitWeightStdDev: Math.sqrt(solved.varianceFactor), varianceFactor: solved.varianceFactor, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length ? 'invalid' : 'valid', createdAt: nowIso() })
}

function coordinateOf(point: SurveyPointV1): { x: number; y: number } { return { x: point.x ?? 0, y: point.y ?? 0 } }

function displacement(point: SurveyPointV1, adjusted: { x?: number; y?: number; height?: number }): AdjustmentDisplacementV1 {
  const dX = adjusted.x === undefined || point.x === undefined ? undefined : adjusted.x - point.x
  const dY = adjusted.y === undefined || point.y === undefined ? undefined : adjusted.y - point.y
  const dH = adjusted.height === undefined || point.height === undefined ? undefined : adjusted.height - point.height
  const magnitude = Math.sqrt((dX ?? 0) ** 2 + (dY ?? 0) ** 2 + (dH ?? 0) ** 2)
  const kind = dH !== undefined && (dX !== undefined || dY !== undefined) ? 'three-dimensional' : dH !== undefined ? 'vertical' : 'horizontal'
  return AdjustmentDisplacementV1.parse({ pointId: point.id, ...(dX === undefined ? {} : { dX }), ...(dY === undefined ? {} : { dY }), ...(dH === undefined ? {} : { dH }), magnitude, kind })
}

function buildPlaneResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const points = pointMap(network); const unknown = network.unknownPoints.filter((point) => !point.known)
  const unknownIds = unknown.map((point) => point.id); const index = new Map(unknownIds.flatMap((id, i) => [[`${id}:x`, i * 2], [`${id}:y`, i * 2 + 1]]))
  const values = new Map([...points].map(([id, point]) => [id, coordinateOf(point)]))
  const observations = network.observations.filter((item) => ['distance', 'direction', 'angle', 'zenith', 'slope-distance'].includes(item.type))
  const rows: Array<{ coefficients: number[]; misclosure: number; weight: number; observation: SurveyObservationV1 }> = []
  const modelValue = (observation: SurveyObservationV1, coords: Map<string, { x: number; y: number }>): number | null => {
    const fromId = observation.from ?? observation.station; const toId = observation.to ?? observation.target
    if (!fromId || !toId) return null
    const from = coords.get(fromId); const to = coords.get(toId); if (!from || !to) return null
    if (observation.type === 'distance' || observation.type === 'slope-distance') return Math.hypot(to.x - from.x, to.y - from.y)
    return Math.atan2(to.x - from.x, to.y - from.y)
  }
  for (const observation of observations) {
    const computed = modelValue(observation, values); if (computed === null) continue
    const coefficients = Array.from({ length: unknownIds.length * 2 }, () => 0)
    const fromId = observation.from ?? observation.station; const toId = observation.to ?? observation.target
    const from = values.get(fromId!); const to = values.get(toId!); if (!from || !to) continue
    const dx = to.x - from.x; const dy = to.y - from.y; const distance = Math.max(1e-9, Math.hypot(dx, dy))
    const derivativeX = observation.type === 'distance' || observation.type === 'slope-distance' ? dx / distance : dy / (distance * distance)
    const derivativeY = observation.type === 'distance' || observation.type === 'slope-distance' ? dy / distance : -dx / (distance * distance)
    const fromX = index.get(`${fromId}:x`); const fromY = index.get(`${fromId}:y`); const toX = index.get(`${toId}:x`); const toY = index.get(`${toId}:y`)
    if (fromX !== undefined) coefficients[fromX] = -derivativeX
    if (fromY !== undefined) coefficients[fromY] = -derivativeY
    if (toX !== undefined) coefficients[toX] = derivativeX
    if (toY !== undefined) coefficients[toY] = derivativeY
    const observed = observation.type === 'distance' || observation.type === 'slope-distance' ? normalizeObservationValue(observation) : angleRadians(observation.value, observation.unit)
    let misclosure = observed - computed
    if (observation.type !== 'distance' && observation.type !== 'slope-distance') while (misclosure > Math.PI) misclosure -= 2 * Math.PI
    if (observation.type !== 'distance' && observation.type !== 'slope-distance') while (misclosure < -Math.PI) misclosure += 2 * Math.PI
    const sigma = observation.sigma ?? (observation.type === 'distance' ? 0.002 : 2 / 206264.806247)
    const sigmaValue = observation.type === 'distance' || observation.type === 'slope-distance' ? sigma : angleRadians(sigma, 'arcsec')
    rows.push({ coefficients, misclosure, weight: 1 / Math.max(1e-18, sigmaValue * sigmaValue), observation })
  }
  const solved = weightedLeastSquares(rows)
  const baseFindings = network.findings.filter((item) => item.status === 'open')
  if (!solved) return invalidAdjustmentResult(network, run, baseFindings.concat(finding(network.id, 'rank_deficient', 'blocking', '平面网法方程秩亏或网形不连通', '补充方向/距离观测或固定足够已知点')), nowIso)
  const pointResults = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    const ix = index.get(`${point.id}:x`); const iy = index.get(`${point.id}:y`); const coordinate = coordinateOf(point)
    if (ix === undefined || iy === undefined) return { id: point.id, x: coordinate.x, y: coordinate.y }
    const correctionX = solved.corrections[ix]!; const correctionY = solved.corrections[iy]!; const qx = solved.covariance[ix]?.[ix] ?? 0; const qy = solved.covariance[iy]?.[iy] ?? 0
    return { id: point.id, x: coordinate.x + correctionX, y: coordinate.y + correctionY, correctionX, correctionY, standardError: Math.sqrt(Math.max(0, (qx + qy) * solved.varianceFactor / 2)), covariance: [...(solved.covariance[ix] ?? []), ...(solved.covariance[iy] ?? [])] }
  })
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, pointResults.find((candidate) => candidate.id === point.id) ?? {}))
  const observationResults = rows.map((row, i) => { const standardized = Math.abs(solved.residuals[i]!) / Math.max(1e-12, Math.sqrt(1 / row.weight)); return { observationId: row.observation.id, correction: solved.residuals[i]!, residual: solved.residuals[i]!, standardizedResidual: standardized, outlier: standardized > 3, sourceRow: row.observation.sourceRow } })
  const outlierFindings = observationResults.filter((item) => item.outlier).map((item) => finding(network.id, 'outlier_candidate', 'warning', `观测 ${item.observationId} 的标准化残差超过 3σ`, '复核原始观测和定向参数', item.sourceRow, nowIso))
  const maxStd = pointResults.reduce((max, point) => Math.max(max, point.standardError ?? 0), 0)
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: rows.length, unknownCount: unknownIds.length * 2, redundancy: solved.dof, degreesOfFreedom: solved.dof, closure: { horizontal: Math.sqrt(observationResults.reduce((sum, item) => sum + item.residual ** 2, 0)) }, unitWeightStdDev: Math.sqrt(solved.varianceFactor), varianceFactor: solved.varianceFactor, points: pointResults, observations: observationResults, displacements, covariance: solved.covariance, precision: { maxPointStdDev: maxStd, passed: outlierFindings.length === 0 }, qualityFindings: [...baseFindings, ...outlierFindings], inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: outlierFindings.length ? 'invalid' : 'valid', createdAt: nowIso() })
}

function invalidAdjustmentResult(network: SurveyNetworkV1, run: AdjustmentRunV1, findings: SurveyQualityFindingV1[], nowIso: () => string): AdjustmentResultV1 {
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: network.observations.length, unknownCount: network.unknownPoints.length, redundancy: 0, degreesOfFreedom: 0, closure: {}, unitWeightStdDev: 0, varianceFactor: 0, points: [], observations: [], displacements: [], qualityFindings: findings, inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, precision: { maxPointStdDev: 0, passed: false }, validation: 'invalid', createdAt: nowIso() })
}

function buildCoordinateTransformResult(network: SurveyNetworkV1, run: AdjustmentRunV1, nowIso: () => string): AdjustmentResultV1 {
  const p = network.instrumentParameters
  const tx = p.tx ?? p.translationX ?? 0; const ty = p.ty ?? p.translationY ?? 0
  const rotation = p.rotationRad ?? ((p.rotationDeg ?? p.rotation ?? 0) * Math.PI / 180)
  const scale = 1 + (p.scalePpm ?? 0) * 1e-6
  const points = [...network.knownPoints, ...network.unknownPoints].map((point) => {
    if (point.x === undefined || point.y === undefined) return { id: point.id }
    const x = scale * (Math.cos(rotation) * point.x - Math.sin(rotation) * point.y) + tx
    const y = scale * (Math.sin(rotation) * point.x + Math.cos(rotation) * point.y) + ty
    return { id: point.id, x, y, correctionX: x - point.x, correctionY: y - point.y, standardError: 0 }
  })
  const displacements = [...network.knownPoints, ...network.unknownPoints].map((point) => displacement(point, points.find((candidate) => candidate.id === point.id) ?? {}))
  const observations = network.observations.map((observation) => ({ observationId: observation.id, correction: 0, residual: 0, standardizedResidual: 0, outlier: false, sourceRow: observation.sourceRow }))
  return AdjustmentResultV1.parse({ schemaVersion: 1, id: `adjustment_result_${randomUUID()}`, runId: run.id, networkId: network.id, observationCount: network.observations.length, unknownCount: network.unknownPoints.length * 2, redundancy: 0, degreesOfFreedom: 0, closure: { translationX: tx, translationY: ty, scalePpm: (scale - 1) * 1e6 }, unitWeightStdDev: 0, varianceFactor: 0, points, observations, displacements, precision: { maxPointStdDev: 0, passed: true }, qualityFindings: network.findings.filter((item) => item.status === 'open'), inputHash: run.inputHash, algorithmVersion: ALGORITHM_VERSION, validation: 'valid', createdAt: nowIso() })
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
    if (req.network) network = SurveyNetworkV1.parse({ ...req.network, schemaVersion: 1, id: req.network.id ?? `network_${randomUUID()}`, projectId: req.projectId, networkType: req.network.networkType ?? req.networkType ?? 'leveling', knownPoints: req.network.knownPoints ?? [], unknownPoints: req.network.unknownPoints ?? [], observations: req.network.observations ?? [], instrumentParameters: req.network.instrumentParameters ?? {}, qualityStatus: 'imported', findings: [], revision: 1, createdAt: this.nowIso(), updatedAt: this.nowIso(), inputAttachmentHash: req.inputAttachmentHash ?? req.network.inputAttachmentHash })
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
    }
    if (!network.observations.length) findings.push(finding(network.id, 'invalid_observation', 'blocking', '网络没有观测记录', '导入至少一条有效观测'))
    if (network.networkType === 'gnss' && network.observations.some((item) => item.type === 'gnss-baseline' && (!item.covariance || item.covariance.length === 0))) findings.push(finding(network.id, 'missing_covariance', 'blocking', 'GNSS 基线缺少标准协方差', '补充基线协方差，不能用模型猜测'))
    if (network.networkType === 'gnss' && !network.knownPoints.some((point) => point.known)) findings.push(finding(network.id, 'missing_datum', 'blocking', 'GNSS 网络缺少固定基准点', '指定至少一个固定基准点后再平差'))
    if (network.knownPoints.length === 0 && network.unknownPoints.length > 0) findings.push(finding(network.id, 'missing_datum', 'blocking', '网络没有已知约束点', '提供已知点或明确自由网约束'))
    const adjacency = new Map<string, Set<string>>(); for (const id of points.keys()) adjacency.set(id, new Set())
    for (const observation of network.observations) { const ids = observationEndpointIds(observation); for (const a of ids) for (const b of ids) if (a !== b) adjacency.get(a)?.add(b) }
    const roots = [...network.knownPoints].map((point) => point.id); const seen = new Set<string>(roots); const queue = [...roots]
    while (queue.length) for (const next of adjacency.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
    if (network.unknownPoints.some((point) => !seen.has(point.id))) findings.push(finding(network.id, 'disconnected_network', 'blocking', '存在与已知点不连通的网段', '检查点号、观测方向和缺失边'))
    const next = SurveyNetworkV1.parse({ ...network, findings, qualityStatus: findings.some((item) => item.severity === 'blocking') ? 'blocked' : 'validated', revision: network.revision + 1, updatedAt: this.nowIso() })
    this.saveNetwork(next); this.remember(req.idempotencyKey, next); return next
  }

  createAdjustment(input: unknown): { run: AdjustmentRunV1; result: AdjustmentResultV1 } {
    const req = AdjustmentRequestV1.parse(input); const network = this.getNetwork(req.networkId); if (!network) throw new Error(`survey network not found: ${req.networkId}`)
    if (req.expectedRevision !== 0 && req.expectedRevision !== network.revision) throw new SurveyRevisionConflictError(`network revision conflict: expected ${req.expectedRevision}, actual ${network.revision}`)
    const replay = this.replay(req.idempotencyKey); if (replay) return replay as { run: AdjustmentRunV1; result: AdjustmentResultV1 }
    const project = this.options.getProject?.(network.projectId)
    const inputHash = createHash('sha256').update(JSON.stringify(network)).digest('hex')
    const run = AdjustmentRunV1.parse({ schemaVersion: 1, id: `adjustment_${randomUUID()}`, projectId: network.projectId, networkId: network.id, method: req.method ?? (network.networkType === 'coordinate-transform' ? 'helmert-seven-parameter' : 'weighted-least-squares'), constraint: req.constraint ?? 'fixed-known-points', algorithmVersion: ALGORITHM_VERSION, inputHash, status: 'running', revision: 1, idempotencyKey: req.idempotencyKey, createdAt: this.nowIso(), updatedAt: this.nowIso() })
    let result: AdjustmentResultV1
    try {
      if (network.networkType === 'gnss' && (network.findings.some((item) => item.code === 'missing_covariance' || item.code === 'missing_datum') || !network.observations.every((item) => item.covariance?.length))) result = invalidAdjustmentResult(network, run, [finding(network.id, 'missing_covariance', 'blocking', 'GNSS 缺少可验证协方差或固定基准，已阻断平差', '补齐标准基线协方差和固定基准后重试', undefined, this.nowIso)], this.nowIso)
      else if (network.networkType === 'coordinate-transform') result = buildCoordinateTransformResult(network, run, this.nowIso)
      else if (network.networkType === 'leveling' || network.networkType === 'height-control') result = buildLevelingResult(network, run, this.nowIso)
      else result = buildPlaneResult(network, run, this.nowIso)
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
    return row ? JSON.parse(row.data_json) as StoredAdjustment : null
  }
  cancelAdjustment(id: string, input: unknown): AdjustmentRunV1 { const req = AdjustmentMutationRequestV1.parse(input); const stored = this.getAdjustment(id); if (!stored) throw new Error(`adjustment not found: ${id}`); if (req.expectedRevision !== 0 && req.expectedRevision !== stored.run.revision) throw new SurveyRevisionConflictError('adjustment revision conflict'); if (stored.run.status === 'completed') return stored.run; const next = AdjustmentRunV1.parse({ ...stored.run, status: 'cancelled', revision: stored.run.revision + 1, updatedAt: this.nowIso(), cancellationReason: req.reason ?? 'cancelled by user' }); this.saveAdjustment({ ...stored, run: next }); return next }
  resumeAdjustment(id: string, input: unknown): StoredAdjustment { const req = AdjustmentMutationRequestV1.parse(input); const stored = this.getAdjustment(id); if (!stored) throw new Error(`adjustment not found: ${id}`); if (req.expectedRevision !== 0 && req.expectedRevision !== stored.run.revision) throw new SurveyRevisionConflictError('adjustment revision conflict'); if (!['cancelled', 'failed', 'needs_attention'].includes(stored.run.status)) return stored; const network = this.getNetwork(stored.run.networkId); if (!network) throw new Error(`survey network not found: ${stored.run.networkId}`); return this.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: `${stored.run.id}-resume-${stored.run.resumeCount + 1}`, method: stored.run.method, constraint: stored.run.constraint }) }
  previewAdjustment(id: string): StoredAdjustment | null { return this.getAdjustment(id) }

  private saveNetwork(network: SurveyNetworkV1): void { this.db.prepare('UPDATE survey_networks SET revision = ?, data_json = ?, updated_at = ? WHERE id = ?').run(network.revision, JSON.stringify(network), network.updatedAt, network.id) }
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
