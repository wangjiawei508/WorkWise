/**
 * Explicit, versioned column mappings for formats whose vendor field order has
 * not been authoritatively established. This module intentionally does not
 * contain a COSA .in1 or South DAT field preset: callers declare their own
 * fields and supply a persisted mapping before any record is exposed.
 */
export const COLUMN_MAPPING_SCHEME_SCHEMA_VERSION = 'survey-column-mapping/v1' as const

export const COLUMN_MAPPING_FORMAT_IDS = ['cosa-in1', 'south-dat'] as const
export type ColumnMappingFormatId = (typeof COLUMN_MAPPING_FORMAT_IDS)[number]

export const COLUMN_MAPPING_DELIMITERS = ['csv', 'csv-fullwidth-comma', 'whitespace'] as const
export type ColumnMappingDelimiter = (typeof COLUMN_MAPPING_DELIMITERS)[number]

export type ColumnMappingFieldDeclaration = Readonly<{
  /** A caller-owned semantic name; this module never supplies one by default. */
  readonly name: string
  readonly required: boolean
}>

export type ColumnMappingRequirements = Readonly<{
  readonly formatId: ColumnMappingFormatId
  readonly fields: readonly ColumnMappingFieldDeclaration[]
}>

export type ColumnMappingBinding = Readonly<{
  readonly field: string
  /** Zero-based source column index. */
  readonly columnIndex: number
}>

/**
 * JSON-persistable mapping document. `mappingId` identifies the reusable
 * scheme and `revision` changes when a saved scheme is revised.
 */
export type ColumnMappingScheme = Readonly<{
  readonly schemaVersion: typeof COLUMN_MAPPING_SCHEME_SCHEMA_VERSION
  readonly mappingId: string
  readonly revision: number
  readonly formatId: ColumnMappingFormatId
  readonly delimiter: ColumnMappingDelimiter
  readonly bindings: readonly ColumnMappingBinding[]
}>

export type ColumnMappingDiagnosticCode =
  | 'mapping-required'
  | 'invalid-mapping-json'
  | 'invalid-mapping-scheme'
  | 'unsupported-schema-version'
  | 'unsupported-format'
  | 'format-mismatch'
  | 'invalid-delimiter'
  | 'invalid-field-declaration'
  | 'duplicate-declared-field'
  | 'duplicate-mapped-field'
  | 'unknown-mapped-field'
  | 'missing-required-field'
  | 'invalid-column-index'
  | 'unknown-column'
  | 'invalid-source'
  | 'empty-source'
  | 'invalid-csv-record'
  | 'missing-required-value'

export type ColumnMappingDiagnostic = Readonly<{
  readonly code: ColumnMappingDiagnosticCode
  readonly severity: 'blocking'
  readonly message: string
  readonly suggestedAction: string
  /** One-based source line, when the issue belongs to a record. */
  readonly line?: number
  /** One-based character column, when it can be located. */
  readonly column?: number
}>

export type ColumnMappingSchemeValidationResult =
  | Readonly<{
    readonly status: 'valid'
    readonly scheme: ColumnMappingScheme
    readonly diagnostics: readonly []
  }>
  | Readonly<{
    readonly status: 'blocked'
    readonly diagnostics: readonly ColumnMappingDiagnostic[]
  }>

export type MappedSurveyColumnRecord = Readonly<{
  /** One-based source line. */
  readonly line: number
  /** Exact source line, excluding its line terminator. */
  readonly raw: string
  /** Caller-declared field names mapped to their source text values. */
  readonly fields: Readonly<Record<string, string>>
}>

export type MapSurveyColumnRecordsResult =
  | Readonly<{
    readonly status: 'mapped'
    readonly scheme: ColumnMappingScheme
    readonly records: readonly MappedSurveyColumnRecord[]
    readonly diagnostics: readonly []
  }>
  | Readonly<{
    readonly status: 'blocked'
    readonly records: readonly []
    readonly diagnostics: readonly ColumnMappingDiagnostic[]
  }>

