import { describe, expect, it } from 'vitest'
import {
  COLUMN_MAPPING_SCHEME_SCHEMA_VERSION,
  mapSurveyColumnRecords,
  serializeColumnMappingScheme,
  validateColumnMappingScheme,
  type ColumnMappingRequirements,
  type ColumnMappingScheme
} from './survey-column-mapping.js'

const in1Requirements: ColumnMappingRequirements = {
  formatId: 'cosa-in1',
  // Caller-owned synthetic names intentionally avoid claiming a COSA .in1 layout.
  fields: [
    { name: 'fieldA', required: true },
    { name: 'fieldB', required: true },
    { name: 'fieldC', required: true },
    { name: 'note', required: false }
  ]
}

const in1CsvScheme: ColumnMappingScheme = {
  schemaVersion: COLUMN_MAPPING_SCHEME_SCHEMA_VERSION,
  mappingId: 'synthetic-cosa-in1-four-column',
  revision: 1,
  formatId: 'cosa-in1',
  delimiter: 'csv',
  bindings: [
    { field: 'fieldA', columnIndex: 0 },
    { field: 'fieldB', columnIndex: 1 },
    { field: 'fieldC', columnIndex: 2 },
    { field: 'note', columnIndex: 3 }
  ]
}

describe('survey column mapping core', () => {
  it('round-trips a versioned saved scheme and reuses it without a built-in .in1 layout', () => {
    const saved = serializeColumnMappingScheme(in1CsvScheme)
    expect(JSON.parse(saved)).toMatchObject({
      schemaVersion: COLUMN_MAPPING_SCHEME_SCHEMA_VERSION,
      mappingId: 'synthetic-cosa-in1-four-column',
      revision: 1
    })

    const first = mapSurveyColumnRecords('P1,P2,1.250,first run\nP2,P3,-0.005,', in1Requirements, saved)
    const second = mapSurveyColumnRecords('P3,P4,0.010,reused', in1Requirements, saved)
    const quoted = mapSurveyColumnRecords('P1,"P,2",1.250,"note, retained"', in1Requirements, saved)

    expect(first.status).toBe('mapped')
    if (first.status !== 'mapped') return
    expect(first.scheme).toEqual(in1CsvScheme)
    expect(first.records).toEqual([
      { line: 1, raw: 'P1,P2,1.250,first run', fields: { fieldA: 'P1', fieldB: 'P2', fieldC: '1.250', note: 'first run' } },
      { line: 2, raw: 'P2,P3,-0.005,', fields: { fieldA: 'P2', fieldB: 'P3', fieldC: '-0.005', note: '' } }
    ])

    expect(second.status).toBe('mapped')
    if (second.status !== 'mapped') return
    expect(second.records[0]).toEqual({
      line: 1,
      raw: 'P3,P4,0.010,reused',
      fields: { fieldA: 'P3', fieldB: 'P4', fieldC: '0.010', note: 'reused' }
    })

    expect(quoted.status).toBe('mapped')
    if (quoted.status !== 'mapped') return
    expect(quoted.records[0]?.fields).toEqual({
      fieldA: 'P1', fieldB: 'P,2', fieldC: '1.250', note: 'note, retained'
    })
  })

  it('supports explicitly-selected whitespace records and reserves the same core for South DAT', () => {
    const datRequirements: ColumnMappingRequirements = {
      formatId: 'south-dat',
      fields: [
        { name: 'columnOne', required: true },
        { name: 'columnTwo', required: true },
        { name: 'columnThree', required: true }
      ]
    }
    const datScheme: ColumnMappingScheme = {
      schemaVersion: COLUMN_MAPPING_SCHEME_SCHEMA_VERSION,
      mappingId: 'synthetic-south-dat-three-column',
      revision: 3,
      formatId: 'south-dat',
      delimiter: 'whitespace',
      bindings: [
        { field: 'columnOne', columnIndex: 0 },
        { field: 'columnTwo', columnIndex: 1 },
        { field: 'columnThree', columnIndex: 2 }
      ]
    }

    const result = mapSurveyColumnRecords('\nA    B\tC\n', datRequirements, datScheme)
    expect(result.status).toBe('mapped')
    if (result.status !== 'mapped') return
    expect(result.records).toEqual([
      { line: 2, raw: 'A    B\tC', fields: { columnOne: 'A', columnTwo: 'B', columnThree: 'C' } }
    ])
  })

  it('blocks a missing scheme or a scheme that omits caller-required fields', () => {
    const missingScheme = mapSurveyColumnRecords('P1,P2,1.250', in1Requirements)
    expect(missingScheme).toMatchObject({ status: 'blocked', records: [] })
    expect(missingScheme.diagnostics).toContainEqual(expect.objectContaining({
      code: 'mapping-required',
      severity: 'blocking',
      suggestedAction: expect.any(String)
    }))

    const malformedSavedJson = validateColumnMappingScheme('{', in1Requirements)
    expect(malformedSavedJson.status).toBe('blocked')
    expect(malformedSavedJson.diagnostics).toContainEqual(expect.objectContaining({
      code: 'invalid-mapping-json',
      severity: 'blocking',
      suggestedAction: expect.any(String)
    }))

    const missingRequired = validateColumnMappingScheme({
      ...in1CsvScheme,
      bindings: in1CsvScheme.bindings.filter((binding) => binding.field !== 'fieldC')
    }, in1Requirements)
    expect(missingRequired.status).toBe('blocked')
    expect(missingRequired.diagnostics).toContainEqual(expect.objectContaining({
      code: 'missing-required-field',
      severity: 'blocking',
      suggestedAction: expect.any(String)
    }))
  })

  it('blocks duplicate fields, undeclared fields, invalid delimiters, and out-of-range columns', () => {
    const duplicateField = validateColumnMappingScheme({
      ...in1CsvScheme,
      bindings: [...in1CsvScheme.bindings, { field: 'fieldA', columnIndex: 4 }]
    }, in1Requirements)
    expect(duplicateField.status).toBe('blocked')
    expect(duplicateField.diagnostics).toContainEqual(expect.objectContaining({ code: 'duplicate-mapped-field', severity: 'blocking' }))

    const undeclaredField = validateColumnMappingScheme({
      ...in1CsvScheme,
      bindings: [...in1CsvScheme.bindings.slice(0, 3), { field: 'notDeclaredByCaller', columnIndex: 3 }]
    }, in1Requirements)
    expect(undeclaredField.status).toBe('blocked')
    expect(undeclaredField.diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown-mapped-field', severity: 'blocking' }))

    const invalidDelimiter = validateColumnMappingScheme({
      ...in1CsvScheme,
      delimiter: ';'
    }, in1Requirements)
    expect(invalidDelimiter.status).toBe('blocked')
    expect(invalidDelimiter.diagnostics).toContainEqual(expect.objectContaining({
      code: 'invalid-delimiter',
      severity: 'blocking',
      suggestedAction: expect.any(String)
    }))

    const unknownColumn = mapSurveyColumnRecords('P1,P2,1.250', in1Requirements, in1CsvScheme)
    expect(unknownColumn).toMatchObject({ status: 'blocked', records: [] })
    expect(unknownColumn.diagnostics).toContainEqual(expect.objectContaining({
      code: 'unknown-column',
      severity: 'blocking',
      line: 1,
      suggestedAction: expect.any(String)
    }))

    const extraColumn = mapSurveyColumnRecords('P1,P2,1.250,note,unexpected', in1Requirements, in1CsvScheme)
    expect(extraColumn).toMatchObject({ status: 'blocked', records: [] })
    expect(extraColumn.diagnostics).toContainEqual(expect.objectContaining({
      code: 'unknown-column',
      severity: 'blocking',
      line: 1,
      column: 18,
      suggestedAction: expect.any(String)
    }))
  })

  it('blocks blank required values and malformed CSV without returning partial records', () => {
    const blankRequired = mapSurveyColumnRecords('P1,,1.250,note', in1Requirements, in1CsvScheme)
    expect(blankRequired).toMatchObject({ status: 'blocked', records: [] })
    expect(blankRequired.diagnostics).toContainEqual(expect.objectContaining({
      code: 'missing-required-value',
      severity: 'blocking',
      line: 1,
      suggestedAction: expect.any(String)
    }))

    const malformedCsv = mapSurveyColumnRecords('P1,"P2,1.250,note', in1Requirements, in1CsvScheme)
    expect(malformedCsv).toMatchObject({ status: 'blocked', records: [] })
    expect(malformedCsv.diagnostics).toContainEqual(expect.objectContaining({
      code: 'invalid-csv-record',
      severity: 'blocking',
      line: 1,
      column: 4,
      suggestedAction: expect.any(String)
    }))
  })
})
