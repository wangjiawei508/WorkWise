import { describe, expect, it } from 'vitest'
import { SurveyFormatIdV1, SurveySourceFileCreateV1, SurveySourceFileV1 } from './survey.js'

const HASH = 'a'.repeat(64)
const PARSER_HASH = 'b'.repeat(64)

function source(overrides: Record<string, unknown> = {}) {
  const record = {
    id: 'record-1', sourceRecord: 1, line: 1,
    byteOffset: 0, byteLength: 128,
    rawOffset: 0, rawLength: 128, rawLineNo: 1,
    rawSnippet: '1.768,1,1'
  }
  return {
    schemaVersion: 1,
    sourcePath: `attachment://sha256/${HASH}/control.in2`,
    name: 'control.in2',
    size: 128,
    fileSize: 128,
    sha256: HASH,
    importedAt: '2026-09-04T00:00:00.000Z',
    importedBy: 'workwise:survey-format-registry',
    originalPreserved: true,
    formatId: 'cosa-in2',
    vendor: 'COSA(科傻)',
    formatVersion: null,
    detectionMethod: 'structural-probe',
    detectionConfidence: 0.98,
    extensionClaimed: '.in2',
    extensionContentConflict: false,
    requiresManualConfirmation: false,
    detection: {
      format: 'cosa-in2', vendor: 'COSA(科傻)', confidence: 0.98,
      extension: '.in2', matchedSignatures: ['COSA IN2 header'],
      extensionConflict: false, method: 'structural-probe'
    },
    disposition: 'adjustment-ready',
    dispositionReason: 'validated COSA source',
    parserId: 'cosa-in2-parser',
    parserVersion: '1.0.0',
    parserSourceHash: PARSER_HASH,
    linearUnitRaw: 'm',
    angularUnitRaw: 'arc-second',
    linearUnitCanonical: 'm',
    angularUnitCanonical: 'rad',
    datumDeclared: 'CGCS2000',
    heightSystemDeclared: '1985 National Height Datum',
    recordCount: 1,
    summary: { pointCount: 2, stationCount: 1, observationCount: 1, recordCount: 1, skippedRecordCount: 0 },
    diagnostics: [],
    records: [record],
    rawRecordAnchors: [record],
    preservedRawFields: { 'record-1:wi42': '420001+00000001' },
    ...overrides
  }
}

