import type {
  AdjustmentResultV1,
  DeformationPairDefinitionV1,
  DeformationPairResultV1,
  DeformationPointResultV1
} from '../contracts/survey.js'

export const DEFORMATION_ALGORITHM_VERSION = 'workwise-survey-deformation-1'

type AdjustmentPoint = AdjustmentResultV1['points'][number]

export type AdjustedEpoch = {
  adjustmentId: string
  observationEpoch: string
  result: AdjustmentResultV1
}

export type DeformationMetrics = {
  durationDays: number
  points: DeformationPointResultV1[]
  pairs: DeformationPairResultV1[]
}

const DAY_MS = 86_400_000

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function difference(current: number | undefined, reference: number | undefined): number | undefined {
  return finite(current) && finite(reference) ? current - reference : undefined
}

function magnitude(values: Array<number | undefined>): number {
  return Math.sqrt(values.filter(finite).reduce((sum, value) => sum + value * value, 0))
}

function pointMap(result: AdjustmentResultV1): Map<string, AdjustmentPoint> {
  return new Map(result.points.map((point) => [point.id, point]))
}

function regressionSlope(days: number[], values: number[]): number | undefined {
  if (days.length !== values.length || days.length < 2) return undefined
  const meanDay = days.reduce((sum, value) => sum + value, 0) / days.length
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length
  let numerator = 0
  let denominator = 0
  for (let index = 0; index < days.length; index += 1) {
    const dayDelta = days[index]! - meanDay
    numerator += dayDelta * (values[index]! - meanValue)
    denominator += dayDelta * dayDelta
  }
  return denominator > 0 ? numerator / denominator : undefined
}

function pointDistance(first: AdjustmentPoint, second: AdjustmentPoint, mode: DeformationPairDefinitionV1['distanceMode']): number | null {
  if (mode === 'horizontal') {
    if (![first.x, first.y, second.x, second.y].every(finite)) return null
    return Math.hypot(second.x! - first.x!, second.y! - first.y!)
  }
  if (mode === 'vertical') {
    if (!finite(first.height) || !finite(second.height)) return null
    return Math.abs(second.height - first.height)
  }
  if (![first.x, first.y, first.height, second.x, second.y, second.height].every(finite)) return null
  return Math.hypot(second.x! - first.x!, second.y! - first.y!, second.height! - first.height!)
}

function comparePair(
  definition: DeformationPairDefinitionV1,
  referencePoints: Map<string, AdjustmentPoint>,
  currentPoints: Map<string, AdjustmentPoint>,
  durationDays: number
): DeformationPairResultV1 {
  const referenceFirst = referencePoints.get(definition.firstPointId)
  const referenceSecond = referencePoints.get(definition.secondPointId)
  const currentFirst = currentPoints.get(definition.firstPointId)
  const currentSecond = currentPoints.get(definition.secondPointId)
  if (!referenceFirst || !referenceSecond || !currentFirst || !currentSecond) {
    throw new Error(`deformation pair ${definition.id} references a point missing from one or more epochs`)
  }
  if (definition.kind === 'convergence') {
    const referenceDistance = pointDistance(referenceFirst, referenceSecond, definition.distanceMode)
    const currentDistance = pointDistance(currentFirst, currentSecond, definition.distanceMode)
    if (referenceDistance === null || currentDistance === null) {
      throw new Error(`deformation pair ${definition.id} lacks coordinates for ${definition.distanceMode} convergence`)
    }
    const convergence = referenceDistance - currentDistance
    return {
      id: definition.id,
      firstPointId: definition.firstPointId,
      secondPointId: definition.secondPointId,
      kind: definition.kind,
      distanceMode: definition.distanceMode,
      referenceDistance,
      currentDistance,
      convergence,
      convergenceRatePerDay: convergence / durationDays,
      linearUnit: 'm',
      rateUnit: 'm/day',
      tiltUnit: 'ratio'
    }
  }
  if (![referenceFirst.height, referenceSecond.height, currentFirst.height, currentSecond.height].every(finite)) {
    throw new Error(`deformation pair ${definition.id} lacks heights required for tilt`)
  }
  const baselineM = definition.baselineM ?? pointDistance(referenceFirst, referenceSecond, 'horizontal')
  if (baselineM === null || baselineM <= 0) throw new Error(`deformation pair ${definition.id} has no non-zero horizontal baseline for tilt`)
  const firstSettlement = referenceFirst.height! - currentFirst.height!
  const secondSettlement = referenceSecond.height! - currentSecond.height!
  const differentialSettlement = secondSettlement - firstSettlement
  return {
    id: definition.id,
    firstPointId: definition.firstPointId,
    secondPointId: definition.secondPointId,
    kind: definition.kind,
    distanceMode: definition.distanceMode,
    baselineM,
    differentialSettlement,
    tilt: differentialSettlement / baselineM,
    linearUnit: 'm',
    rateUnit: 'm/day',
    tiltUnit: 'ratio'
  }
}

