import { cosaDmsToRadians, toMetres, type Metres, type Radians } from './survey-units.js'

/**
 * Isolated COSA `.in2` parser for the documented A-05 grammar.
 *
 * It deliberately does not import the format registry or persisted contracts.
 * A later adapter can translate this typed result into those layers only after
 * source-file contract integration is ready.
 */

const UTF8 = new TextEncoder()
const MAX_RAW_SNIPPET_CHARS = 2_048

/**
 * Parser-local resource bounds. These intentionally mirror the broad source
 * and record ceilings used by the registry while keeping this isolated parser
 * safe when it is invoked without the registry.
 */
export type CosaIn2ParseLimits = Readonly<{
  maxSourceBytes: number
  maxLines: number
  maxLineBytes: number
  maxRecords: number
  maxObservations: number
}>

export type CosaIn2ParseLimitOverrides = Readonly<Partial<CosaIn2ParseLimits>>

export const DEFAULT_COSA_IN2_PARSE_LIMITS: CosaIn2ParseLimits = Object.freeze({
  maxSourceBytes: 64 * 1024 * 1024,
  maxLines: 200_000,
  maxLineBytes: 1 * 1024 * 1024,
  maxRecords: 100_000,
  maxObservations: 100_000
})

export type CosaIn2Source = string | Uint8Array

export type CosaIn2RecordType = 'prior-header' | 'known-point' | 'station' | 'backsight-reset' | 'direction' | 'distance' | 'known-edge' | 'blank' | 'unknown'

/** Immutable locator for the original text record, with byte offsets in UTF-8. */
export type CosaIn2RecordAnchor = Readonly<{
  id: string
  sourceRecord: number
  line: number
  column: number
  byteOffset: number
  byteLength: number
  rawOffset: number
  rawLength: number
  rawSnippet: string
  recordType: CosaIn2RecordType
  station?: string
}>

export type CosaIn2PriorPrecisions = Readonly<{
  /** Direction prior sigma, exactly as declared in arc-seconds. */
  directionArcSeconds: number
  /** Distance constant prior sigma, exactly as declared in millimetres. */
  distanceConstantMillimetres: number
  /** Distance prior sigma coefficient, exactly as declared in ppm. */
  distancePpm: number
  rawValues: Readonly<{ directionArcSeconds: string; distanceConstantMillimetres: string; distancePpm: string }>
  anchor: CosaIn2RecordAnchor
}>

export type CosaIn2Point = Readonly<{
  id: string
  known: true
  x: Metres
  y: Metres
  rawValues: Readonly<{ point: string; x: string; y: string }>
  anchor: CosaIn2RecordAnchor
}>

export type CosaIn2Station = Readonly<{
  id: string
  rawValue: string
  anchor: CosaIn2RecordAnchor
}>

type CosaIn2ObservationBase = Readonly<{
  id: string
  station: string
  target: string
  rawValue: string
  rawValues: Readonly<{ target: string; code: string; value: string; record: string }>
  sourceRecord: number
  sourceLine: number
  sourceColumn: number
  sourceRecordId: string
  anchor: CosaIn2RecordAnchor
}>

export type CosaIn2DirectionObservation = CosaIn2ObservationBase & Readonly<{
  type: 'direction'
  /** The first L,0 in a station block is an orientation observation, not a skipped record. */
  role: 'backsight-reset' | 'foresight'
  value: Radians
  unit: 'rad'
  rawUnit: 'cosa-degree-dot-mmss'
}>

export type CosaIn2DistanceObservation = CosaIn2ObservationBase & Readonly<{
  type: 'distance'
  value: Metres
  unit: 'm'
  rawUnit: 'm'
}>

export type CosaIn2Observation = CosaIn2DirectionObservation | CosaIn2DistanceObservation

export type CosaIn2Summary = Readonly<{
  pointCount: number
  stationCount: number
  observationCount: number
  recordCount: number
  /** S,0 known edges are records, but never observations. */
  skippedRecordCount: number
}>

