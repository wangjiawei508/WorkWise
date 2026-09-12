export type CosaOu2PointPrecision = Readonly<{
  mxMm: number
  myMm: number
  mpMm: number
  eMm: number
  fMm: number
  tDms: number
}>

export type CosaOu2AdjustedCoordinate = Readonly<{
  id: string
  x: number
  y: number
  precision?: CosaOu2PointPrecision
  printedResolutionXMetres: number
  printedResolutionYMetres: number
  sourceLine: number
  raw: string
}>

export type CosaOu2Coordinates = Readonly<{
  state: 'valid' | 'blocked'
  points: readonly CosaOu2AdjustedCoordinate[]
  reason?: string
}>

const MAX_REFERENCE_CHARS = 8 * 1024 * 1024
const MAX_REFERENCE_LINES = 100_000
const MAX_LINE_CHARS = 16_384
const MAX_REFERENCE_POINTS = 10_000
const TABLE_TITLE = '平差坐标及其精度'
const TABLE_HEADER = /^序号\s+点名\s+X\(m\)\s+Y\(m\)\s+MX\(mm\)\s+MY\(mm\)\s+MP\(mm\)\s+E\(mm\)\s+F\(mm\)\s+T\(dms\)$/
const SEPARATOR = /^-{3,}$/

function referenceLines(text: string): string[] | null {
  if (text.length > MAX_REFERENCE_CHARS) return null
  let lineCount = 1
  let lineLength = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\r' || text[i] === '\n') {
      if (text[i] === '\r' && text[i + 1] === '\n') i += 1
      lineCount += 1
      lineLength = 0
    } else {
      lineLength += 1
    }
    if (lineCount > MAX_REFERENCE_LINES || lineLength > MAX_LINE_CHARS) return null
  }
  return text.split(/\r\n|\r|\n/)
}

function printedCoordinate(raw: string): Readonly<{ value: number; resolution: number }> | null {
  const match = /^[+-]?\d+\.(\d{1,12})$/.exec(raw)
  if (!match) return null
  const value = Number(raw)
  return Number.isFinite(value) ? { value, resolution: 10 ** -match[1]!.length } : null
}

