/**
 * Strict physical lexer for Leica GSI-8 / GSI-16 text words.
 *
 * The public Leica TPS/GSI references consulted for this module inform only
 * the lexical shape implemented here: ASCII lines, whitespace-separated
 * words, a two-character WI, four information characters, a sign, and an
 * eight- or sixteen-character payload. They do not authorize an observation
 * mapping, unit conversion, adjustment eligibility, or registry integration.
 * Real, authorized vendor fixtures are still required before any later
 * semantic parser can be accepted.
 */

const UTF8 = new TextEncoder()
const ASCII = new TextDecoder('ascii', { fatal: true, ignoreBOM: true })
const MAX_RAW_SNIPPET_BYTES = 2_048
const MAX_GSI_WORD_BYTES = 256

export type LeicaGsiLexSource = string | Uint8Array

/** Physical payload width, before any value interpretation. */
export type LeicaGsiDataWidth = 8 | 16
export type LeicaGsiMode = 'gsi8' | 'gsi16'

export type LeicaGsiLexAnchor = Readonly<{
  id: string
  /** One-based physical source line. Blank lines retain their line numbers. */
  sourceRecord: number
  line: number
  column: number
  byteOffset: number
  byteLength: number
  rawOffset: number
  rawLength: number
  rawSnippet: string
}>

/** Exact source location of an individual physical GSI field. */
export type LeicaGsiLexField = Readonly<{
  raw: string
  line: number
  column: number
  byteOffset: number
  byteLength: number
  rawOffset: number
  rawLength: number
}>

type LeicaGsiWordBase = Readonly<{
  id: string
  sourceRecord: number
  line: number
  column: number
  wordIndex: number
  byteOffset: number
  byteLength: number
  rawOffset: number
  rawLength: number
  /** Complete original word lexeme; no parsed or normalised replacement. */
  rawLexeme: string
  anchor: LeicaGsiLexAnchor
  /** Two raw WI characters. The lexer deliberately assigns no business meaning. */
  wi: string
  rawWi: string
  /** Four raw information characters, preserved exactly and not decoded. */
  information: string
  rawInformation: string
  fields: Readonly<{
    wi: LeicaGsiLexField
    information: LeicaGsiLexField
  }>
}>

/**
 * A standard physical GSI word. `rawData` is opaque: it may be numeric or an
 * attribute-like payload. This module intentionally never calls `Number` on
 * it or derives a unit from the WI/information characters.
 */
export type LeicaGsiStandardWord = LeicaGsiWordBase & Readonly<{
  kind: 'standard'
  dataWidth: LeicaGsiDataWidth
  sign: '+' | '-'
  rawSign: '+' | '-'
  data: string
  rawData: string
  fields: LeicaGsiWordBase['fields'] & Readonly<{
    sign: LeicaGsiLexField
    data: LeicaGsiLexField
  }>
}>

/** A raw signed component in the special lexical WI51 form. */
export type LeicaGsiWi51Component = Readonly<{
  rawSign: '+' | '-'
  rawData: string
  sign: '+' | '-'
  data: string
  fields: Readonly<{
    sign: LeicaGsiLexField
    data: LeicaGsiLexField
  }>
}>

/**
 * WI51 is represented separately because it can physically contain two
 * signed components (for example `51....+0220+002`). Their values remain
 * opaque strings; no measurement or attribute semantics are inferred.
 */
export type LeicaGsiWi51Word = LeicaGsiWordBase & Readonly<{
  kind: 'wi51'
  wi: '51'
  rawWi: '51'
  components: readonly [LeicaGsiWi51Component, LeicaGsiWi51Component]
}>

export type LeicaGsiLexWord = LeicaGsiStandardWord | LeicaGsiWi51Word