export type CosaIn2ParseResult = Readonly<{
  priorPrecisions: CosaIn2PriorPrecisions
  points: readonly CosaIn2Point[]
  stations: readonly CosaIn2Station[]
  observations: readonly CosaIn2Observation[]
  recordAnchors: readonly CosaIn2RecordAnchor[]
  summary: CosaIn2Summary
}>

export type CosaIn2ParseErrorCode =
  | 'invalid-encoding'
  | 'limit-exceeded'
  | 'missing-header'
  | 'invalid-prior-header'
  | 'invalid-known-point'
  | 'station-required'
  | 'invalid-station'
  | 'backsight-reset-required'
  | 'invalid-direction'
  | 'invalid-distance'
  | 'invalid-record'
  | 'incomplete-station'

export type CosaIn2ParseErrorDetails = Readonly<{
  code: CosaIn2ParseErrorCode
  line: number
  column: number
  expected: string
  suggestedAction: string
  recordAnchor: CosaIn2RecordAnchor
}>

/**
 * A typed, recoverable parser failure. Registry integration can catch this
 * class, attach the source location as a blocking diagnostic, and safely
 * return an empty observation collection rather than importing a prefix.
 */
export class CosaIn2ParseError extends Error {
  readonly recoverable = true as const
  readonly code: CosaIn2ParseErrorCode
  readonly line: number
  readonly column: number
  readonly expected: string
  readonly suggestedAction: string
  readonly recordAnchor: CosaIn2RecordAnchor

  constructor(details: CosaIn2ParseErrorDetails) {
    super(`COSA .in2 ${details.code} at line ${details.line}, column ${details.column}: expected ${details.expected}. Suggested action: ${details.suggestedAction}`)
    this.name = 'CosaIn2ParseError'
    this.code = details.code
    this.line = details.line
    this.column = details.column
    this.expected = details.expected
    this.suggestedAction = details.suggestedAction
    this.recordAnchor = details.recordAnchor
  }
}

export function isCosaIn2ParseError(value: unknown): value is CosaIn2ParseError {
  return value instanceof CosaIn2ParseError
}

type SourceLine = Readonly<{
  line: number
  raw: string
  byteOffset: number
  byteLength: number
}>

type Field = Readonly<{
  raw: string
  value: string
  column: number
}>

type StationState = {
  station: CosaIn2Station
  sourceLine: SourceLine
  awaitingBacksightReset: boolean
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function rawValues<T extends Record<string, string>>(values: T): Readonly<T> {
  return Object.freeze({ ...values })
}

function utf8Length(value: string): number {
  return UTF8.encode(value).byteLength
}

function resolveLimits(overrides: CosaIn2ParseLimitOverrides | undefined): CosaIn2ParseLimits {
  const limits: CosaIn2ParseLimits = Object.freeze({ ...DEFAULT_COSA_IN2_PARSE_LIMITS, ...(overrides ?? {}) })
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`COSA .in2 parser limit ${name} must be a non-negative safe integer`)
    }
  }
  return limits
}

function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = []
  let cursor = 0
  let byteOffset = 0
  let line = 1
  while (cursor < text.length) {
    let end = cursor
    while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end += 1
    const raw = text.slice(cursor, end)
    let next = end
    if (text[next] === '\r') {
      next += 1
      if (text[next] === '\n') next += 1
    } else if (text[next] === '\n') {
      next += 1
    }
    lines.push(Object.freeze({ line, raw, byteOffset, byteLength: utf8Length(raw) }))
    byteOffset += utf8Length(text.slice(cursor, next))
    cursor = next
    line += 1
  }
  return lines
}

function virtualAnchor(recordType: CosaIn2RecordType = 'unknown'): CosaIn2RecordAnchor {
  return Object.freeze({
    id: 'cosa-in2-record-1',
    sourceRecord: 1,
    line: 1,
    column: 1,
    byteOffset: 0,
    byteLength: 0,
    rawOffset: 0,
    rawLength: 0,
    rawSnippet: '',
    recordType
  })
}

function byteSnippet(bytes: Uint8Array, offset: number, length: number): string {
  const start = Math.max(0, Math.min(offset, bytes.length))
  const end = Math.min(bytes.length, start + Math.max(0, Math.min(length, MAX_RAW_SNIPPET_CHARS)))
  return new TextDecoder('utf-8').decode(bytes.subarray(start, end)).slice(0, MAX_RAW_SNIPPET_CHARS)
}