type NormalizedRequirements = Readonly<{
  readonly formatId: ColumnMappingFormatId
  readonly fieldsByName: ReadonlyMap<string, ColumnMappingFieldDeclaration>
}>

type ParsedCell = Readonly<{
  readonly value: string
  readonly column: number
}>

type ParsedLine = Readonly<{
  readonly line: number
  readonly raw: string
  readonly cells: readonly ParsedCell[]
}>

type RequirementsValidation =
  | Readonly<{ readonly status: 'valid'; readonly requirements: NormalizedRequirements }>
  | Readonly<{ readonly status: 'blocked'; readonly diagnostics: readonly ColumnMappingDiagnostic[] }>

type MappingInputDecode =
  | Readonly<{ readonly status: 'valid'; readonly mapping: Record<string, unknown> }>
  | Readonly<{ readonly status: 'blocked'; readonly diagnostics: readonly ColumnMappingDiagnostic[] }>

type ParsedLineMappingResult =
  | Readonly<{ readonly status: 'mapped'; readonly record: MappedSurveyColumnRecord }>
  | Readonly<{ readonly status: 'blocked'; readonly diagnostics: readonly ColumnMappingDiagnostic[] }>

function diagnostic(
  code: ColumnMappingDiagnosticCode,
  message: string,
  suggestedAction: string,
  location: Readonly<{ line?: number; column?: number }> = {}
): ColumnMappingDiagnostic {
  return Object.freeze({
    code,
    severity: 'blocking' as const,
    message,
    suggestedAction,
    ...location
  })
}