export type LeicaGsiLexRecord = Readonly<{
  id: string
  sourceRecord: number
  line: number
  byteOffset: number
  byteLength: number
  rawOffset: number
  rawLength: number
  /** Bounded diagnostic/audit excerpt of the complete physical line. */
  rawSnippet: string
  /** `*` was physically present before the first word on this line. */
  hasGsi16LineMarker: boolean
  marker?: LeicaGsiLexAnchor
  words: readonly LeicaGsiLexWord[]
}>

export type LeicaGsiLexDiagnosticCode =
  | 'empty-source'
  | 'non-ascii'
  | 'unsafe-control'
  | 'unsafe-line-separator'
  | 'unsafe-separator'
  | 'invalid-gsi16-marker'
  | 'truncated-word'
  | 'invalid-word'
  | 'illegal-character'
  | 'mixed-data-width'
  | 'data-width-undetermined'

export type LeicaGsiLexDiagnostic = Readonly<{
  code: LeicaGsiLexDiagnosticCode
  severity: 'blocking'
  recoverable: true
  message: string
  suggestedAction: string
  anchor: LeicaGsiLexAnchor
}>

export type LeicaGsiLexed = Readonly<{
  state: 'lexed'
  dataWidth: LeicaGsiDataWidth
  mode: LeicaGsiMode
  records: readonly LeicaGsiLexRecord[]
  words: readonly LeicaGsiLexWord[]
  diagnostics: readonly []
}>

export type LeicaGsiLexBlocked = Readonly<{
  /** A blocked result never exposes a prefix of words or records. */
  state: 'blocked'
  records: readonly []
  words: readonly []
  diagnostics: readonly LeicaGsiLexDiagnostic[]
}>

export type LeicaGsiLexResult = LeicaGsiLexed | LeicaGsiLexBlocked

type PhysicalLine = Readonly<{
  line: number
  start: number
  end: number
}>

type ProvisionalRecord = Readonly<{
  record: LeicaGsiLexRecord
  marker?: LeicaGsiLexAnchor
  words: readonly LeicaGsiLexWord[]
}>

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function rawSnippet(bytes: Uint8Array, start: number, end: number): string {
  return ASCII.decode(bytes.subarray(start, Math.min(end, start + MAX_RAW_SNIPPET_BYTES)))
}

function sourceAnchor(
  bytes: Uint8Array,
  line: number,
  column: number,
  byteOffset: number,
  byteLength: number,
  id: string,
  snippetStart = byteOffset,
  snippetEnd = byteOffset + byteLength
): LeicaGsiLexAnchor {
  return Object.freeze({
    id,
    sourceRecord: line,
    line,
    column,
    byteOffset,
    byteLength,
    rawOffset: byteOffset,
    rawLength: byteLength,
    rawSnippet: rawSnippet(bytes, snippetStart, snippetEnd)
  })
}

function field(bytes: Uint8Array, line: number, lineStart: number, start: number, end: number): LeicaGsiLexField {
  return Object.freeze({
    raw: ASCII.decode(bytes.subarray(start, end)),
    line,
    column: start - lineStart + 1,
    byteOffset: start,
    byteLength: end - start,
    rawOffset: start,
    rawLength: end - start
  })
}

function diagnostic(
  code: LeicaGsiLexDiagnosticCode,
  message: string,
  suggestedAction: string,
  anchor: LeicaGsiLexAnchor
): LeicaGsiLexDiagnostic {
  return Object.freeze({ code, severity: 'blocking' as const, recoverable: true as const, message, suggestedAction, anchor })
}

function blocked(diagnosticValue: LeicaGsiLexDiagnostic): LeicaGsiLexBlocked {
  return Object.freeze({
    state: 'blocked' as const,
    records: Object.freeze([]) as readonly [],
    words: Object.freeze([]) as readonly [],
    diagnostics: Object.freeze([diagnosticValue])
  })
}

function isHorizontalWhitespace(value: number): boolean {
  return value === 0x20 || value === 0x09
}

function isAsciiDigit(value: number): boolean {
  return value >= 0x30 && value <= 0x39
}