function byteAnchor(bytes: Uint8Array, line: number, byteOffset: number, byteLength: number): CosaIn2RecordAnchor {
  const offset = Math.max(0, Math.min(byteOffset, bytes.length))
  const length = Math.max(0, Math.min(byteLength, bytes.length - offset))
  return Object.freeze({
    id: `cosa-in2-record-${line}`,
    sourceRecord: line,
    line,
    column: 1,
    byteOffset: offset,
    byteLength: length,
    rawOffset: offset,
    rawLength: length,
    rawSnippet: byteSnippet(bytes, offset, length),
    recordType: 'unknown'
  })
}

type CosaIn2LimitName = keyof CosaIn2ParseLimits

function limitExceeded(limitName: CosaIn2LimitName, limit: number, recordAnchor: CosaIn2RecordAnchor): never {
  const noun = limitName === 'maxSourceBytes'
    ? 'UTF-8 source bytes'
    : limitName === 'maxLines'
      ? 'physical source lines'
      : limitName === 'maxLineBytes'
        ? 'UTF-8 bytes in one source line'
        : limitName === 'maxRecords'
          ? 'source records'
          : 'parsed observations'
  throw new CosaIn2ParseError({
    code: 'limit-exceeded',
    line: recordAnchor.line,
    column: recordAnchor.column,
    expected: `at most ${limit.toLocaleString('en-US')} ${noun} (${limitName})`,
    suggestedAction: `Split, reduce, or pre-filter the input so it stays within ${limitName}=${limit.toLocaleString('en-US')}, then parse again.`,
    recordAnchor
  })
}

/**
 * Byte-level preflight runs before UTF-8 decoding and before allocating the
 * complete SourceLine/record arrays. A valid .in2 physical line produces one
 * record anchor, so the record ceiling can safely be enforced here as well.
 */
function preflightSourceBytes(bytes: Uint8Array, limits: CosaIn2ParseLimits): void {
  if (bytes.length > limits.maxSourceBytes) {
    limitExceeded('maxSourceBytes', limits.maxSourceBytes, byteAnchor(bytes, 1, 0, Math.min(bytes.length, MAX_RAW_SNIPPET_CHARS)))
  }

  let line = 1
  let lineStart = 0
  const completeLine = (lineEnd: number) => {
    const byteLength = lineEnd - lineStart
    if (byteLength > limits.maxLineBytes) {
      limitExceeded('maxLineBytes', limits.maxLineBytes, byteAnchor(bytes, line, lineStart, Math.min(byteLength, limits.maxLineBytes + 1)))
    }
    if (line > limits.maxLines) {
      limitExceeded('maxLines', limits.maxLines, byteAnchor(bytes, line, lineStart, byteLength))
    }
    // Header, points, stations, observations, and S,0 known edges each own a
    // record anchor, so physical line count is an exact upper bound here.
    if (line > limits.maxRecords) {
      limitExceeded('maxRecords', limits.maxRecords, byteAnchor(bytes, line, lineStart, byteLength))
    }
  }

  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index]!
    if (value !== 0x0d && value !== 0x0a) {
      if (index - lineStart + 1 > limits.maxLineBytes) {
        limitExceeded('maxLineBytes', limits.maxLineBytes, byteAnchor(bytes, line, lineStart, limits.maxLineBytes + 1))
      }
      continue
    }
    completeLine(index)
    if (value === 0x0d && bytes[index + 1] === 0x0a) index += 1
    line += 1
    lineStart = index + 1
  }
  if (lineStart < bytes.length) completeLine(bytes.length)
}

function sourceBytes(source: CosaIn2Source): Uint8Array {
  return typeof source === 'string' ? UTF8.encode(source) : source
}

function decodeSource(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new CosaIn2ParseError({
      code: 'invalid-encoding',
      line: 1,
      column: 1,
      expected: 'UTF-8 text source',
      suggestedAction: 'Decode the source with its verified encoding before invoking the COSA .in2 parser.',
      recordAnchor: virtualAnchor()
    })
  }
}