function finiteDecimal(raw: string): number | null {
  const match = /^[+-]?\d+(?:\.(\d{1,12}))?$/.exec(raw)
  if (!match) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** Read only the uniquely labelled adjusted-coordinate table from a COSA OU2 report. */
export function parseCosaOu2Coordinates(text: string): CosaOu2Coordinates {
  const blocked = (reason: string): CosaOu2Coordinates => Object.freeze({ state: 'blocked', points: Object.freeze([]), reason })
  const lines = referenceLines(text)
  if (!lines) return blocked('reference-resource-limit')

  const headings = lines.flatMap((line, index) => line.trim() === TABLE_TITLE ? [index] : [])
  if (headings.length !== 1) return blocked('adjusted-coordinate-section-required')
  const heading = headings[0]!
  if (!SEPARATOR.test(lines[heading + 1]?.trim() ?? '') || !TABLE_HEADER.test(lines[heading + 2]?.trim() ?? '')) {
    return blocked('coordinate-table-units-required')
  }

  const points: CosaOu2AdjustedCoordinate[] = []
  const ids = new Set<string>()
  let terminated = false
  for (let index = heading + 3; index < lines.length; index += 1) {
    const raw = lines[index]!
    if (SEPARATOR.test(raw.trim())) {
      terminated = true
      break
    }
    if (!raw.trim()) continue

    const cells = raw.trim().split(/\s+/)
    const sequence = cells[0] ?? ''
    const id = cells[1] ?? ''
    const x = printedCoordinate(cells[2] ?? '')
    const y = printedCoordinate(cells[3] ?? '')
    const sequenceNumber = Number(sequence)
    if (
      (cells.length !== 4 && cells.length !== 10)
      || !/^[1-9]\d*$/.test(sequence)
      || !Number.isSafeInteger(sequenceNumber)
      || sequenceNumber !== points.length + 1
      || !id
      || ids.has(id)
      || !x
      || !y
    ) {
      return blocked(`invalid-coordinate-row:${index + 1}`)
    }
    if (points.length >= MAX_REFERENCE_POINTS) return blocked('reference-point-limit')

    let precision: CosaOu2PointPrecision | undefined
    if (cells.length === 10) {
      const values = cells.slice(4).map(finiteDecimal)
      if (values.some((value) => value === null) || values.slice(0, 5).some((value) => value! < 0)) {
        return blocked(`invalid-coordinate-row:${index + 1}`)
      }
      precision = Object.freeze({
        mxMm: values[0]!,
        myMm: values[1]!,
        mpMm: values[2]!,
        eMm: values[3]!,
        fMm: values[4]!,
        tDms: values[5]!
      })
    }

    ids.add(id)
    points.push(Object.freeze({
      id,
      x: x.value,
      y: y.value,
      ...(precision ? { precision } : {}),
      printedResolutionXMetres: x.resolution,
      printedResolutionYMetres: y.resolution,
      sourceLine: index + 1,
      raw
    }))
  }

  if (!terminated || !points.length) return blocked('incomplete-coordinate-table')
  return Object.freeze({ state: 'valid', points: Object.freeze(points) })
}

export type CosaOu2ComparablePoint = Readonly<{
  id: string
  x?: number
  y?: number
  standardError?: number
}>

export type CosaOu2ComparablePointCollection =
  | readonly CosaOu2ComparablePoint[]
  | Readonly<{ points: readonly CosaOu2ComparablePoint[] }>

export type CosaPlaneReferenceComparison = Readonly<{
  status: 'matched' | 'different' | 'blocked'
  reason?: string
  comparedPointCount?: number
  mismatchCount?: number
  maxPlanarCoordinateDifferenceMetres?: number
}>

export type CosaPlanePrecisionEnvelopeComparison = Readonly<{
  status: 'matched' | 'different' | 'blocked'
  reason?: string
  comparedPointCount?: number
  fixedPointCount?: number
  precisionPointCount?: number
  mismatchCount?: number
  strictPrintedMismatchCount?: number
  maxPlanarCoordinateDifferenceMetres?: number
  maxCombinedNormalizedDifferenceSigma?: number
  combinedNormalizedDifferenceLimitSigma?: number
  referenceMaximumPointStdDevMm?: number
  adjustedMaximumPointStdDevMm?: number
  maximumAbsolutePointStdDevDifferenceMm?: number
}>

function resolveComparablePoints(adjusted: CosaOu2ComparablePointCollection): readonly CosaOu2ComparablePoint[] {
  return 'points' in adjusted ? adjusted.points : adjusted
}

function floatingPointSlack(...values: number[]): number {
  return Number.EPSILON * Math.max(1, ...values.map(Math.abs)) * 4
}

/** Compare deterministic adjusted coordinates without exposing point identifiers in the aggregate result. */
export function compareCosaPlaneCoordinates(
  adjusted: CosaOu2ComparablePointCollection,
  reference: CosaOu2Coordinates
): CosaPlaneReferenceComparison {
  if (reference.state !== 'valid') return { status: 'blocked', reason: 'invalid-reference' }
  const points = resolveComparablePoints(adjusted)
  if (!Array.isArray(points) || points.length > MAX_REFERENCE_POINTS) {
    return { status: 'blocked', reason: 'comparison-dimension-limit' }
  }

  const adjustedById = new Map<string, Readonly<{ x: number; y: number }>>()
  for (const point of points) {
    if (
      !point
      || typeof point.id !== 'string'
      || !point.id
      || /\s/.test(point.id)
      || adjustedById.has(point.id)
      || !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
    ) {
      return { status: 'blocked', reason: 'invalid-adjusted-point-collection' }
    }
    adjustedById.set(point.id, { x: point.x!, y: point.y! })
  }

  if (adjustedById.size !== reference.points.length || reference.points.some((point) => !adjustedById.has(point.id))) {
    return { status: 'blocked', reason: 'reference-point-set-mismatch' }
  }

  let mismatchCount = 0
  let maxPlanarDifference = 0
  for (const expected of reference.points) {
    const actual = adjustedById.get(expected.id)!
    const xDifference = Math.abs(actual.x - expected.x)
    const yDifference = Math.abs(actual.y - expected.y)
    maxPlanarDifference = Math.max(maxPlanarDifference, Math.hypot(xDifference, yDifference))
    const xTolerance = expected.printedResolutionXMetres / 2 + floatingPointSlack(actual.x, expected.x)
    const yTolerance = expected.printedResolutionYMetres / 2 + floatingPointSlack(actual.y, expected.y)
    if (xDifference > xTolerance || yDifference > yTolerance) mismatchCount += 1
  }

  return Object.freeze({
    status: mismatchCount ? 'different' : 'matched',
    comparedPointCount: reference.points.length,
    mismatchCount,
    maxPlanarCoordinateDifferenceMetres: maxPlanarDifference
  })
}

/**
 * Compare independent adjustments against the uncertainty printed by COSA.
 * Unknown points use a one-sigma envelope formed from both independent point
 * standard errors; fixed rows have no precision claim and must still match
 * their published X/Y rounding.
 */
export function compareCosaPlaneCoordinatePrecision(
  adjusted: CosaOu2ComparablePointCollection,
  reference: CosaOu2Coordinates
): CosaPlanePrecisionEnvelopeComparison {
  if (reference.state !== 'valid') return { status: 'blocked', reason: 'invalid-reference' }
  const points = resolveComparablePoints(adjusted)
  if (!Array.isArray(points) || points.length > MAX_REFERENCE_POINTS) {
    return { status: 'blocked', reason: 'comparison-dimension-limit' }
  }

  const adjustedById = new Map<string, Readonly<{ x: number; y: number; standardError?: number }>>()
  for (const point of points) {
    if (
      !point
      || typeof point.id !== 'string'
      || !point.id
      || /\s/.test(point.id)
      || adjustedById.has(point.id)
      || !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || (point.standardError !== undefined && (!Number.isFinite(point.standardError) || point.standardError < 0))
    ) {
      return { status: 'blocked', reason: 'invalid-adjusted-point-collection' }
    }
    adjustedById.set(point.id, {
      x: point.x!,
      y: point.y!,
      ...(point.standardError === undefined ? {} : { standardError: point.standardError })
    })
  }

  if (adjustedById.size !== reference.points.length || reference.points.some((point) => !adjustedById.has(point.id))) {
    return { status: 'blocked', reason: 'reference-point-set-mismatch' }
  }
  if (reference.points.some((point) => point.precision && adjustedById.get(point.id)?.standardError === undefined)) {
    return { status: 'blocked', reason: 'adjusted-point-precision-required' }
  }

  let mismatchCount = 0
  let strictPrintedMismatchCount = 0
  let maxPlanarDifference = 0
  let maxNormalizedDifference = 0
  const precisionPairs: Array<Readonly<{ adjustedMm: number; referenceMm: number }>> = []
  for (const expected of reference.points) {
    const actual = adjustedById.get(expected.id)!
    const xDifference = Math.abs(actual.x - expected.x)
    const yDifference = Math.abs(actual.y - expected.y)
    const planarDifference = Math.hypot(xDifference, yDifference)
    const xTolerance = expected.printedResolutionXMetres / 2 + floatingPointSlack(actual.x, expected.x)
    const yTolerance = expected.printedResolutionYMetres / 2 + floatingPointSlack(actual.y, expected.y)
    const strictMismatch = xDifference > xTolerance || yDifference > yTolerance
    if (strictMismatch) strictPrintedMismatchCount += 1
    maxPlanarDifference = Math.max(maxPlanarDifference, planarDifference)

    if (!expected.precision) {
      if (strictMismatch) mismatchCount += 1
      continue
    }

    const referenceStdDevMetres = expected.precision.mpMm / 1_000
    const adjustedStdDevMetres = actual.standardError!
    const combinedStdDevMetres = Math.hypot(referenceStdDevMetres, adjustedStdDevMetres)
    const effectiveLimitMetres = Math.max(combinedStdDevMetres, Math.hypot(xTolerance, yTolerance))
    const normalizedDifference = planarDifference / effectiveLimitMetres
    maxNormalizedDifference = Math.max(maxNormalizedDifference, normalizedDifference)
    if (normalizedDifference > 1 + floatingPointSlack(normalizedDifference, 1)) mismatchCount += 1
    precisionPairs.push({ adjustedMm: adjustedStdDevMetres * 1_000, referenceMm: expected.precision.mpMm })
  }

  return Object.freeze({
    status: mismatchCount ? 'different' : 'matched',
    comparedPointCount: reference.points.length,
    fixedPointCount: reference.points.length - precisionPairs.length,
    precisionPointCount: precisionPairs.length,
    mismatchCount,
    strictPrintedMismatchCount,
    maxPlanarCoordinateDifferenceMetres: maxPlanarDifference,
    maxCombinedNormalizedDifferenceSigma: maxNormalizedDifference,
    combinedNormalizedDifferenceLimitSigma: 1,
    referenceMaximumPointStdDevMm: Math.max(0, ...precisionPairs.map((item) => item.referenceMm)),
    adjustedMaximumPointStdDevMm: Math.max(0, ...precisionPairs.map((item) => item.adjustedMm)),
    maximumAbsolutePointStdDevDifferenceMm: Math.max(0, ...precisionPairs.map((item) => Math.abs(item.adjustedMm - item.referenceMm)))
  })
}