/** Non-numeric data remains opaque but must use the documented safe token alphabet. */
function isPayloadCharacter(value: number): boolean {
  return isAsciiDigit(value)
    || (value >= 0x41 && value <= 0x5a)
    || (value >= 0x61 && value <= 0x7a)
    || value === 0x2e // .
    || value === 0x5f // _
    || value === 0x3f // ? (vendor-exported unknown/placeholder value)
}

function isSign(value: number): value is 0x2b | 0x2d {
  return value === 0x2b || value === 0x2d
}

function positionFor(bytes: Uint8Array, offset: number): Readonly<{ line: number; column: number }> {
  let line = 1
  let lineStart = 0
  let index = 0
  while (index < offset) {
    const value = bytes[index]
    if (value === 0x0d) {
      line += 1
      index += 1
      if (bytes[index] === 0x0a) index += 1
      lineStart = index
      continue
    }
    if (value === 0x0a) {
      line += 1
      lineStart = index + 1
    }
    index += 1
  }
  return Object.freeze({ line, column: offset - lineStart + 1 })
}

function preflightTransport(bytes: Uint8Array): LeicaGsiLexDiagnostic | null {
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index]!
    if (value > 0x7e) {
      const position = positionFor(bytes, index)
      const hex = Array.from(bytes.subarray(index, Math.min(bytes.length, index + 16)))
        .map((item) => item.toString(16).padStart(2, '0'))
        .join('')
      const anchor = Object.freeze({
        ...sourceAnchor(bytes, position.line, position.column, index, 1, `leica-gsi-invalid-byte-${index}`, index, index),
        rawSnippet: `hex:${hex}`
      })
      return diagnostic(
        'non-ascii',
        'Leica GSI 物理词法层仅接受 7-bit ASCII 字节；源文件含有非 ASCII 字节。',
        '请从仪器或外业软件重新导出 ASCII GSI 文件，并保留原始附件以便审计。',
        anchor
      )
    }
    if (value === 0x7f || (value < 0x20 && value !== 0x09 && value !== 0x0a && value !== 0x0d)) {
      const position = positionFor(bytes, index)
      return diagnostic(
        'unsafe-control',
        'Leica GSI 源文件含有不安全的控制字符；该字符不能作为字段或词之间的分隔符。',
        '仅使用空格或制表符分隔同一行 word，并使用 LF 或 CRLF 结束记录。',
        sourceAnchor(bytes, position.line, position.column, index, 1, `leica-gsi-control-${index}`)
      )
    }
  }
  return null
}

function physicalLines(bytes: Uint8Array): readonly PhysicalLine[] {
  const lines: PhysicalLine[] = []
  let start = 0
  let line = 1
  for (let index = 0; index < bytes.length; index += 1) {
    const separator = bytes[index]
    if (separator !== 0x0a && separator !== 0x0d) continue
    const end = index
    lines.push(Object.freeze({ line, start, end }))
    // CRLF is one physical line ending; consume LF after recording the CR.
    if (separator === 0x0d && bytes[index + 1] === 0x0a) index += 1
    start = index + 1
    line += 1
  }
  if (start < bytes.length) lines.push(Object.freeze({ line, start, end: bytes.length }))
  return freezeArray(lines)
}

function firstUnsafeDelimiter(bytes: Uint8Array, start: number, end: number): number | null {
  for (let index = start; index < end; index += 1) {
    const value = bytes[index]!
    // These are never legal GSI field bytes and frequently represent an
    // accidental CSV/pipe/semicolon separator. Do not resynchronise past one.
    if (value === 0x2c || value === 0x3b || value === 0x7c) return index
  }
  return null
}