function anchorFor(line: SourceLine, recordType: CosaIn2RecordType, station?: string): CosaIn2RecordAnchor {
  return Object.freeze({
    id: `cosa-in2-record-${line.line}`,
    sourceRecord: line.line,
    line: line.line,
    column: 1,
    byteOffset: line.byteOffset,
    byteLength: line.byteLength,
    rawOffset: line.byteOffset,
    rawLength: line.byteLength,
    rawSnippet: line.raw.slice(0, MAX_RAW_SNIPPET_CHARS),
    recordType,
    ...(station ? { station } : {})
  })
}

function appendRecord(
  recordAnchors: CosaIn2RecordAnchor[],
  recordAnchor: CosaIn2RecordAnchor,
  limits: CosaIn2ParseLimits
): void {
  if (recordAnchors.length >= limits.maxRecords) {
    limitExceeded('maxRecords', limits.maxRecords, recordAnchor)
  }
  recordAnchors.push(recordAnchor)
}

function appendObservation(
  recordAnchors: CosaIn2RecordAnchor[],
  observations: CosaIn2Observation[],
  observation: CosaIn2Observation,
  limits: CosaIn2ParseLimits
): void {
  if (observations.length >= limits.maxObservations) {
    limitExceeded('maxObservations', limits.maxObservations, observation.anchor)
  }
  appendRecord(recordAnchors, observation.anchor, limits)
  observations.push(observation)
}

function fieldsOf(raw: string): Field[] {
  const fields: Field[] = []
  let start = 0
  for (let index = 0; index <= raw.length; index += 1) {
    if (index !== raw.length && raw[index] !== ',') continue
    const fieldRaw = raw.slice(start, index)
    const firstValueCharacter = fieldRaw.search(/\S/)
    fields.push(Object.freeze({
      raw: fieldRaw,
      value: fieldRaw.trim(),
      column: start + (firstValueCharacter < 0 ? 0 : firstValueCharacter) + 1
    }))
    start = index + 1
  }
  return fields
}

function fail(
  line: SourceLine,
  recordType: CosaIn2RecordType,
  code: CosaIn2ParseErrorCode,
  column: number,
  expected: string,
  suggestedAction: string,
  station?: string
): never {
  throw new CosaIn2ParseError({
    code,
    line: line.line,
    column,
    expected,
    suggestedAction,
    recordAnchor: anchorFor(line, recordType, station)
  })
}

function requireThreeFields(
  line: SourceLine,
  fields: readonly Field[],
  recordType: CosaIn2RecordType,
  code: CosaIn2ParseErrorCode,
  expected: string,
  suggestedAction: string,
  station?: string
): asserts fields is readonly [Field, Field, Field] {
  if (fields.length !== 3) fail(line, recordType, code, fields[3]?.column ?? line.raw.length + 1, expected, suggestedAction, station)
}

function finiteNumber(
  field: Field,
  line: SourceLine,
  recordType: CosaIn2RecordType,
  expected: string,
  suggestedAction: string,
  minimum?: number,
  station?: string
): number {
  const value = Number(field.value)
  if (!field.value || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    fail(line, recordType, recordType === 'prior-header' ? 'invalid-prior-header' : recordType === 'distance' || recordType === 'known-edge' ? 'invalid-distance' : 'invalid-known-point', field.column, expected, suggestedAction, station)
  }
  return value
}

function requirePointId(field: Field, line: SourceLine, recordType: CosaIn2RecordType, suggestedAction: string, station?: string): string {
  const code: CosaIn2ParseErrorCode = recordType === 'station' ? 'invalid-station' : recordType === 'known-point' ? 'invalid-known-point' : 'invalid-record'
  if (!field.value) fail(line, recordType, code, field.column, 'a non-empty point or station identifier', suggestedAction, station)
  return field.value
}

function isZeroReset(value: string): boolean {
  return /^[+-]?0(?:\.0+)?$/.test(value)
}

