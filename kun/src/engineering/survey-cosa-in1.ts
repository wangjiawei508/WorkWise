import { TextDecoder, TextEncoder } from 'node:util'
import { mapSurveyColumnRecords, validateColumnMappingScheme, type ColumnMappingRequirements, type ColumnMappingScheme } from './survey-column-mapping.js'

const UTF8 = new TextEncoder()
const MAX_RAW_SNIPPET_CHARS = 2_048

export type CosaIn1Source = string | Uint8Array

export type CosaIn1Mapping = Readonly<{
  schemaVersion: 'cosa-in1-mapping/v1'
  heightUnit: 'm'
  routeLengthUnit: 'km'
  textEncoding?: 'ascii' | 'gb18030'
  /** Explicit alternative for exports without a blank section separator. */
  knownPointRecordCount?: number
  knownPoints: ColumnMappingScheme
  observations: ColumnMappingScheme
}>

const knownRequirements: ColumnMappingRequirements = { formatId: 'cosa-in1', fields: ['point', 'height'].map((name) => ({ name, required: true })) }
const observationRequirements: ColumnMappingRequirements = { formatId: 'cosa-in1', fields: ['from', 'to', 'value', 'routeLengthKm'].map((name) => ({ name, required: true })) }

export type CosaIn1RecordAnchor = Readonly<{
  id: string
  sourceRecord: number
  line: number
  byteOffset: number
  byteLength: number
  rawOffset: number
  rawLength: number
  rawSnippet: string
  recordType: 'known-point' | 'height-difference' | 'blank' | 'unknown'
}>

export type CosaIn1Diagnostic = Readonly<{
  code: 'mapping-required' | 'invalid-mapping' | 'invalid-encoding' | 'missing-section-separator' | 'invalid-section-boundary' | 'invalid-known-point' | 'invalid-height-difference' | 'duplicate-known-point' | 'empty-source' | 'limit-exceeded'
  severity: 'blocking'
  message: string
  suggestedAction: string
  recordAnchor: CosaIn1RecordAnchor
}>

export type CosaIn1KnownPoint = Readonly<{
  id: string
  height: number
  rawValues: Readonly<{ point: string; height: string }>
  recordAnchor: CosaIn1RecordAnchor
}>

export type CosaIn1HeightDifference = Readonly<{
  id: string
  from: string
  to: string
  value: number
  /** Fourth field is section distance in kilometres, not observation sigma. */
  routeLengthKm: number
  rawValues: Readonly<{ from: string; to: string; value: string; routeLengthKm: string }>
  recordAnchor: CosaIn1RecordAnchor
}>

export type CosaIn1ParseResult = Readonly<{
  state: 'valid' | 'blocked'
  knownPoints: readonly CosaIn1KnownPoint[]
  observations: readonly CosaIn1HeightDifference[]
  recordAnchors: readonly CosaIn1RecordAnchor[]
  diagnostics: readonly CosaIn1Diagnostic[]
  mapping?: CosaIn1Mapping
}>

type SourceLine = Readonly<{ line: number; raw: string; byteOffset: number; byteLength: number }>

function anchor(line: SourceLine, recordType: CosaIn1RecordAnchor['recordType']): CosaIn1RecordAnchor {
  return Object.freeze({
    id: `cosa-in1-record-${line.line}`,
    sourceRecord: line.line,
    line: line.line,
    byteOffset: line.byteOffset,
    byteLength: line.byteLength,
    rawOffset: line.byteOffset,
    rawLength: line.byteLength,
    rawSnippet: line.raw.slice(0, MAX_RAW_SNIPPET_CHARS),
    recordType
  })
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
    } else if (text[next] === '\n') next += 1
    lines.push(Object.freeze({ line, raw, byteOffset, byteLength: UTF8.encode(raw).byteLength }))
    byteOffset += UTF8.encode(text.slice(cursor, next)).byteLength
    cursor = next
    line += 1
  }
  return lines
}

function virtualAnchor(rawSnippet = ''): CosaIn1RecordAnchor {
  return Object.freeze({
    id: 'cosa-in1-record-1', sourceRecord: 1, line: 1, byteOffset: 0,
    byteLength: 0, rawOffset: 0, rawLength: 0, rawSnippet, recordType: 'unknown'
  })
}