function wordBase(
  bytes: Uint8Array,
  line: PhysicalLine,
  start: number,
  end: number,
  wordIndex: number
): LeicaGsiWordBase {
  const wi = field(bytes, line.line, line.start, start, start + 2)
  const information = field(bytes, line.line, line.start, start + 2, start + 6)
  const anchor = sourceAnchor(
    bytes,
    line.line,
    start - line.start + 1,
    start,
    end - start,
    `leica-gsi-word-${line.line}-${wordIndex}`
  )
  return Object.freeze({
    id: anchor.id,
    sourceRecord: line.line,
    line: line.line,
    column: start - line.start + 1,
    wordIndex,
    byteOffset: start,
    byteLength: end - start,
    rawOffset: start,
    rawLength: end - start,
    rawLexeme: ASCII.decode(bytes.subarray(start, end)),
    anchor,
    wi: wi.raw,
    rawWi: wi.raw,
    information: information.raw,
    rawInformation: information.raw,
    fields: Object.freeze({ wi, information })
  })
}

function invalidCharacterDiagnostic(
  bytes: Uint8Array,
  line: PhysicalLine,
  index: number,
  wordIndex: number,
  context: string
): LeicaGsiLexDiagnostic {
  const value = ASCII.decode(bytes.subarray(index, index + 1))
  return diagnostic(
    'illegal-character',
    `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 的${context}含有不允许的字符 ${JSON.stringify(value)}。`,
    '保留两位数字 WI、四位信息字符和安全的 ASCII 数据字符；不要使用内嵌符号或非 GSI 分隔符。',
    sourceAnchor(bytes, line.line, index - line.start + 1, index, 1, `leica-gsi-illegal-${line.line}-${wordIndex}-${index}`)
  )
}

function parseWi51(
  bytes: Uint8Array,
  line: PhysicalLine,
  start: number,
  end: number,
  wordIndex: number,
  base: LeicaGsiWordBase
): LeicaGsiWi51Word | LeicaGsiLexDiagnostic {
  const firstSign = start + 6
  let secondSign = -1
  for (let index = firstSign + 1; index < end; index += 1) {
    if (isSign(bytes[index]!)) {
      if (secondSign >= 0) {
        return diagnostic(
          'invalid-word',
          `Leica GSI WI51 第 ${line.line} 行第 ${wordIndex} 个 word 只能包含两个带符号组件。`,
          '将 WI51 写为四位信息字符后紧接两个完整的 sign+data 原始组件。',
          sourceAnchor(bytes, line.line, index - line.start + 1, index, 1, `leica-gsi-wi51-sign-${line.line}-${wordIndex}-${index}`)
        )
      }
      secondSign = index
    }
  }
  if (secondSign < 0) {
    return diagnostic(
      'invalid-word',
      `Leica GSI WI51 第 ${line.line} 行第 ${wordIndex} 个 word 缺少第二个带符号组件。`,
      '将 WI51 保留为两个完整的 sign+data 原始组件，或导出未经手工拼接的 GSI 文件。',
      base.anchor
    )
  }

  const firstDataStart = firstSign + 1
  const secondDataStart = secondSign + 1
  if (firstDataStart === secondSign || secondDataStart === end) {
    return diagnostic(
      'truncated-word',
      `Leica GSI WI51 第 ${line.line} 行第 ${wordIndex} 个 word 含有空的带符号组件。`,
      '补全两个 WI51 原始组件后重新导出；不要补写或猜测其业务含义。',
      base.anchor
    )
  }

  for (let index = firstDataStart; index < secondSign; index += 1) {
    if (!isPayloadCharacter(bytes[index]!)) return invalidCharacterDiagnostic(bytes, line, index, wordIndex, 'WI51 第一组件')
  }
  for (let index = secondDataStart; index < end; index += 1) {
    if (!isPayloadCharacter(bytes[index]!)) return invalidCharacterDiagnostic(bytes, line, index, wordIndex, 'WI51 第二组件')
  }

  const firstSignField = field(bytes, line.line, line.start, firstSign, firstSign + 1)
  const firstDataField = field(bytes, line.line, line.start, firstDataStart, secondSign)
  const secondSignField = field(bytes, line.line, line.start, secondSign, secondSign + 1)
  const secondDataField = field(bytes, line.line, line.start, secondDataStart, end)
  const first: LeicaGsiWi51Component = Object.freeze({
    rawSign: firstSignField.raw as '+' | '-',
    rawData: firstDataField.raw,
    sign: firstSignField.raw as '+' | '-',
    data: firstDataField.raw,
    fields: Object.freeze({ sign: firstSignField, data: firstDataField })
  })
  const second: LeicaGsiWi51Component = Object.freeze({
    rawSign: secondSignField.raw as '+' | '-',
    rawData: secondDataField.raw,
    sign: secondSignField.raw as '+' | '-',
    data: secondDataField.raw,
    fields: Object.freeze({ sign: secondSignField, data: secondDataField })
  })
  return Object.freeze({ ...base, kind: 'wi51' as const, wi: '51' as const, rawWi: '51' as const, components: Object.freeze([first, second]) as readonly [LeicaGsiWi51Component, LeicaGsiWi51Component] })
}