function parsePriorHeader(line: SourceLine): CosaIn2PriorPrecisions {
  const fields = fieldsOf(line.raw)
  requireThreeFields(
    line,
    fields,
    'prior-header',
    'invalid-prior-header',
    'exactly three prior-precision fields: direction arc-seconds, distance constant millimetres, distance ppm',
    'Provide exactly three comma-separated finite non-negative prior precision values on line 1.'
  )
  const expected = 'a finite non-negative prior precision value'
  const suggestedAction = 'Replace the prior precision with a finite non-negative number in its declared unit.'
  const directionArcSeconds = finiteNumber(fields[0], line, 'prior-header', expected, suggestedAction, 0)
  const distanceConstantMillimetres = finiteNumber(fields[1], line, 'prior-header', expected, suggestedAction, 0)
  const distancePpm = finiteNumber(fields[2], line, 'prior-header', expected, suggestedAction, 0)
  const anchor = anchorFor(line, 'prior-header')
  return Object.freeze({
    directionArcSeconds,
    distanceConstantMillimetres,
    distancePpm,
    rawValues: rawValues({ directionArcSeconds: fields[0].raw, distanceConstantMillimetres: fields[1].raw, distancePpm: fields[2].raw }),
    anchor
  })
}

function parseKnownPoint(line: SourceLine, fields: readonly Field[]): CosaIn2Point {
  requireThreeFields(
    line,
    fields,
    'known-point',
    'invalid-known-point',
    'known point record point,X,Y with exactly three comma-separated fields',
    'Remove commas from the point identifier and provide one X and one Y coordinate.'
  )
  const id = requirePointId(fields[0], line, 'known-point', 'Provide a non-empty point identifier before X and Y.')
  const coordinateExpected = 'a finite X or Y coordinate in metres'
  const coordinateAction = 'Replace the coordinate with a finite decimal metre value.'
  const x = toMetres(finiteNumber(fields[1], line, 'known-point', coordinateExpected, coordinateAction), 'm')
  const y = toMetres(finiteNumber(fields[2], line, 'known-point', coordinateExpected, coordinateAction), 'm')
  return Object.freeze({
    id,
    known: true,
    x,
    y,
    rawValues: rawValues({ point: fields[0].raw, x: fields[1].raw, y: fields[2].raw }),
    anchor: anchorFor(line, 'known-point')
  })
}

function startStation(line: SourceLine, fields: readonly Field[]): CosaIn2Station {
  const id = requirePointId(fields[0]!, line, 'station', 'Provide a non-empty one-token station block identifier.')
  return Object.freeze({ id, rawValue: fields[0]!.raw, anchor: anchorFor(line, 'station', id) })
}

function directionObservation(line: SourceLine, fields: readonly [Field, Field, Field], station: string): CosaIn2DirectionObservation {
  const target = requirePointId(fields[0], line, 'direction', 'Provide the observed target identifier before L.', station)
  let value: Radians
  try {
    value = cosaDmsToRadians(fields[2].value)
  } catch {
    fail(
      line,
      'direction',
      'invalid-direction',
      fields[2].column,
      'a COSA D.MMSSs direction with minute and second fields below 60',
      'Correct the direction token; do not use decimal degrees or carry 60 seconds/minutes.',
      station
    )
  }
  const anchor = anchorFor(line, 'direction', station)
  return Object.freeze({
    id: `cosa-in2-${line.line}-direction`,
    type: 'direction',
    role: 'foresight',
    station,
    target,
    value: value!,
    unit: 'rad',
    rawUnit: 'cosa-degree-dot-mmss',
    rawValue: fields[2].raw,
    rawValues: rawValues({ target: fields[0].raw, code: fields[1].raw, value: fields[2].raw, record: line.raw }),
    sourceRecord: line.line,
    sourceLine: line.line,
    sourceColumn: fields[2].column,
    sourceRecordId: anchor.id,
    anchor
  })
}

