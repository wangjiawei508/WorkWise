import { CosaIn2ParseError, parseCosaIn2, type CosaIn2ParseResult } from './survey-cosa-in2.js'
import { parseCosaDms } from './survey-units.js'

/**
 * Isolated COSA `.in2` writer for the documented A-06 grammar subset.
 *
 * This writer deliberately accepts source lexemes instead of decimal-degree
 * values: a caller must supply each direction's original D.MMSS token. It
 * emits deterministic UTF-8 and parser-validates its own output, but this is
 * not evidence that COSA itself has accepted the file. A real COSA read and
 * adjustment remains the required third-party interoperability acceptance.
 */

const UTF8 = new TextEncoder()
const PLAIN_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

export type CosaIn2PriorPrecisionTokens = Readonly<{
  /** Direction prior sigma in arc-seconds, preserved exactly as supplied. */
  directionArcSeconds: string
  /** Distance constant prior sigma in millimetres, preserved exactly as supplied. */
  distanceConstantMillimetres: string
  /** Distance prior sigma in ppm, preserved exactly as supplied. */
  distancePpm: string
}>

export type CosaIn2KnownPointExport = Readonly<{
  id: string
  /** Metre token; the writer does not round, normalize, or reformat it. */
  xMetres: string
  /** Metre token; the writer does not round, normalize, or reformat it. */
  yMetres: string
}>

export type CosaIn2DirectionExport = Readonly<{
  kind: 'direction'
  target: string
  /** Original COSA D.MMSS(s...) lexical token, never decimal degrees. */
  directionDms: string
}>

export type CosaIn2DistanceExport = Readonly<{
  kind: 'distance'
  target: string
  /** Positive metre token; zero is represented only by `known-edge`. */
  distanceMetres: string
}>

export type CosaIn2KnownEdgeExport = Readonly<{
  /** Emits `target,S,zeroDistanceToken`, which parser semantics preserve as an S,0 known edge. */
  kind: 'known-edge'
  target: string
  /** A preserved zero-valued metre token such as `0` or `0.000`. */
  zeroDistanceToken: string
}>

export type CosaIn2StationObservationExport =
  | CosaIn2DirectionExport
  | CosaIn2DistanceExport
  | CosaIn2KnownEdgeExport

export type CosaIn2StationExport = Readonly<{
  id: string
  /** The writer emits this target as the block's required, literal `L,0` record. */
  backsightTarget: string
  /** At least one non-reset record is required for a complete station block. */
  observations: readonly CosaIn2StationObservationExport[]
}>

/**
 * A lexical export model. Numeric strings are intentional: accepting numeric
 * values here would require a formatting decision and could silently change
 * source precision or angle representation.
 */
export type CosaIn2ExportModel = Readonly<{
  priorPrecisions: CosaIn2PriorPrecisionTokens
  knownPoints: readonly CosaIn2KnownPointExport[]
  stations: readonly CosaIn2StationExport[]
}>

export type CosaIn2WriteErrorCode =
  | 'invalid-model'
  | 'invalid-identifier'
  | 'invalid-number'
  | 'invalid-direction'
  | 'invalid-observation'
  | 'incomplete-station-block'
  | 'round-trip-rejected'

export type CosaIn2WriteErrorDetails = Readonly<{
  code: CosaIn2WriteErrorCode
  path: string
  expected: string
}>

/** A recoverable model-validation or internal parser-round-trip failure. */
export class CosaIn2WriteError extends Error {
  readonly recoverable = true as const
  readonly code: CosaIn2WriteErrorCode
  readonly path: string
  readonly expected: string

  constructor(details: CosaIn2WriteErrorDetails, cause?: unknown) {
    super(`COSA .in2 writer ${details.code} at ${details.path}: expected ${details.expected}`, cause === undefined ? undefined : { cause })
    this.name = 'CosaIn2WriteError'
    this.code = details.code
    this.path = details.path
    this.expected = details.expected
  }
}

