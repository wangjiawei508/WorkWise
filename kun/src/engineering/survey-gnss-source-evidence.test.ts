import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SURVEY_FORMAT_LIMITS, SurveyFormatRegistry } from './survey-format-registry.js'

const registry = new SurveyFormatRegistry()
const header = (value: string, label: string) => `${value.padEnd(60)}${label}`
const rinexHeader = (version = '3.04', type = 'O') => header(`${version.padStart(9)}${' '.repeat(11)}${type}`, 'RINEX VERSION / TYPE')
const textCases = [
  { name: 'observations.05o', format: 'rinex-observation', lines: [rinexHeader('2.10'), header('', 'END OF HEADER'), ' 05  4  2  0  0  0.0000000  0  0'] },
  { name: 'observations.rnx', format: 'rinex-observation', lines: [rinexHeader(), header('', 'END OF HEADER'), '> 2026 09 06 00 00 00.0000000  0  0'] },
  { name: 'broadcast.nav', format: 'rinex-navigation', lines: [rinexHeader('4.00', 'N'), header('', 'END OF HEADER'), '> EPH G01 LNAV'] },
  { name: 'weather.met', format: 'rinex-meteorological', lines: [rinexHeader('3.05', 'M'), header('', 'END OF HEADER'), ' 26  9  6  0  0  0   1000.0'] },
  { name: 'clock.clk', format: 'rinex-clock', lines: [rinexHeader('3.04', 'C'), header('', 'END OF HEADER'), 'AS G01  2026 09 06 00 00  0.000000  1  0.000000E+00'] },
  { name: 'solution.snx', format: 'sinex', lines: ['%=SNX 2.02 TEST', '+FILE/COMMENT', ' retained note', '-FILE/COMMENT'] },
  { name: 'track.nmea', format: 'nmea-0183', lines: ['$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47', '$GPXXX,retained,unsupported'] },
  { name: 'orbit.sp3', format: 'sp3', lines: ['#cP2026 09 06 00 00 00.00000000      1 ORBIT IGS20 HLM  IGS', '## 2434 0.00000000 900.00000000 00000 0.0000000000000', '*  2026 09 06 00 00 00.00000000', 'EOF'] },
  { name: 'ionosphere.ion', format: 'ionex', lines: [header('     1.0', 'IONEX VERSION / TYPE'), header('', 'END OF HEADER'), header('     1', 'START OF TEC MAP')] },
  { name: 'antenna.atx', format: 'antex', lines: [header('     1.4', 'ANTEX VERSION / SYST'), header('', 'END OF HEADER'), header('', 'START OF ANTENNA')] }
]