function parseWord(
  bytes: Uint8Array,
  line: PhysicalLine,
  start: number,
  end: number,
  wordIndex: number
): LeicaGsiLexWord | LeicaGsiLexDiagnostic {
  const length = end - start
  const unsafeDelimiter = firstUnsafeDelimiter(bytes, start, end)
  if (unsafeDelimiter !== null) {
    return diagnostic(
      'unsafe-separator',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 使用了非安全分隔符。`,
      '同一行的 word 只能用空格或制表符分隔；不要使用逗号、分号或竖线。',
      sourceAnchor(bytes, line.line, unsafeDelimiter - line.start + 1, unsafeDelimiter, 1, `leica-gsi-separator-${line.line}-${wordIndex}-${unsafeDelimiter}`)
    )
  }
  if (length > MAX_GSI_WORD_BYTES) {
    return diagnostic(
      'invalid-word',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 超过物理词法层的安全长度。`,
      '检查是否缺少空格或制表符分隔符，并从仪器重新导出原始 GSI 文件。',
      sourceAnchor(bytes, line.line, start - line.start + 1, start, Math.min(length, MAX_GSI_WORD_BYTES), `leica-gsi-overlong-${line.line}-${wordIndex}`)
    )
  }
  if (length < 7) {
    return diagnostic(
      'truncated-word',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 在 WI、信息字符或 sign 之前截断。`,
      '每个 word 必须包含两位 WI、四位信息字符和一个 sign。',
      sourceAnchor(bytes, line.line, start - line.start + 1, start, length, `leica-gsi-truncated-${line.line}-${wordIndex}`)
    )
  }
  // The fixed GSI grammar is WI(2) + information(4) + sign + payload.
  // Do not infer a three-digit WI from a value such as `331.08+...`: this is
  // the valid two-digit WI=33 with information `1.08`, used by real exports.
  if (!isAsciiDigit(bytes[start]!) || !isAsciiDigit(bytes[start + 1]!)) {
    return diagnostic(
      'invalid-word',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 的 WI 必须恰好为两位 ASCII 数字。`,
      '修正或重新导出该 word；不要将属性名称放在 WI 位置。',
      sourceAnchor(bytes, line.line, start - line.start + 1, start, 2, `leica-gsi-wi-${line.line}-${wordIndex}`)
    )
  }
  for (let index = start + 2; index < start + 6; index += 1) {
    if (!isPayloadCharacter(bytes[index]!)) return invalidCharacterDiagnostic(bytes, line, index, wordIndex, '信息字符')
  }
  if (!isSign(bytes[start + 6]!)) {
    return diagnostic(
      'invalid-word',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 在四位信息字符后缺少 + 或 - sign。`,
      '在信息字符后保留原始的单个 + 或 - sign，不要省略或替换。',
      sourceAnchor(bytes, line.line, start + 6 - line.start + 1, start + 6, 1, `leica-gsi-sign-${line.line}-${wordIndex}`)
    )
  }

  const base = wordBase(bytes, line, start, end, wordIndex)
  // WI51 is a two-component field by definition. Never fall through to the
  // standard fixed-width parser for a single-component form.
  if (base.wi === '51') return parseWi51(bytes, line, start, end, wordIndex, base)

  const dataStart = start + 7
  const dataLength = end - dataStart
  if (dataLength < 8) {
    return diagnostic(
      'truncated-word',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 的数据字段少于 GSI8 所需的八个字符。`,
      '确认 word 没有截断，并保留完整的 GSI8 或 GSI16 原始数据字段。',
      base.anchor
    )
  }
  if (dataLength !== 8 && dataLength !== 16) {
    return diagnostic(
      'invalid-word',
      `Leica GSI 第 ${line.line} 行第 ${wordIndex} 个 word 的数据字段必须恰为 8 或 16 个字符。`,
      '检查是否把两个 word 粘连、遗漏了分隔符，或使用了未支持的导出方言。',
      base.anchor
    )
  }
  for (let index = dataStart; index < end; index += 1) {
    if (!isPayloadCharacter(bytes[index]!)) return invalidCharacterDiagnostic(bytes, line, index, wordIndex, '数据字段')
  }

  const sign = field(bytes, line.line, line.start, start + 6, start + 7)
  const data = field(bytes, line.line, line.start, dataStart, end)
  return Object.freeze({
    ...base,
    kind: 'standard' as const,
    dataWidth: dataLength as LeicaGsiDataWidth,
    sign: sign.raw as '+' | '-',
    rawSign: sign.raw as '+' | '-',
    data: data.raw,
    rawData: data.raw,
    fields: Object.freeze({ ...base.fields, sign, data })
  })
}