export function compareAdjustedEpochs(
  epochs: AdjustedEpoch[],
  pairDefinitions: DeformationPairDefinitionV1[],
  stabilityRateMPerDay: number
): DeformationMetrics {
  if (epochs.length < 2) throw new Error('deformation comparison requires at least two adjusted epochs')
  const sorted = [...epochs].sort((left, right) => Date.parse(left.observationEpoch) - Date.parse(right.observationEpoch))
  const epochMillis = sorted.map((epoch) => Date.parse(epoch.observationEpoch))
  if (epochMillis.some((value) => !Number.isFinite(value))) throw new Error('deformation comparison contains an invalid observation epoch')
  if (new Set(epochMillis).size !== epochMillis.length) throw new Error('deformation comparison requires unique observation epochs')
  const referenceMillis = epochMillis[0]!
  const durationDays = (epochMillis.at(-1)! - referenceMillis) / DAY_MS
  if (!(durationDays > 0)) throw new Error('deformation comparison requires a positive epoch interval')
  const dayOffsets = epochMillis.map((value) => (value - referenceMillis) / DAY_MS)
  const maps = sorted.map((epoch) => pointMap(epoch.result))
  const referencePoints = maps[0]!
  const currentPoints = maps.at(-1)!
  const commonPointIds = [...referencePoints.keys()].filter((pointId) => maps.every((points) => points.has(pointId))).sort()
  const points: DeformationPointResultV1[] = []

  for (const pointId of commonPointIds) {
    const history = maps.map((points) => points.get(pointId)!)
    const reference = history[0]!
    const current = history.at(-1)!
    const dX = difference(current.x, reference.x)
    const dY = difference(current.y, reference.y)
    const dH = difference(current.height, reference.height)
    if (dX === undefined && dY === undefined && dH === undefined) continue
    const horizontalDisplacement = dX !== undefined && dY !== undefined ? Math.hypot(dX, dY) : undefined
    const spatialDisplacement = magnitude([dX, dY, dH])
    const settlement = dH === undefined ? undefined : -dH
    const dXPerDay = dX === undefined ? undefined : dX / durationDays
    const dYPerDay = dY === undefined ? undefined : dY / durationDays
    const dHPerDay = dH === undefined ? undefined : dH / durationDays
    const settlementPerDay = settlement === undefined ? undefined : settlement / durationDays
    const horizontalPerDay = horizontalDisplacement === undefined ? undefined : horizontalDisplacement / durationDays
    const spatialPerDay = spatialDisplacement / durationDays
    const heightHistory = history.map((point) => point.height)
    const heightSlope = heightHistory.every(finite) ? regressionSlope(dayOffsets, heightHistory as number[]) : undefined
    const settlementSlope = heightSlope === undefined ? undefined : -heightSlope
    const trend = settlementSlope !== undefined && settlementSlope > stabilityRateMPerDay
      ? 'settling'
      : settlementSlope !== undefined && settlementSlope < -stabilityRateMPerDay
        ? 'heaving'
        : horizontalPerDay !== undefined && horizontalPerDay > stabilityRateMPerDay
          ? 'horizontal-moving'
          : spatialPerDay <= stabilityRateMPerDay
            ? 'stable'
            : 'unknown'
    const combinedStandardError = finite(reference.standardError) && finite(current.standardError)
      ? Math.hypot(reference.standardError, current.standardError)
      : undefined
    const standardizedDisplacement = combinedStandardError && combinedStandardError > 0 ? spatialDisplacement / combinedStandardError : undefined
    points.push({
      pointId,
      ...(dX === undefined ? {} : { dX }),
      ...(dY === undefined ? {} : { dY }),
      ...(dH === undefined ? {} : { dH, settlement }),
      ...(horizontalDisplacement === undefined ? {} : { horizontalDisplacement }),
      spatialDisplacement,
      rates: {
        ...(dXPerDay === undefined ? {} : { dXPerDay }),
        ...(dYPerDay === undefined ? {} : { dYPerDay }),
        ...(dHPerDay === undefined ? {} : { dHPerDay, settlementPerDay }),
        ...(horizontalPerDay === undefined ? {} : { horizontalPerDay }),
        spatialPerDay
      },
      trend,
      ...(combinedStandardError === undefined ? {} : { combinedStandardError }),
      ...(standardizedDisplacement === undefined ? {} : { standardizedDisplacement, significant: standardizedDisplacement > 3 }),
      unit: 'm',
      rateUnit: 'm/day'
    })
  }
  if (!points.length) throw new Error('deformation comparison has no common point with comparable adjusted coordinates')

  return {
    durationDays,
    points,
    pairs: pairDefinitions.map((definition) => comparePair(definition, referencePoints, currentPoints, durationDays))
  }
}