function blocked(diagnostics: readonly ColumnMappingDiagnostic[]): ColumnMappingSchemeValidationResult {
  return Object.freeze({
    status: 'blocked' as const,
    diagnostics: Object.freeze([...diagnostics])
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFormatId(value: unknown): value is ColumnMappingFormatId {
  return typeof value === 'string' && (COLUMN_MAPPING_FORMAT_IDS as readonly string[]).includes(value)
}

function isDelimiter(value: unknown): value is ColumnMappingDelimiter {
  return typeof value === 'string' && (COLUMN_MAPPING_DELIMITERS as readonly string[]).includes(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim()
}

function validateRequirements(requirements: ColumnMappingRequirements): RequirementsValidation {
  const diagnostics: ColumnMappingDiagnostic[] = []
  if (!isObject(requirements) || !isFormatId(requirements.formatId)) {
    diagnostics.push(diagnostic(
      'unsupported-format',
      'The mapping request must name a supported, explicit format identifier.',
      'Choose cosa-in1 or south-dat and declare the fields required by the caller.'
    ))
    return Object.freeze({ status: 'blocked' as const, diagnostics: Object.freeze(diagnostics) })
  }

  if (!Array.isArray(requirements.fields) || requirements.fields.length === 0) {
    diagnostics.push(diagnostic(
      'invalid-field-declaration',
      'At least one caller-declared field is required; this module has no default field layout.',
      'Declare every field that the consuming parser requires before applying a mapping.'
    ))
    return Object.freeze({ status: 'blocked' as const, diagnostics: Object.freeze(diagnostics) })
  }

  const fieldsByName = new Map<string, ColumnMappingFieldDeclaration>()
  for (const declaration of requirements.fields) {
    if (!isObject(declaration) || !isNonBlankString(declaration.name) || typeof declaration.required !== 'boolean') {
      diagnostics.push(diagnostic(
        'invalid-field-declaration',
        'Each caller-declared field needs an exact non-empty name and an explicit required boolean.',
        'Correct the caller field declaration instead of relying on an inferred field layout.'
      ))
      continue
    }

    if (fieldsByName.has(declaration.name)) {
      diagnostics.push(diagnostic(
        'duplicate-declared-field',
        `The caller declared field "${declaration.name}" more than once.`,
        'Keep one declaration per semantic field before applying the mapping.'
      ))
      continue
    }

    fieldsByName.set(declaration.name, Object.freeze({
      name: declaration.name,
      required: declaration.required
    }))
  }

  if (diagnostics.length > 0) return Object.freeze({ status: 'blocked' as const, diagnostics: Object.freeze(diagnostics) })
  return Object.freeze({
    status: 'valid' as const,
    requirements: Object.freeze({ formatId: requirements.formatId, fieldsByName })
  })
}

function decodeMappingInput(input: unknown): MappingInputDecode {
  if (input === undefined || input === null) {
    return Object.freeze({
      status: 'blocked' as const,
      diagnostics: Object.freeze([diagnostic(
        'mapping-required',
        'No column mapping is available for this format.',
        'Configure and save an explicit column mapping before importing this file.'
      )])
    })
  }

  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input)
      if (isObject(parsed)) return Object.freeze({ status: 'valid' as const, mapping: parsed })
    } catch {
      return Object.freeze({
        status: 'blocked' as const,
        diagnostics: Object.freeze([diagnostic(
          'invalid-mapping-json',
          'The saved column mapping is not valid JSON.',
          'Repair or reselect the saved mapping scheme, then retry the import.'
        )])
      })
    }

    return Object.freeze({
      status: 'blocked' as const,
      diagnostics: Object.freeze([diagnostic(
        'invalid-mapping-scheme',
        'The saved mapping JSON must describe one mapping object.',
        'Select a valid saved mapping scheme or create a new explicit mapping.'
      )])
    })
  }

  if (isObject(input)) return Object.freeze({ status: 'valid' as const, mapping: input })
  return Object.freeze({
    status: 'blocked' as const,
    diagnostics: Object.freeze([diagnostic(
      'invalid-mapping-scheme',
      'The column mapping must be a JSON object or a persisted JSON string.',
      'Select a valid saved mapping scheme or create a new explicit mapping.'
    )])
  })
}

/**
 * Validates untrusted persisted JSON without applying it to source records.
 * A blocked result always includes a concrete recovery action and never fills
 * in a delimiter, field name, or column position on the caller's behalf.
 */
export function validateColumnMappingScheme(
  input: unknown,
  requirements: ColumnMappingRequirements
): ColumnMappingSchemeValidationResult {
  const requirementsValidation = validateRequirements(requirements)
  if (requirementsValidation.status === 'blocked') return blocked(requirementsValidation.diagnostics)
  const normalizedRequirements = requirementsValidation.requirements

  const mappingInput = decodeMappingInput(input)
  if (mappingInput.status === 'blocked') return blocked(mappingInput.diagnostics)
  const decoded = mappingInput.mapping

  const diagnostics: ColumnMappingDiagnostic[] = []
  if (decoded.schemaVersion !== COLUMN_MAPPING_SCHEME_SCHEMA_VERSION) {
    diagnostics.push(diagnostic(
      'unsupported-schema-version',
      `Expected mapping schema version ${COLUMN_MAPPING_SCHEME_SCHEMA_VERSION}.`,
      'Migrate or recreate the saved mapping with the supported schema version.'
    ))
  }
  if (!isNonBlankString(decoded.mappingId)) {
    diagnostics.push(diagnostic(
      'invalid-mapping-scheme',
      'The mapping needs a non-empty mappingId so it can be saved and reused.',
      'Assign a stable mappingId before saving the mapping scheme.'
    ))
  }
  if (!Number.isSafeInteger(decoded.revision) || (decoded.revision as number) < 1) {
    diagnostics.push(diagnostic(
      'invalid-mapping-scheme',
      'The mapping revision must be a positive safe integer.',
      'Set revision to 1 or increment it when revising a saved mapping.'
    ))
  }
  if (!isFormatId(decoded.formatId)) {
    diagnostics.push(diagnostic(
      'unsupported-format',
      'The mapping names an unsupported format identifier.',
      'Use an explicit supported format identifier instead of a guessed format.'
    ))
  } else if (decoded.formatId !== normalizedRequirements.formatId) {
    diagnostics.push(diagnostic(
      'format-mismatch',
      `The saved mapping is for ${decoded.formatId}, not ${normalizedRequirements.formatId}.`,
      'Select a mapping saved for the detected format or create a new mapping for it.'
    ))
  }
  if (!isDelimiter(decoded.delimiter)) {
    diagnostics.push(diagnostic(
      'invalid-delimiter',
      'The mapping delimiter must be exactly "csv", "csv-fullwidth-comma" or "whitespace".',
      'Choose the source record delimiter explicitly; automatic delimiter guessing is disabled.'
    ))
  }
  if (!Array.isArray(decoded.bindings) || decoded.bindings.length === 0) {
    diagnostics.push(diagnostic(
      'invalid-mapping-scheme',
      'The mapping needs at least one explicit field-to-column binding.',
      'Add explicit bindings for the caller-declared fields before importing.'
    ))
  }

  const bindings: ColumnMappingBinding[] = []
  const boundFieldNames = new Set<string>()
  if (Array.isArray(decoded.bindings)) {
    for (const binding of decoded.bindings) {
      if (!isObject(binding) || !isNonBlankString(binding.field)) {
        diagnostics.push(diagnostic(
          'invalid-mapping-scheme',
          'Each mapping binding needs an exact non-empty field name.',
          'Correct the binding field names and save the mapping again.'
        ))
        continue
      }
      if (!Number.isSafeInteger(binding.columnIndex) || (binding.columnIndex as number) < 0) {
        diagnostics.push(diagnostic(
          'invalid-column-index',
          `Field "${binding.field}" has an invalid zero-based column index.`,
          'Use a non-negative integer column index from the source record.'
        ))
        continue
      }
      if (boundFieldNames.has(binding.field)) {
        diagnostics.push(diagnostic(
          'duplicate-mapped-field',
          `Field "${binding.field}" is mapped more than once.`,
          'Keep one explicit source column per semantic field; do not rely on precedence.'
        ))
        continue
      }
      if (!normalizedRequirements.fieldsByName.has(binding.field)) {
        diagnostics.push(diagnostic(
          'unknown-mapped-field',
          `Field "${binding.field}" was not declared by the caller.`,
          'Declare the field in the caller requirements or remove this binding.'
        ))
        continue
      }

      boundFieldNames.add(binding.field)
      bindings.push(Object.freeze({
        field: binding.field,
        columnIndex: binding.columnIndex as number
      }))
    }
  }

  for (const declaration of normalizedRequirements.fieldsByName.values()) {
    if (declaration.required && !boundFieldNames.has(declaration.name)) {
      diagnostics.push(diagnostic(
        'missing-required-field',
        `Required field "${declaration.name}" has no source column mapping.`,
        'Map every caller-required field explicitly before importing.'
      ))
    }
  }

  if (diagnostics.length > 0) return blocked(diagnostics)

  return Object.freeze({
    status: 'valid' as const,
    scheme: Object.freeze({
      schemaVersion: COLUMN_MAPPING_SCHEME_SCHEMA_VERSION,
      mappingId: decoded.mappingId as string,
      revision: decoded.revision as number,
      formatId: decoded.formatId as ColumnMappingFormatId,
      delimiter: decoded.delimiter as ColumnMappingDelimiter,
      bindings: Object.freeze(bindings)
    }),
    diagnostics: Object.freeze([]) as readonly []
  })
}

/** Returns a stable JSON document suitable for a caller-owned persistence layer. */
export function serializeColumnMappingScheme(scheme: ColumnMappingScheme): string {
  return JSON.stringify({
    schemaVersion: scheme.schemaVersion,
    mappingId: scheme.mappingId,
    revision: scheme.revision,
    formatId: scheme.formatId,
    delimiter: scheme.delimiter,
    bindings: scheme.bindings.map((binding) => ({
      field: binding.field,
      columnIndex: binding.columnIndex
    }))
  })
}

function parseCsvLine(raw: string, line: number, delimiter: ',' | '，' = ','): ParsedLine | ColumnMappingDiagnostic {
  const cells: ParsedCell[] = []
  let cursor = 0

  while (cursor <= raw.length) {
    const fieldStart = cursor
    if (cursor === raw.length) {
      cells.push(Object.freeze({ value: '', column: fieldStart + 1 }))
      break
    }

    if (raw[cursor] === '"') {
      cursor += 1
      let value = ''
      let closed = false
      while (cursor < raw.length) {
        if (raw[cursor] !== '"') {
          value += raw[cursor]
          cursor += 1
          continue
        }

        if (raw[cursor + 1] === '"') {
          value += '"'
          cursor += 2
          continue
        }

        closed = true
        cursor += 1
        break
      }

      if (!closed) {
        return diagnostic(
          'invalid-csv-record',
          'A quoted CSV field is not closed before the end of the line.',
          'Close the quoted field on the same source line or correct the source export.',
          { line, column: fieldStart + 1 }
        )
      }
      if (cursor < raw.length && raw[cursor] !== delimiter) {
        return diagnostic(
          'invalid-csv-record',
          'Only a comma or end-of-line may follow a closing CSV quote.',
          'Remove trailing characters after the quoted field or export strict CSV.',
          { line, column: cursor + 1 }
        )
      }
      cells.push(Object.freeze({ value, column: fieldStart + 1 }))
    } else {
      const valueStart = cursor
      while (cursor < raw.length && raw[cursor] !== delimiter) {
        if (raw[cursor] === '"') {
          return diagnostic(
            'invalid-csv-record',
            'A CSV quote must begin at the start of a field.',
            'Use strict CSV quoting or remove the unexpected quote from the source record.',
            { line, column: cursor + 1 }
          )
        }
        cursor += 1
      }
      cells.push(Object.freeze({ value: raw.slice(valueStart, cursor), column: valueStart + 1 }))
    }

    if (cursor === raw.length) break
    cursor += 1
  }

  return Object.freeze({ line, raw, cells: Object.freeze(cells) })
}

function parseWhitespaceLine(raw: string, line: number): ParsedLine {
  const cells: ParsedCell[] = []
  for (const match of raw.matchAll(/[^\s]+/gu)) {
    cells.push(Object.freeze({ value: match[0], column: (match.index ?? 0) + 1 }))
  }
  return Object.freeze({ line, raw, cells: Object.freeze(cells) })
}

function mapParsedLine(
  parsed: ParsedLine,
  scheme: ColumnMappingScheme,
  requirements: NormalizedRequirements
): ParsedLineMappingResult {
  const diagnostics: ColumnMappingDiagnostic[] = []
  const fields = Object.create(null) as Record<string, string>
  const mappedColumnIndexes = new Set(scheme.bindings.map((binding) => binding.columnIndex))

  for (const [columnIndex, cell] of parsed.cells.entries()) {
    if (mappedColumnIndexes.has(columnIndex)) continue
    diagnostics.push(diagnostic(
      'unknown-column',
      `Source column ${columnIndex} is not represented by the explicit mapping.`,
      'Declare an optional caller field for this column or correct the source layout before importing.',
      { line: parsed.line, column: cell.column }
    ))
  }

  for (const binding of scheme.bindings) {
    const cell = parsed.cells[binding.columnIndex]
    if (!cell) {
      diagnostics.push(diagnostic(
        'unknown-column',
        `Field "${binding.field}" maps to column ${binding.columnIndex}, which is absent from this record.`,
        'Correct the saved column index or select a file with the same record layout.',
        { line: parsed.line, column: parsed.raw.length + 1 }
      ))
      continue
    }

    const declaration = requirements.fieldsByName.get(binding.field)
    if (declaration?.required && cell.value.trim().length === 0) {
      diagnostics.push(diagnostic(
        'missing-required-value',
        `Required field "${binding.field}" is blank on this source record.`,
        'Provide a value for the required source field or correct the mapping before importing.',
        { line: parsed.line, column: cell.column }
      ))
      continue
    }

    fields[binding.field] = cell.value
  }

  if (diagnostics.length > 0) {
    return Object.freeze({
      status: 'blocked' as const,
      diagnostics: Object.freeze(diagnostics)
    })
  }
  return Object.freeze({
    status: 'mapped' as const,
    record: Object.freeze({
      line: parsed.line,
      raw: parsed.raw,
      fields: Object.freeze(fields)
    })
  })
}

/**
 * Parses explicitly-delimited records and applies a validated column scheme.
 * It is transactional: any blocking diagnostic returns no mapped records, so a
 * caller cannot accidentally pass a partial or guessed mapping downstream.
 */
export function mapSurveyColumnRecords(
  source: string,
  requirements: ColumnMappingRequirements,
  mapping?: unknown
): MapSurveyColumnRecordsResult {
  const validation = validateColumnMappingScheme(mapping, requirements)
  if (validation.status === 'blocked') {
    return Object.freeze({
      status: 'blocked' as const,
      records: Object.freeze([]) as readonly [],
      diagnostics: validation.diagnostics
    })
  }

  if (typeof source !== 'string') {
    return Object.freeze({
      status: 'blocked' as const,
      records: Object.freeze([]) as readonly [],
      diagnostics: Object.freeze([diagnostic(
        'invalid-source',
        'Column-mapped source data must be text.',
        'Decode the source file to verified text before applying the saved mapping.'
      )])
    })
  }

  const parseDiagnostics: ColumnMappingDiagnostic[] = []
  const parsedLines: ParsedLine[] = []
  for (const [index, raw] of source.split(/\r\n|\n|\r/u).entries()) {
    if (raw.trim().length === 0) continue
    const line = index + 1
    const parsed = validation.scheme.delimiter === 'csv' || validation.scheme.delimiter === 'csv-fullwidth-comma'
      ? parseCsvLine(raw, line, validation.scheme.delimiter === 'csv-fullwidth-comma' ? '，' : ',')
      : parseWhitespaceLine(raw, line)
    if ('code' in parsed) {
      parseDiagnostics.push(parsed)
    } else {
      parsedLines.push(parsed)
    }
  }

  if (parsedLines.length === 0 && parseDiagnostics.length === 0) {
    parseDiagnostics.push(diagnostic(
      'empty-source',
      'The source contains no non-blank records to map.',
      'Select a source file with records after confirming its delimiter and mapping.'
    ))
  }
  if (parseDiagnostics.length > 0) {
    return Object.freeze({
      status: 'blocked' as const,
      records: Object.freeze([]) as readonly [],
      diagnostics: Object.freeze(parseDiagnostics)
    })
  }

  const records: MappedSurveyColumnRecord[] = []
  const mappingDiagnostics: ColumnMappingDiagnostic[] = []
  const requirementsValidation = validateRequirements(requirements)
  if (requirementsValidation.status === 'blocked') {
    return Object.freeze({
      status: 'blocked' as const,
      records: Object.freeze([]) as readonly [],
      diagnostics: requirementsValidation.diagnostics
    })
  }

  for (const parsed of parsedLines) {
    const lineMapping = mapParsedLine(parsed, validation.scheme, requirementsValidation.requirements)
    if (lineMapping.status === 'blocked') {
      mappingDiagnostics.push(...lineMapping.diagnostics)
    } else {
      records.push(lineMapping.record)
    }
  }

  if (mappingDiagnostics.length > 0) {
    return Object.freeze({
      status: 'blocked' as const,
      records: Object.freeze([]) as readonly [],
      diagnostics: Object.freeze(mappingDiagnostics)
    })
  }

  return Object.freeze({
    status: 'mapped' as const,
    scheme: validation.scheme,
    records: Object.freeze(records),
    diagnostics: Object.freeze([]) as readonly []
  })
}