export type CosaIn2WriteResult = Readonly<{
  /** Deterministic LF-terminated source text. */
  text: string
  /** UTF-8 encoding of `text`; no platform-specific encoding is used. */
  utf8: Uint8Array
  /** The isolated parser's successful round-trip result. */
  parsed: CosaIn2ParseResult
}>

type ExpectedSummary = Readonly<{
  pointCount: number
  stationCount: number
  observationCount: number
  skippedRecordCount: number
  recordCount: number
}>

function fail(code: CosaIn2WriteErrorCode, path: string, expected: string): never {
  throw new CosaIn2WriteError({ code, path, expected })
}

function requireArray<T>(value: readonly T[] | undefined, path: string): readonly T[] {
  if (!Array.isArray(value)) fail('invalid-model', path, 'an array')
  return value
}

function requireObject(value: object | null | undefined, path: string): object {
  if (!value || typeof value !== 'object') fail('invalid-model', path, 'an object')
  return value
}

function requireIdentifier(value: unknown, path: string): string {
  if (
    typeof value !== 'string'
    || !value
    || value.trim() !== value
    || /[,\r\n]/.test(value)
  ) {
    fail('invalid-identifier', path, 'a non-empty identifier without commas, line breaks, or leading/trailing whitespace')
  }
  return value
}

function requireDecimalToken(
  value: unknown,
  path: string,
  expected: string,
  predicate: (numeric: number) => boolean
): string {
  if (typeof value !== 'string' || value.trim() !== value || !PLAIN_DECIMAL.test(value)) {
    fail('invalid-number', path, expected)
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !predicate(numeric)) fail('invalid-number', path, expected)
  return value
}

function requireNonNegativeDecimal(value: unknown, path: string): string {
  return requireDecimalToken(value, path, 'a finite non-negative plain-decimal token', (numeric) => numeric >= 0)
}

function requireFiniteDecimal(value: unknown, path: string): string {
  return requireDecimalToken(value, path, 'a finite plain-decimal token', () => true)
}

function requirePositiveDistance(value: unknown, path: string): string {
  return requireDecimalToken(value, path, 'a finite positive metre token; use kind `known-edge` for S,0', (numeric) => numeric > 0)
}

function requireZeroDistance(value: unknown, path: string): string {
  return requireDecimalToken(value, path, 'a finite zero-valued metre token for an S,0 known edge', (numeric) => numeric === 0)
}

function requireDirectionDms(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() !== value) {
    fail('invalid-direction', path, 'an unmodified COSA D.MMSS(s...) token')
  }
  try {
    parseCosaDms(value)
  } catch {
    fail('invalid-direction', path, 'a COSA D.MMSS(s...) token with minute and second fields below 60')
  }
  return value
}

function addObservation(lines: string[], observation: CosaIn2StationObservationExport, path: string): { observationCount: number; skippedRecordCount: number } {
  requireObject(observation, path)
  const target = requireIdentifier(observation.target, `${path}.target`)
  switch (observation.kind) {
    case 'direction': {
      const directionDms = requireDirectionDms(observation.directionDms, `${path}.directionDms`)
      lines.push(`${target},L,${directionDms}`)
      return { observationCount: 1, skippedRecordCount: 0 }
    }
    case 'distance': {
      const distanceMetres = requirePositiveDistance(observation.distanceMetres, `${path}.distanceMetres`)
      lines.push(`${target},S,${distanceMetres}`)
      return { observationCount: 1, skippedRecordCount: 0 }
    }
    case 'known-edge': {
      const zeroDistanceToken = requireZeroDistance(observation.zeroDistanceToken, `${path}.zeroDistanceToken`)
      lines.push(`${target},S,${zeroDistanceToken}`)
      return { observationCount: 0, skippedRecordCount: 1 }
    }
    default:
      fail('invalid-observation', `${path}.kind`, 'one of direction, distance, or known-edge')
  }
}