function lexLine(bytes: Uint8Array, line: PhysicalLine): ProvisionalRecord | LeicaGsiLexDiagnostic | null {
  let cursor = line.start
  while (cursor < line.end && isHorizontalWhitespace(bytes[cursor]!)) cursor += 1
  if (cursor === line.end) return null

  let marker: LeicaGsiLexAnchor | undefined
  if (bytes[cursor] === 0x2a) {
    marker = sourceAnchor(bytes, line.line, cursor - line.start + 1, cursor, 1, `leica-gsi-marker-${line.line}`)
    cursor += 1
    if (cursor === line.end || isHorizontalWhitespace(bytes[cursor]!)) {
      return diagnostic(
        'invalid-gsi16-marker',
        `Leica GSI 第 ${line.line} 行的 * 标记必须直接紧贴该行的第一个 GSI16 word。`,
        '将 * 放在行首第一个 word 前且不要单独分隔，或删除错误的 * 标记。',
        marker
      )
    }
  }

  const words: LeicaGsiLexWord[] = []
  while (cursor < line.end) {
    if (bytes[cursor] === 0x2a) {
      return diagnostic(
        'invalid-gsi16-marker',
        `Leica GSI 第 ${line.line} 行的 * 只能作为行首 GSI16 标记出现一次。`,
        '删除行中间或数据字段中的 *，并只在需要时放在第一个 GSI16 word 之前。',
        sourceAnchor(bytes, line.line, cursor - line.start + 1, cursor, 1, `leica-gsi-marker-${line.line}-${cursor}`)
      )
    }
    const wordStart = cursor
    while (cursor < line.end && !isHorizontalWhitespace(bytes[cursor]!)) cursor += 1
    const word = parseWord(bytes, line, wordStart, cursor, words.length + 1)
    if ('code' in word) return word
    words.push(word)
    while (cursor < line.end && isHorizontalWhitespace(bytes[cursor]!)) cursor += 1
  }

  const record: LeicaGsiLexRecord = Object.freeze({
    id: `leica-gsi-record-${line.line}`,
    sourceRecord: line.line,
    line: line.line,
    byteOffset: line.start,
    byteLength: line.end - line.start,
    rawOffset: line.start,
    rawLength: line.end - line.start,
    rawSnippet: rawSnippet(bytes, line.start, line.end),
    hasGsi16LineMarker: Boolean(marker),
    ...(marker ? { marker } : {}),
    words: freezeArray(words)
  })
  return Object.freeze({ record, ...(marker ? { marker } : {}), words: record.words })
}