describe('GNSS source evidence boundaries', () => {
  for (const [label, separator] of [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']] as const) {
    it.each(textCases)(`anchors $format physical lines in ${label} without counting epochs or solutions`, async ({ name, format, lines }) => {
      const physicalLines = [lines[0]!, '', ...lines.slice(1), '']
      const bytes = Buffer.from(physicalLines.join(separator))
      const result = await registry.ingest({ name, bytes })
      expect(result.sourceFile).toMatchObject({ formatId: format, disposition: 'gnss-processing-required', recordCount: lines.length })
      expect(result.observations).toHaveLength(0)
      expect(result.effectiveBytes).toEqual(bytes)
      expect(result.sourceFile.records).toHaveLength(lines.length)
      expect(result.sourceFile.records).toEqual(result.sourceFile.rawRecordAnchors)
      for (const record of result.sourceFile.records) {
        const expected = physicalLines[record.rawLineNo! - 1]!
        const offset = Buffer.byteLength(physicalLines.slice(0, record.rawLineNo! - 1).join(separator) + (record.rawLineNo === 1 ? '' : separator))
        expect(record).toMatchObject({ id: `record-${record.rawLineNo}`, rawOffset: offset, byteOffset: offset, rawLength: Buffer.byteLength(expected), rawSnippet: expected })
        expect(bytes.subarray(record.rawOffset, record.rawOffset + record.rawLength).toString()).toBe(expected)
      }
    })
  }

  it.each(['utf8', 'utf8-bom', 'utf16le', 'utf16be'] as const)('preserves %s BOM and multibyte line offsets with mixed separators', async (encoding) => {
    const pieces = [rinexHeader(), '\r', header('测站 Alpha', 'COMMENT'), '\r\n', '', '\n', header('', 'END OF HEADER'), '\r', '> 2026 09 06 00 00 00.0000000  0  0']
    const text = pieces.join('')
    const encode = (value: string) => encoding === 'utf16be' ? Buffer.from(value, 'utf16le').swap16() : Buffer.from(value, encoding === 'utf16le' ? 'utf16le' : 'utf8')
    const bom = Buffer.from(encoding === 'utf8-bom' ? [0xef, 0xbb, 0xbf] : encoding === 'utf16le' ? [0xff, 0xfe] : encoding === 'utf16be' ? [0xfe, 0xff] : [])
    const bytes = Buffer.concat([bom, encode(text)])
    const result = await registry.ingest({ name: 'encoded.rnx', bytes })
    expect(result.sourceFile.records.map((record) => record.rawLineNo)).toEqual([1, 2, 4, 5])
    for (const record of result.sourceFile.records) {
      const value = text.split(/\r\n|\r|\n/)[record.rawLineNo! - 1]!
      expect(bytes.subarray(record.rawOffset, record.rawOffset + record.rawLength)).toEqual(encode(value))
      expect(record.rawSnippet).toBe(value)
    }
    expect(result.sourceFile.records[0]?.rawOffset).toBe(bom.length)
    expect(result.sourceFile.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  })

  it.each(textCases)('rejects $format anchor overflow atomically', async ({ name, lines }) => {
    const bytes = Buffer.from([lines[0], ...Array<string>(SURVEY_FORMAT_LIMITS.maxRecordAnchors).fill(' retained line')].join('\n'))
    const result = await registry.ingest({ name, bytes })
    expect(result.sourceFile).toMatchObject({ disposition: 'archive-only', originalPreserved: true })
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'limit_exceeded', severity: 'blocking' }))
    expect(result.sourceFile.records).toEqual([])
    expect(result.observations).toEqual([])
    expect(result.unknownPoints).toEqual([])
  })

  it('bounds a long line excerpt but retains its complete byte span', async () => {
    const longLine = `${'x'.repeat(8000)}END`
    const bytes = Buffer.from([rinexHeader(), header('', 'END OF HEADER'), longLine].join('\n'))
    const result = await registry.ingest({ name: 'long.rnx', bytes })
    const record = result.sourceFile.records[2]!
    expect(record.rawSnippet.length).toBeLessThanOrEqual(2048)
    expect(record.rawLength).toBe(longLine.length)
    expect(bytes.subarray(record.rawOffset, record.rawOffset + record.rawLength).toString()).toBe(longLine)
  })

  it('ties RINEX approximate coordinates to their header line and ignores payload lookalikes', async () => {
    const lines = [rinexHeader(), header('SITE', 'MARKER NAME'), header(' 1234567.5 2345678.25 3456789.125', 'APPROX POSITION XYZ'), header('', 'END OF HEADER'), header(' 9 9 9', 'APPROX POSITION XYZ')]
    const result = await registry.ingest({ name: 'position.rnx', bytes: Buffer.from(lines.join('\n')) })
    expect(result.unknownPoints).toEqual([expect.objectContaining({ id: 'SITE', x: 1234567.5, y: 2345678.25, height: 3456789.125, known: false, sourceRow: 3 })])
    expect(result.sourceFile.records[2]).toMatchObject({ recordType: 'RINEX-header-line', rawSnippet: lines[2] })
    expect(result.sourceFile.records[4]).toMatchObject({ recordType: 'RINEX-data-line', rawSnippet: lines[4] })
  })

  it.each(['rtcm2', 'jps', 'tps', 'sth', 'zhd', 'hcn', 'cnb'])('retains .%s as one unparsed envelope rather than guessing messages from bytes', async (extension) => {
    const bytes = Buffer.from([0, 0x66, 0x66, 0x99, 0x0d, 0x0a, 0x66, 0x99, 0x99])
    const result = await registry.ingest({ name: `opaque.${extension}`, bytes })
    expect(result.sourceFile).toMatchObject({ recordCount: 0, disposition: 'gnss-processing-required' })
    expect(result.sourceFile.records).toEqual([expect.objectContaining({ recordType: expect.stringContaining('unparsed-source'), rawOffset: 0, rawLength: bytes.length })])
    expect(result.sourceFile.records[0]?.rawLineNo).toBeUndefined()
    expect(result.observations).toEqual([])
    expect(result.sourceFile.detection.method).toBe('extension-fallback')
  })

  it('reads SINEX estimates instead of constraint flags with all component origins retained', async () => {
    const result = await registry.ingest({ name: 'coordinates.snx', bytes: Buffer.from([
      '%=SNX 2.02 TEST', '+SOLUTION/ESTIMATE',
      '1 STAX SITE A 0001 26:001:00000 m 2 1.23456789E+06 0.01',
      '2 STAY SITE A 0001 26:001:00000 m 2 -2.34567890E+06 0.01',
      '3 STAZ SITE A 0001 26:001:00000 m 2 3.45678901E+06 0.01',
      '-SOLUTION/ESTIMATE'
    ].join('\n')) })
    expect(result.unknownPoints).toEqual([expect.objectContaining({ id: 'SITE', x: 1234567.89, y: -2345678.9, height: 3456789.01, sourceRow: 3,
      rawFields: expect.objectContaining({ xSourceRecord: 3, ySourceRecord: 4, heightSourceRecord: 5 }) })])
    expect(result.observations).toEqual([])
    expect(result.sourceFile.disposition).toBe('gnss-processing-required')
  })

  it.each(['mm 2 3000', 'm 2 NaN', 'm 2 Infinity', 'm 9 3000', 'm 2'])('does not expose a partial SINEX vector when its Z fields are %s', async (zFields) => {
    const result = await registry.ingest({ name: 'invalid.snx', bytes: Buffer.from([
      '%=SNX 2.02 TEST', '+SOLUTION/ESTIMATE',
      '1 STAX SITE A 0001 26:001:00000 m 2 1000', '2 STAY SITE A 0001 26:001:00000 m 2 2000',
      `3 STAZ SITE A 0001 26:001:00000 ${zFields}`, '-SOLUTION/ESTIMATE'
    ].join('\n')) })
    expect(result.unknownPoints).toEqual([])
    expect(result.sourceFile.records).toHaveLength(6)
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'record_ignored', sourceRecord: 5, recordAnchor: 'record-5' }))
  })
})