function backsightResetObservation(line: SourceLine, fields: readonly [Field, Field, Field], station: string): CosaIn2DirectionObservation {
  const target = requirePointId(fields[0], line, 'backsight-reset', 'Provide the backsight target identifier before L,0.', station)
  const anchor = anchorFor(line, 'backsight-reset', station)
  return Object.freeze({
    id: `cosa-in2-${line.line}-backsight-reset`,
    type: 'direction',
    role: 'backsight-reset',
    station,
    target,
    // The reset grammar permits the special literal `0`; normalize its
    // numerical meaning through the strict COSA unit helper as 0.0000.
    value: cosaDmsToRadians(0),
    unit: 'rad',
    rawUnit: 'cosa-degree-dot-mmss',
    rawValue: fields[2].raw,
    rawValues: rawValues({ target: fields[0].raw, code: fields[1].raw, value: fields[2].raw, record: line.raw }),
    sourceRecord: line.line,
    sourceLine: line.line,
    sourceColumn: fields[2].column,
    sourceRecordId: anchor.id,
    anchor
  })
}

function distanceValue(line: SourceLine, field: Field, station: string): number {
  const value = Number(field.value)
  if (!field.value || !Number.isFinite(value)) {
    fail(line, 'distance', 'invalid-distance', field.column, 'a finite distance in metres or exactly S,0 for a known edge', 'Replace the distance with a finite metre value.', station)
  }
  return value
}

function distanceObservation(line: SourceLine, fields: readonly [Field, Field, Field], station: string, value: number): CosaIn2DistanceObservation {
  const target = requirePointId(fields[0], line, 'distance', 'Provide the observed target identifier before S.', station)
  const anchor = anchorFor(line, 'distance', station)
  return Object.freeze({
    id: `cosa-in2-${line.line}-distance`,
    type: 'distance',
    station,
    target,
    value: toMetres(value, 'm'),
    unit: 'm',
    rawUnit: 'm',
    rawValue: fields[2].raw,
    rawValues: rawValues({ target: fields[0].raw, code: fields[1].raw, value: fields[2].raw, record: line.raw }),
    sourceRecord: line.line,
    sourceLine: line.line,
    sourceColumn: fields[2].column,
    sourceRecordId: anchor.id,
    anchor
  })
}

/**
 * Parse a UTF-8 COSA `.in2` source according to the scoped synthetic grammar.
 *
 * A malformed source always throws `CosaIn2ParseError`; it never returns a
 * partial result that could make malformed observations appear adjustment-ready.
 */
