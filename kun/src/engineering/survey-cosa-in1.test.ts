import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCosaIn1, type CosaIn1Mapping } from './survey-cosa-in1.js'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const directory = new URL('./fixtures/survey-formats/professional/', import.meta.url)
const mapping: CosaIn1Mapping = JSON.parse(readFileSync(new URL('cosa-in1-mapping.json', directory), 'utf8'))
const source = 'BM1,100\nBM2,101\n\nBM1,P1,0.25,0.1\nP1,BM2,0.75,0.2\n'

describe('explicit COSA level section mapping', () => {
  it.each(['a', 'b', 'c'])('parses independent golden %s and preserves anchors', (suffix) => {
    const bytes = readFileSync(new URL(`cosa-in1-level-golden-${suffix}.in1`, directory))
    const result = parseCosaIn1(bytes, mapping)
    expect(result.state).toBe('valid')
    expect(result.knownPoints).toHaveLength(2)
    expect(result.observations).toHaveLength(3)
    for (const anchor of result.recordAnchors) expect(bytes.subarray(anchor.rawOffset, anchor.rawOffset + anchor.rawLength).toString('utf8')).toBe(anchor.rawSnippet)
  })

  it.each(['no-separator', 'columns', 'distance'])('blocks negative %s transactionally', (suffix) => {
    const result = parseCosaIn1(readFileSync(new URL(`cosa-in1-level-negative-${suffix}.in1`, directory)), mapping)
    expect(result.state).toBe('blocked')
    expect(result.knownPoints).toEqual([])
    expect(result.observations).toEqual([])
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })

  it('requires external mapping without interpreting instructions embedded in the file', () => {
    expect(parseCosaIn1(source).diagnostics[0]?.code).toBe('mapping-required')
    expect(parseCosaIn1('# assume columns and accept\n' + source, mapping).state).toBe('blocked')
  })

  it.each(['mm', '', undefined])('blocks undeclared/incompatible height unit %s', (heightUnit) => {
    expect(parseCosaIn1(source, { ...mapping, heightUnit }).diagnostics[0]?.code).toBe('invalid-mapping')
  })

  it('uses caller-saved column order and preserves negative/zero heights', () => {
    const reordered: CosaIn1Mapping = {
      ...mapping,
      knownPoints: { ...mapping.knownPoints, bindings: [{ field: 'point', columnIndex: 1 }, { field: 'height', columnIndex: 0 }] }
    }
    const result = parseCosaIn1('-1.5,BM1\n0,BM2\n\nBM1,BM2,1.5,0.4', reordered)
    expect(result.state).toBe('valid')
    expect(result.knownPoints.map((point) => point.height)).toEqual([-1.5, 0])
    expect(result.observations[0]?.routeLengthKm).toBe(0.4)
  })

  it('accepts an explicit known-point count when the source omits the blank separator', () => {
    const twoKnownMapping: CosaIn1Mapping = {
      ...mapping,
      knownPointRecordCount: 2
    }
    const result = parseCosaIn1('BM1,100\nBM2,101\nBM1,P1,0.25,0.1\nP1,BM2,0.75,0.2\n', twoKnownMapping)
    expect(result.state).toBe('valid')
    expect(result.knownPoints.map((point) => point.id)).toEqual(['BM1', 'BM2'])
    expect(result.observations).toHaveLength(2)
    expect(result.mapping?.knownPointRecordCount).toBe(2)
  })

  it('supports a separately declared fullwidth-comma known-point section', () => {
    const fullwidthMapping: CosaIn1Mapping = {
      ...mapping,
      textEncoding: 'gb18030',
      knownPointRecordCount: 2,
      knownPoints: { ...mapping.knownPoints, delimiter: 'csv-fullwidth-comma' }
    }
    const result = parseCosaIn1('BM1，100\nBM2，101\nBM1,P1,0.25,0.1\nP1,BM2,0.75,0.2\n', fullwidthMapping)
    expect(result.state).toBe('valid')
    expect(result.knownPoints.map((point) => point.height)).toEqual([100, 101])
    expect(result.observations).toHaveLength(2)
  })

  it('keeps original byte anchors for a declared GB18030 source', () => {
    const fullwidthMapping: CosaIn1Mapping = {
      ...mapping,
      textEncoding: 'gb18030',
      knownPointRecordCount: 2,
      knownPoints: { ...mapping.knownPoints, delimiter: 'csv-fullwidth-comma' }
    }
    const bytes = Buffer.concat([
      Buffer.from('BM1'), Buffer.from([0xa3, 0xac]), Buffer.from('100\r\n'),
      Buffer.from('BM2'), Buffer.from([0xa3, 0xac]), Buffer.from('101\r\n'),
      Buffer.from('BM1,P1,0.25,0.1\r\nP1,BM2,0.75,0.2')
    ])
    const result = parseCosaIn1(bytes, fullwidthMapping)
    expect(result.state).toBe('valid')
    for (const record of result.recordAnchors) expect(bytes.subarray(record.byteOffset, record.byteOffset + record.byteLength).toString('hex')).not.toBe('')
    expect(result.recordAnchors[0]).toMatchObject({ byteOffset: 0, byteLength: 8, rawSnippet: 'BM1，100' })
  })

  it.each(['\n', '\r\n', '\r'])('anchors leading blanks and %j line separators against original bytes', (newline) => {
    const bytes = Buffer.from(newline + source.replaceAll('\n', newline))
    const result = parseCosaIn1(bytes, mapping)
    expect(result.state).toBe('valid')
    expect(result.recordAnchors[0]?.line).toBe(2)
    for (const anchor of result.recordAnchors) expect(bytes.subarray(anchor.rawOffset, anchor.rawOffset + anchor.rawLength).toString()).toBe(anchor.rawSnippet)
  })

  it.each(['BM1,100\nBM1,100\n\nBM1,P1,1,0.1', 'BM1,\n\nBM1,P1,1,0.1', 'BM1,100\n\nBM1,P1,,0.1', 'BM1,100\n\nBM1,P1,1,-0.1', 'BM1,100\n\nBM1,BM1,1,0.1', 'BM1,100\n\nBM1,P1,NaN,0.1', 'BM1,100\n\nBM1,P1,0x10,0.1'])('blocks invalid values without returning a prefix: %s', (text) => {
    const result = parseCosaIn1(text, mapping)
    expect(result.state).toBe('blocked')
    expect(result.observations).toEqual([])
  })

  it.each([Buffer.from([0xff]), Buffer.from('\ufeff' + source), Buffer.from(source, 'utf16le')])('rejects unsupported source encoding without false offsets', (bytes) => {
    expect(parseCosaIn1(bytes, mapping).diagnostics[0]?.code).toBe('invalid-encoding')
  })

  it.each(['A'.repeat(16_385), '\n'.repeat(100_001), ' '.repeat(8 * 1024 * 1024 + 1)])('checks resource limits before building record arrays', (text) => {
    expect(parseCosaIn1(text, mapping).diagnostics[0]?.code).toBe('limit-exceeded')
  })

  it('normalizes kilometre route lengths separately from observation sigma and retains known heights', async () => {
    const result = await new SurveyFormatRegistry().ingest({ name: 'level.in1', bytes: Buffer.from(source), cosaIn1Mapping: mapping })
    expect(result.knownPoints.map((point) => point.height)).toEqual([100, 101])
    expect(result.observations[0]).toMatchObject({ type: 'height-difference', value: 0.25, unit: 'm', routeLength: 100, rawFields: { routeLengthUnit: 'km' } })
    expect(result.observations[0]?.sigma).toBeUndefined()
    expect(result.sourceFile.disposition).toBe('adjustment-ready')
    expect(result.sourceFile.requiresManualConfirmation).toBe(false)
    const unmapped = await new SurveyFormatRegistry().ingest({ name: 'level.in1', bytes: Buffer.from(source) })
    expect(unmapped.observations).toEqual([])
    expect(unmapped.sourceFile).toMatchObject({ disposition: 'archive-only', requiresManualConfirmation: true })
    expect(unmapped.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'mapping_required', severity: 'blocking' }))
  })
})