function expectedSummary(model: CosaIn2ExportModel, lines: string[]): ExpectedSummary {
  requireObject(model, 'model')
  const prior = model.priorPrecisions
  requireObject(prior, 'model.priorPrecisions')
  const directionArcSeconds = requireNonNegativeDecimal(prior.directionArcSeconds, 'model.priorPrecisions.directionArcSeconds')
  const distanceConstantMillimetres = requireNonNegativeDecimal(prior.distanceConstantMillimetres, 'model.priorPrecisions.distanceConstantMillimetres')
  const distancePpm = requireNonNegativeDecimal(prior.distancePpm, 'model.priorPrecisions.distancePpm')
  lines.push(`${directionArcSeconds},${distanceConstantMillimetres},${distancePpm}`)

  const knownPoints = requireArray(model.knownPoints, 'model.knownPoints')
  if (!knownPoints.length) fail('invalid-model', 'model.knownPoints', 'at least one known point before the station blocks')
  for (let index = 0; index < knownPoints.length; index += 1) {
    const point = knownPoints[index]
    requireObject(point, `model.knownPoints[${index}]`)
    const id = requireIdentifier(point.id, `model.knownPoints[${index}].id`)
    const xMetres = requireFiniteDecimal(point.xMetres, `model.knownPoints[${index}].xMetres`)
    const yMetres = requireFiniteDecimal(point.yMetres, `model.knownPoints[${index}].yMetres`)
    lines.push(`${id},${xMetres},${yMetres}`)
  }

  const stations = requireArray(model.stations, 'model.stations')
  if (!stations.length) fail('incomplete-station-block', 'model.stations', 'at least one station block with a literal first L,0 reset')

  let observationCount = 0
  let skippedRecordCount = 0
  for (let stationIndex = 0; stationIndex < stations.length; stationIndex += 1) {
    const station = stations[stationIndex]
    const path = `model.stations[${stationIndex}]`
    requireObject(station, path)
    const id = requireIdentifier(station.id, `${path}.id`)
    const backsightTarget = requireIdentifier(station.backsightTarget, `${path}.backsightTarget`)
    const observations = requireArray(station.observations, `${path}.observations`)
    if (!observations.length) {
      fail('incomplete-station-block', `${path}.observations`, 'at least one direction, distance, or known-edge after the first L,0 reset')
    }
    lines.push(id)
    lines.push(`${backsightTarget},L,0`)
    observationCount += 1
    for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
      const counts = addObservation(lines, observations[observationIndex]!, `${path}.observations[${observationIndex}]`)
      observationCount += counts.observationCount
      skippedRecordCount += counts.skippedRecordCount
    }
  }

  return Object.freeze({
    pointCount: knownPoints.length,
    stationCount: stations.length,
    observationCount,
    skippedRecordCount,
    recordCount: lines.length
  })
}

function assertRoundTripSummary(parsed: CosaIn2ParseResult, expected: ExpectedSummary): void {
  const actual = parsed.summary
  if (
    actual.pointCount !== expected.pointCount
    || actual.stationCount !== expected.stationCount
    || actual.observationCount !== expected.observationCount
    || actual.skippedRecordCount !== expected.skippedRecordCount
    || actual.recordCount !== expected.recordCount
  ) {
    fail(
      'round-trip-rejected',
      'output.summary',
      `parser summary ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`
    )
  }
}

/**
 * Render a strict lexical export model as an LF-terminated UTF-8 COSA `.in2`
 * file and verify the exact structural round trip with `parseCosaIn2`.
 */
export function writeCosaIn2(model: CosaIn2ExportModel): CosaIn2WriteResult {
  const lines: string[] = []
  const expected = expectedSummary(model, lines)
  const text = `${lines.join('\n')}\n`
  const utf8 = UTF8.encode(text)

  let parsed: CosaIn2ParseResult
  try {
    parsed = parseCosaIn2(utf8)
  } catch (error) {
    const detail = error instanceof CosaIn2ParseError
      ? `${error.code} at line ${error.line}, column ${error.column}`
      : 'an internally parser-valid COSA .in2 source'
    throw new CosaIn2WriteError({
      code: 'round-trip-rejected',
      path: 'output',
      expected: detail
    }, error)
  }
  assertRoundTripSummary(parsed, expected)

  return Object.freeze({ text, utf8, parsed })
}