export function parseCosaIn2(source: CosaIn2Source, limitOverrides?: CosaIn2ParseLimitOverrides): CosaIn2ParseResult {
  const limits = resolveLimits(limitOverrides)
  const bytes = sourceBytes(source)
  preflightSourceBytes(bytes, limits)
  const lines = sourceLines(decodeSource(bytes))
  if (!lines.length || !lines[0]!.raw.trim()) {
    throw new CosaIn2ParseError({
      code: 'missing-header',
      line: 1,
      column: 1,
      expected: 'the exact three-field prior-precision header on line 1',
      suggestedAction: 'Add direction arc-seconds, distance constant millimetres, and distance ppm values on line 1.',
      recordAnchor: virtualAnchor('prior-header')
    })
  }

  const priorPrecisions = parsePriorHeader(lines[0]!)
  const points: CosaIn2Point[] = []
  const stations: CosaIn2Station[] = []
  const observations: CosaIn2Observation[] = []
  const recordAnchors: CosaIn2RecordAnchor[] = []
  appendRecord(recordAnchors, priorPrecisions.anchor, limits)
  let skippedRecordCount = 0
  let currentStation: StationState | undefined

  for (const line of lines.slice(1)) {
    if (!line.raw.trim()) {
      // COSA exports commonly use blank physical lines to separate the prior
      // header, controls, and station blocks. Preserve their byte location
      // for provenance, but do not turn a visual separator into an observation.
      appendRecord(recordAnchors, anchorFor(line, 'blank', currentStation?.station.id), limits)
      continue
    }
    const fields = fieldsOf(line.raw)
    if (fields.length === 1) {
      if (currentStation?.awaitingBacksightReset) {
        fail(currentStation.sourceLine, 'station', 'incomplete-station', 1, 'the first record in the previous station block to be L,0', 'Insert the required L,0 backsight reset before starting another station block.', currentStation.station.id)
      }
      const station = startStation(line, fields)
      appendRecord(recordAnchors, station.anchor, limits)
      stations.push(station)
      currentStation = { station, sourceLine: line, awaitingBacksightReset: true }
      continue
    }

    if (fields.length !== 3) {
      const recordType: CosaIn2RecordType = currentStation ? 'unknown' : 'known-point'
      fail(
        line,
        recordType,
        currentStation ? 'invalid-record' : 'invalid-known-point',
        fields[3]?.column ?? line.raw.length + 1,
        currentStation ? 'an L or S observation record with exactly three fields' : 'known point record point,X,Y with exactly three comma-separated fields',
        currentStation ? 'Use target,L,value or target,S,value after a station block.' : 'Remove commas from the point identifier and provide exactly point,X,Y.',
        currentStation?.station.id
      )
    }

    const code = fields[1].value
    if (!currentStation) {
      if (code === 'L' || code === 'S') {
        fail(line, code === 'L' ? 'direction' : 'distance', 'station-required', fields[1].column, 'a one-token station block before L or S observations', 'Add a station identifier line before this observation record.')
      }
      const point = parseKnownPoint(line, fields)
      appendRecord(recordAnchors, point.anchor, limits)
      points.push(point)
      continue
    }

    if (code !== 'L' && code !== 'S') {
      fail(line, 'unknown', 'invalid-record', fields[1].column, 'L for a direction or S for a distance after a station block', 'Use target,L,value or target,S,value; known points must precede station blocks.', currentStation.station.id)
    }

    if (currentStation.awaitingBacksightReset) {
      if (code !== 'L' || !isZeroReset(fields[2].value)) {
        fail(
          line,
          code === 'L' ? 'direction' : 'distance',
          'backsight-reset-required',
          fields[2].column,
          'the first observation in every station block to be L,0',
          'Insert target,L,0 as the backsight reset before directions or distances.',
          currentStation.station.id
        )
      }
      const resetFields = [fields[0]!, fields[1]!, fields[2]!] as const
      const observation = backsightResetObservation(line, resetFields, currentStation.station.id)
      appendObservation(recordAnchors, observations, observation, limits)
      currentStation.awaitingBacksightReset = false
      continue
    }

    const observationFields = [fields[0]!, fields[1]!, fields[2]!] as const
    if (code === 'L') {
      const observation = directionObservation(line, observationFields, currentStation.station.id)
      appendObservation(recordAnchors, observations, observation, limits)
      continue
    }

    requirePointId(observationFields[0], line, 'distance', 'Provide the observed target identifier before S.', currentStation.station.id)
    const rawDistance = distanceValue(line, observationFields[2], currentStation.station.id)
    if (rawDistance === 0) {
      appendRecord(recordAnchors, anchorFor(line, 'known-edge', currentStation.station.id), limits)
      skippedRecordCount += 1
      continue
    }
    if (rawDistance < 0) {
      fail(line, 'distance', 'invalid-distance', fields[2].column, 'a positive distance in metres; only S,0 is a skipped known edge', 'Replace the negative distance with a positive metre value or use exactly S,0 for a known edge.', currentStation.station.id)
    }
    const observation = distanceObservation(line, observationFields, currentStation.station.id, rawDistance)
    appendObservation(recordAnchors, observations, observation, limits)
  }

  if (!currentStation) {
    fail(lines[0]!, 'prior-header', 'station-required', 1, 'at least one one-token station block after the known points', 'Add a station identifier followed by its L,0 backsight reset.')
  }
  if (currentStation.awaitingBacksightReset) {
    fail(currentStation.sourceLine, 'station', 'incomplete-station', 1, 'the first record in the station block to be L,0', 'Add the required L,0 backsight reset record.', currentStation.station.id)
  }

  return Object.freeze({
    priorPrecisions,
    points: freezeArray(points),
    stations: freezeArray(stations),
    observations: freezeArray(observations),
    recordAnchors: freezeArray(recordAnchors),
    summary: Object.freeze({
      pointCount: points.length,
      stationCount: stations.length,
      observationCount: observations.length,
      recordCount: recordAnchors.length,
      skippedRecordCount
    })
  })
}