function diagnostic(
  code: CosaIn1Diagnostic['code'],
  message: string,
  suggestedAction: string,
  recordAnchor: CosaIn1RecordAnchor
): CosaIn1Diagnostic {
  return Object.freeze({ code, severity: 'blocking' as const, message, suggestedAction, recordAnchor })
}

function sourceLinesFromBytes(bytes: Uint8Array, encoding: 'ascii' | 'gb18030'): SourceLine[] {
  const decoder = new TextDecoder(encoding === 'gb18030' ? 'gb18030' : 'utf-8', { fatal: true, ignoreBOM: true })
  const lines: SourceLine[] = []
  let start = 0
  let line = 1
  for (let cursor = 0; cursor < bytes.length; cursor += 1) {
    const terminator = bytes[cursor] === 10 || bytes[cursor] === 13
    if (!terminator) continue
    const rawBytes = bytes.subarray(start, cursor)
    lines.push(Object.freeze({ line, raw: decoder.decode(rawBytes), byteOffset: start, byteLength: rawBytes.length }))
    if (cursor < bytes.length && bytes[cursor] === 13 && bytes[cursor + 1] === 10) cursor += 1
    start = cursor + 1
    line += 1
  }
  if (start < bytes.length) {
    const rawBytes = bytes.subarray(start)
    lines.push(Object.freeze({ line, raw: decoder.decode(rawBytes), byteOffset: start, byteLength: rawBytes.length }))
  }
  return lines
}

function decode(source: CosaIn1Source, encoding: 'ascii' | 'gb18030' = 'ascii'): { text?: string; lines?: SourceLine[]; diagnostic?: CosaIn1Diagnostic } {
  const bytes = typeof source === 'string' ? UTF8.encode(source) : source
  if (bytes.length > 8 * 1024 * 1024) return { diagnostic: diagnostic('limit-exceeded', 'COSA .in1 exceeds the 8 MiB parser limit.', 'Split the source before importing.', virtualAnchor()) }
  let lines = 1
  let lineLength = 0
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 13 || bytes[i] === 10) {
      if (bytes[i] === 13 && bytes[i + 1] === 10) i += 1
      lines += 1
      lineLength = 0
    } else lineLength += 1
    if (lines > 100_000 || lineLength > 16_384) return { diagnostic: diagnostic('limit-exceeded', 'COSA .in1 record count or line length exceeds the parser limit.', 'Use at most 100,000 lines and 16 KiB per line.', virtualAnchor()) }
  }
  try {
    const text = typeof source === 'string' ? source : new TextDecoder(encoding === 'gb18030' ? 'gb18030' : 'utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (encoding === 'ascii') {
      for (const character of text) {
        const codePoint = character.codePointAt(0) ?? -1
        if (codePoint !== 9 && codePoint !== 10 && codePoint !== 13 && (codePoint < 0x20 || codePoint > 0x7e)) throw new Error('unsupported encoding')
      }
    }
    return typeof source === 'string' ? { text } : { text, lines: sourceLinesFromBytes(bytes, encoding) }
  } catch {
    return { diagnostic: diagnostic('invalid-encoding', 'COSA .in1 的声明编码无法安全解码，或源文件包含不允许的字节。', '确认映射中的 textEncoding 与原文件一致后重新导入。', virtualAnchor()) }
  }
}

function blocked(recordAnchors: readonly CosaIn1RecordAnchor[], diagnostics: readonly CosaIn1Diagnostic[]): CosaIn1ParseResult {
  return Object.freeze({ state: 'blocked' as const, knownPoints: Object.freeze([]), observations: Object.freeze([]), recordAnchors: Object.freeze([...recordAnchors]), diagnostics: Object.freeze([...diagnostics]) })
}

/**
 * Parse the observed COSA level-input layout: known-point rows precede a blank
 * separator (or an explicitly declared known-point count), followed by
 * `from,to,height-difference(m),distance(km)` rows. Other dialects still need
 * explicit mapping; this parser never grants readiness.
 */