/**
 * Lex an entire physical GSI source transactionally.
 *
 * Any lexical fault returns a typed blocking diagnostic and empty word/record
 * arrays. Callers must not attempt recovery by consuming a successful prefix.
 */
export function lexLeicaGsi(source: LeicaGsiLexSource): LeicaGsiLexResult {
  const bytes = typeof source === 'string' ? UTF8.encode(source) : source
  if (bytes.length === 0) {
    const anchor = Object.freeze({
      id: 'leica-gsi-empty', sourceRecord: 1, line: 1, column: 1, byteOffset: 0, byteLength: 0,
      rawOffset: 0, rawLength: 0, rawSnippet: ''
    }) satisfies LeicaGsiLexAnchor
    return blocked(diagnostic(
      'empty-source',
      'Leica GSI 文件为空，未找到任何物理 word。',
      '选择包含至少一个完整 GSI8 或 GSI16 word 的原始 ASCII 导出文件。',
      anchor
    ))
  }

  const transportFailure = preflightTransport(bytes)
  if (transportFailure) return blocked(transportFailure)

  const records: LeicaGsiLexRecord[] = []
  const words: LeicaGsiLexWord[] = []
  let firstWordAnchor: LeicaGsiLexAnchor | undefined
  let dataWidth: LeicaGsiDataWidth | undefined

  for (const line of physicalLines(bytes)) {
    const parsed = lexLine(bytes, line)
    if (!parsed) continue
    if ('code' in parsed) return blocked(parsed)
    records.push(parsed.record)
    for (const word of parsed.words) {
      words.push(word)
      if (!firstWordAnchor) firstWordAnchor = word.anchor
      if (word.kind !== 'standard') continue
      if (dataWidth !== undefined && dataWidth !== word.dataWidth) {
        return blocked(diagnostic(
          'mixed-data-width',
          `Leica GSI 文件混用了 GSI${dataWidth} 与 GSI${word.dataWidth} 数据字段宽度。`,
          '将不同 GSI 模式分别导出；每个附件只能包含一种数据字段宽度。',
          word.anchor
        ))
      }
      dataWidth = word.dataWidth
    }
  }

  if (!words.length || !firstWordAnchor) {
    const anchor = sourceAnchor(bytes, 1, 1, 0, Math.min(bytes.length, 1), 'leica-gsi-empty-lines')
    return blocked(diagnostic(
      'empty-source',
      'Leica GSI 文件只包含空白行，未找到任何物理 word。',
      '选择包含至少一个完整 GSI8 或 GSI16 word 的原始 ASCII 导出文件。',
      anchor
    ))
  }

  if (dataWidth === undefined) {
    return blocked(diagnostic(
      'data-width-undetermined',
      'Leica GSI 文件只包含 WI51 或其他宽度无关形式，无法安全确认其为 GSI8 还是 GSI16。',
      '在同一原始附件中保留至少一个完整的标准 GSI8/GSI16 word；行首 * 仅作为原始物理标记保留。',
      firstWordAnchor
    ))
  }

  return Object.freeze({
    state: 'lexed' as const,
    dataWidth,
    mode: dataWidth === 8 ? 'gsi8' as const : 'gsi16' as const,
    records: freezeArray(records),
    words: freezeArray(words),
    diagnostics: Object.freeze([]) as readonly []
  })
}