describe('SurveySourceFile A-01 contract', () => {
  it('reserves the Stage A P0 catalog IDs without registering parser behavior', () => {
    expect(SurveyFormatIdV1.options).toEqual(expect.arrayContaining([
      'cosa-in1', 'cosa-in2', 'cosa-net', 'cosa-ou1', 'cosa-ou2', 'south-dat'
    ]))
  })

  it('accepts P0 COSA and Leica-shaped source metadata with explicit source units', () => {
    const cosa = SurveySourceFileCreateV1.parse(source())
    expect(cosa).toMatchObject({ formatId: 'cosa-in2', detectionMethod: 'structural-probe', linearUnitRaw: 'm', angularUnitRaw: 'arc-second' })

    const gsiDetection = {
      format: 'leica-gsi8', vendor: 'Leica/Hexagon', confidence: 0.98,
      extension: '.gsi', matchedSignatures: ['GSI word index/sign/value'],
      extensionConflict: false, method: 'content-signature'
    }
    const gsi = SurveySourceFileCreateV1.parse(source({
      name: 'station.gsi',
      formatId: 'leica-gsi8',
      vendor: 'Leica/Hexagon',
      detectionMethod: 'content-signature',
      detectionConfidence: 0.98,
      extensionClaimed: '.gsi',
      detection: gsiDetection,
      parserId: 'leica-gsi-parser',
      linearUnitRaw: 'm',
      angularUnitRaw: 'deg'
    }))
    expect(gsi.preservedRawFields).toMatchObject({ 'record-1:wi42': '420001+00000001' })
  })

  it('rejects a ready source carrying a blocking diagnostic', () => {
    expect(SurveySourceFileCreateV1.safeParse(source({
      diagnostics: [{ code: 'invalid_record', severity: 'blocking', message: 'bad source record', recordAnchor: 'record-1' }]
    })).success).toBe(false)
  })

  it('requires explicit canonical m/rad evidence before a source may be adjustment-ready', () => {
    expect(SurveySourceFileCreateV1.safeParse(source({ linearUnitCanonical: 'unverified' })).success).toBe(false)
    expect(SurveySourceFileCreateV1.safeParse(source({ angularUnitCanonical: 'unverified' })).success).toBe(false)
    expect(SurveySourceFileCreateV1.safeParse(source({
      disposition: 'archive-only',
      linearUnitCanonical: 'unverified',
      angularUnitCanonical: 'unverified'
    })).success).toBe(true)
  })

  it('requires raw-unit provenance and rejects ad-hoc source-unit fields', () => {
    const { linearUnitRaw: _linearUnitRaw, angularUnitRaw: _angularUnitRaw, ...withoutRawUnits } = source()
    expect(SurveySourceFileCreateV1.safeParse(withoutRawUnits).success).toBe(false)
    expect(SurveySourceFileCreateV1.safeParse(source({ unit: 'm' })).success).toBe(false)
  })

  it('requires a low-confidence, manually confirmed non-ready extension fallback', () => {
    const fallbackDetection = {
      format: 'south-dat', vendor: 'South/南方测绘', confidence: 0.5,
      extension: '.dat', matchedSignatures: ['opaque vendor extension'],
      extensionConflict: false, method: 'extension-fallback'
    }
    const accepted = source({
      name: 'level.dat', formatId: 'south-dat', vendor: 'South/南方测绘',
      detectionMethod: 'extension-fallback', detectionConfidence: 0.5,
      extensionClaimed: '.dat', requiresManualConfirmation: true,
      detection: fallbackDetection, disposition: 'archive-only',
      dispositionReason: 'awaiting manual confirmation'
    })
    expect(SurveySourceFileCreateV1.safeParse(accepted).success).toBe(true)
    expect(SurveySourceFileCreateV1.safeParse({ ...accepted, disposition: 'adjustment-ready' }).success).toBe(false)
    expect(SurveySourceFileCreateV1.safeParse({ ...accepted, requiresManualConfirmation: false }).success).toBe(false)
    expect(SurveySourceFileCreateV1.safeParse({ ...accepted, detectionConfidence: 0.51 }).success).toBe(false)
  })

  it('requires both record aliases to agree on an in-file byte range', () => {
    const base = source()
    const contradictory = {
      ...base,
      rawRecordAnchors: [{ ...base.rawRecordAnchors[0], rawSnippet: 'different source bytes' }]
    }
    expect(SurveySourceFileCreateV1.safeParse(contradictory).success).toBe(false)

    const outOfRangeRecord = { ...base.records[0], rawLength: 129, byteLength: 129 }
    expect(SurveySourceFileCreateV1.safeParse({
      ...base,
      records: [outOfRangeRecord],
      rawRecordAnchors: [outOfRangeRecord]
    }).success).toBe(false)
  })

  it('does not mutate legacy input while enriching it for read compatibility', () => {
    const legacy = {
      schemaVersion: 1, name: 'legacy.gsi', size: 16, sha256: HASH, originalPreserved: true,
      detection: { format: 'leica-gsi8', vendor: 'Leica/Hexagon', confidence: 0.98, extension: '.gsi', matchedSignatures: ['GSI word index/sign/value'], extensionConflict: false },
      disposition: 'adjustment-ready', parserId: 'legacy-parser', parserVersion: '0.4.2', recordCount: 1,
      diagnostics: [], rawRecordAnchors: [{ id: 'record-1', sourceRecord: 1, line: 1 }]
    }
    const before = JSON.stringify(legacy)
    const parsed = SurveySourceFileV1.parse(legacy)
    expect(JSON.stringify(legacy)).toBe(before)
    expect(parsed).toMatchObject({
      sourcePath: `attachment://sha256/${HASH}`,
      fileSize: 16,
      linearUnitRaw: 'legacy-unknown',
      angularUnitRaw: 'legacy-unknown',
      linearUnitCanonical: 'unverified',
      angularUnitCanonical: 'unverified',
      records: [{ rawOffset: 0, rawLength: 0, rawLineNo: 1, rawSnippet: '' }]
    })
  })
})