export function parseCosaIn1(source: CosaIn1Source, mapping?: unknown): CosaIn1ParseResult {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return blocked([], [diagnostic('mapping-required', 'COSA .in1 requires an explicit saved section mapping and units.', 'Select the known-height and observation mappings before parsing.', virtualAnchor())])
  const candidate = mapping as Partial<CosaIn1Mapping>
  const boundedSection = (value: unknown, fieldCount: number): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const section = value as Partial<ColumnMappingScheme>
    return typeof section.mappingId === 'string' && section.mappingId.length <= 128 &&
      Array.isArray(section.bindings) && section.bindings.length === fieldCount &&
      section.bindings.every((binding) => binding && Number.isSafeInteger(binding.columnIndex) && binding.columnIndex >= 0 && binding.columnIndex < fieldCount) &&
      new Set(section.bindings.map((binding) => binding.columnIndex)).size === fieldCount
  }
  if (!boundedSection(candidate.knownPoints, 2) || !boundedSection(candidate.observations, 4) ||
    (candidate.knownPointRecordCount !== undefined && (!Number.isSafeInteger(candidate.knownPointRecordCount) || candidate.knownPointRecordCount < 1 || candidate.knownPointRecordCount > 10_000))) {
    return blocked([], [diagnostic('invalid-mapping', 'COSA .in1 needs bounded, one-to-one column mappings and an optional positive known-point count.', 'Map each source column once and declare at most 10,000 known-point records.', virtualAnchor())])
  }
  const knownMapping = validateColumnMappingScheme(candidate.knownPoints, knownRequirements)
  const observationMapping = validateColumnMappingScheme(candidate.observations, observationRequirements)
  if (candidate.schemaVersion !== 'cosa-in1-mapping/v1' || candidate.heightUnit !== 'm' || candidate.routeLengthUnit !== 'km' || (candidate.textEncoding !== undefined && candidate.textEncoding !== 'ascii' && candidate.textEncoding !== 'gb18030') || knownMapping.status !== 'valid' || observationMapping.status !== 'valid') {
    return blocked([], [diagnostic('invalid-mapping', 'COSA .in1 mapping or unit declaration is invalid.', 'Provide versioned section mappings with heightUnit=m and routeLengthUnit=km.', virtualAnchor())])
  }
  const savedMapping: CosaIn1Mapping = Object.freeze({
    schemaVersion: 'cosa-in1-mapping/v1', heightUnit: 'm', routeLengthUnit: 'km', ...(candidate.textEncoding === undefined ? {} : { textEncoding: candidate.textEncoding }),
    ...(candidate.knownPointRecordCount === undefined ? {} : { knownPointRecordCount: candidate.knownPointRecordCount }),
    knownPoints: knownMapping.scheme, observations: observationMapping.scheme
  })
  const decoded = decode(source, savedMapping.textEncoding)
  if (decoded.diagnostic) return blocked([decoded.diagnostic.recordAnchor], [decoded.diagnostic])
  const lines = decoded.lines ?? sourceLines(decoded.text ?? '')
  if (lines.length > 100_000 || lines.some((line) => line.byteLength > 16_384)) return blocked([], [diagnostic('limit-exceeded', 'COSA .in1 record count or line length exceeds the parser limit.', 'Use at most 100,000 lines and 16 KiB per line.', virtualAnchor())])
  if (!lines.length) return blocked([virtualAnchor()], [diagnostic('empty-source', 'COSA .in1 文件为空。', '至少提供已知点和一条测段记录后重新导入。', virtualAnchor())])

  const anchors: CosaIn1RecordAnchor[] = []
  const diagnostics: CosaIn1Diagnostic[] = []
  const knownPoints: CosaIn1KnownPoint[] = []
  const observations: CosaIn1HeightDifference[] = []
  const knownIds = new Set<string>()
  const firstNonBlank = lines.findIndex((line) => line.raw.trim() !== '')
  let separator = -1
  for (let index = Math.max(0, firstNonBlank + 1); index < lines.length; index += 1) {
    if (lines[index]!.raw.trim() === '') {
      separator = index
      break
    }
  }
  if (candidate.knownPointRecordCount === undefined && (separator < 0 || firstNonBlank < 0 || separator <= firstNonBlank)) {
    const record = anchor(lines[Math.max(0, separator)] ?? lines[Math.max(0, firstNonBlank)] ?? lines[0]!, 'unknown')
    return blocked([...anchors, record], [diagnostic('missing-section-separator', 'COSA .in1 必须用空行分隔已知点区和测段观测区。', '在最后一个已知点后增加空行，并确认后续记录为四字段测段。', record)])
  }

  const nonBlankLines = lines.filter((line) => line.raw.trim() !== '')
  if (candidate.knownPointRecordCount !== undefined && candidate.knownPointRecordCount >= nonBlankLines.length) {
    return blocked([], [diagnostic('invalid-section-boundary', 'The declared known-point count leaves no observation records.', 'Check the explicit known-point record count against the original file.', virtualAnchor())])
  }

  const mappedFields = (raw: string, requirements: ColumnMappingRequirements, scheme: ColumnMappingScheme, names: string[]): string[] => {
    const result = mapSurveyColumnRecords(raw, requirements, scheme)
    return result.status === 'mapped' && result.records.length === 1 ? names.map((name) => result.records[0]!.fields[name]!.trim()) : []
  }
  const finiteDecimal = (value: string | undefined): boolean => typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value))
  const validId = (value: string | undefined): value is string => Boolean(value && value.length <= 128 && !/[\s"']/.test(value))
  const knownAnchors = candidate.knownPointRecordCount === undefined
    ? lines.slice(firstNonBlank, separator)
    : nonBlankLines.slice(0, candidate.knownPointRecordCount)
  const observationLines = candidate.knownPointRecordCount === undefined
    ? lines.slice(separator + 1)
    : nonBlankLines.slice(candidate.knownPointRecordCount)
  for (const line of knownAnchors) {
    const record = anchor(line, 'known-point')
    anchors.push(record)
    const values = mappedFields(line.raw, knownRequirements, knownMapping.scheme, ['point', 'height'])
    const height = Number(values[1])
    if (values.length !== 2 || !validId(values[0]) || !finiteDecimal(values[1])) {
      diagnostics.push(diagnostic('invalid-known-point', `COSA .in1 第 ${line.line} 行必须是 point,height 两字段且数值有限。`, '修正已知点名和高程字段后重新导入。', record))
      continue
    }
    if (knownIds.has(values[0]!)) {
      diagnostics.push(diagnostic('duplicate-known-point', `COSA .in1 已知点 ${values[0]} 重复。`, '保留一个唯一已知点记录，避免基准定义不确定。', record))
      continue
    }
    knownIds.add(values[0]!)
    knownPoints.push(Object.freeze({ id: values[0]!, height, rawValues: Object.freeze({ point: values[0]!, height: values[1]! }), recordAnchor: record }))
  }

  for (const line of observationLines) {
    if (line.raw.trim() === '') continue
    const record = anchor(line, 'height-difference')
    anchors.push(record)
    const values = mappedFields(line.raw, observationRequirements, observationMapping.scheme, ['from', 'to', 'value', 'routeLengthKm'])
    const value = Number(values[2])
    const routeLengthKm = Number(values[3])
    if (values.length !== 4 || !validId(values[0]) || !validId(values[1]) || values[0] === values[1] || !finiteDecimal(values[2]) || !finiteDecimal(values[3]) || routeLengthKm <= 0 || !Number.isFinite(routeLengthKm * 1_000) || !Number.isFinite(1 / routeLengthKm)) {
      diagnostics.push(diagnostic('invalid-height-difference', `COSA .in1 第 ${line.line} 行必须是 from,to,height-difference(m),distance(km)，且 distance > 0。`, '修正起点、终点、高差和测段距离后重新导入。', record))
      continue
    }
    observations.push(Object.freeze({ id: `cosa-in1-${line.line}`, from: values[0]!, to: values[1]!, value, routeLengthKm, rawValues: Object.freeze({ from: values[0]!, to: values[1]!, value: values[2]!, routeLengthKm: values[3]! }), recordAnchor: record }))
  }
  if (!knownPoints.length && !observations.length) diagnostics.push(diagnostic('invalid-known-point', 'COSA .in1 未解析出任何有效记录。', '确认文件为 COSA 水准输入并检查字段分隔符。', virtualAnchor()))
  if (!observations.length) diagnostics.push(diagnostic('invalid-height-difference', 'COSA .in1 未解析出有效测段观测。', '至少提供一条 from,to,height-difference(m),distance(km) 记录。', virtualAnchor()))
  return Object.freeze({ state: diagnostics.length ? 'blocked' as const : 'valid' as const, knownPoints: diagnostics.length ? Object.freeze([]) : Object.freeze(knownPoints), observations: diagnostics.length ? Object.freeze([]) : Object.freeze(observations), recordAnchors: Object.freeze(anchors), diagnostics: Object.freeze(diagnostics), mapping: savedMapping })
}
