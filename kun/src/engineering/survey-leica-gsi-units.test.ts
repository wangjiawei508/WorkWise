import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'
import { findP0SurveyFormatEntry } from './survey-format-catalog.js'

const registry = new SurveyFormatRegistry()

async function ingest(source: string) {
  return registry.ingest({ name: 'units.gsi', bytes: Buffer.from(source), networkType: 'plane-control' })
}

// Fixed, synthetic expectations independent of the production conversion API.
const unitCases = [
  { code: '0', wi: '33', digits: '00123456', expected: 123.456, unit: 'm', rawUnit: '0:0.001-m' },
  { code: '1', wi: '33', digits: '00123456', expected: 37.6293888, unit: 'm', rawUnit: '1:0.001-ft' },
  { code: '2', wi: '21', digits: '10000000', expected: Math.PI / 2, unit: 'rad', rawUnit: '2:0.00001-gon' },
  { code: '3', wi: '21', digits: '09000000', expected: Math.PI / 2, unit: 'rad', rawUnit: '3:0.00001-degree' },
  { code: '4', wi: '21', digits: '09000000', expected: Math.PI / 2, unit: 'rad', rawUnit: '4:DDDMMSS.s' },
  { code: '5', wi: '21', digits: '16000000', expected: Math.PI / 2, unit: 'rad', rawUnit: '5:0.0001-mil-6400' },
  { code: '6', wi: '33', digits: '00123456', expected: 12.3456, unit: 'm', rawUnit: '6:0.0001-m' },
  { code: '7', wi: '33', digits: '00123456', expected: 3.76293888, unit: 'm', rawUnit: '7:0.0001-ft' },
  { code: '8', wi: '33', digits: '00123456', expected: 1.23456, unit: 'm', rawUnit: '8:0.00001-m' }
]

describe.each([8, 16])('Leica GSI%d declared units', (width) => {
  describe.each(['+', '-'])('sign %s', (sign) => {
    it.each(unitCases)('converts code $code without inferring precision from data width', async ({ code, wi, digits, expected, unit, rawUnit }) => {
      const information = `.32${code}`
      const rawValue = `${sign}${digits.padStart(width, '0')}`
      const rawLexeme = `${wi}${information}${rawValue}`
      const source = `*11....+${'1'.padStart(width, '0')} ${rawLexeme}\r\n`
      const result = await ingest(source)
      const observation = result.observations[0]!
      expect(result.observations).toHaveLength(1)
      expect(observation.value).toBeCloseTo(sign === '-' ? -expected : expected, 12)
      expect(observation).toMatchObject({
        unit, sourceRow: 1, sourceLocator: 'GSI:1', sourceRecordId: 'record-1',
        rawFields: { rawValue, unitCode: code, information, rawLexeme }
      })
      const format = width === 8 ? 'leica-gsi8' : 'leica-gsi16'
      expect(result.sourceFile).toMatchObject({
        formatId: format, originalPreserved: true, disposition: 'adjustment-ready', requiresManualConfirmation: false,
        linearUnitCanonical: 'm', angularUnitCanonical: 'rad',
        dispositionReason: expect.stringContaining(findP0SurveyFormatEntry(format)!.currentDispositionReason),
        [unit === 'm' ? 'linearUnitRaw' : 'angularUnitRaw']: rawUnit
      })
      expect(Object.values(result.sourceFile.preservedRawFields)).toContain(rawLexeme)
      expect(result.sourceFile.rawRecordAnchors[0]?.rawSnippet).toBe(source.trimEnd())
      expect(result.sourceFile.diagnostics.some((item) => item.severity === 'blocking')).toBe(false)
    })
  })
})

describe('Leica GSI numeric safety', () => {
  it.each([
    ['21', '0'], ['21', '1'], ['21', '6'], ['22', '7'], ['22', '8'],
    ['31', '2'], ['32', '3'], ['33', '4'], ['81', '5'],
    ['21', '9'], ['31', '9'], ['22', '.'], ['88', '.']
  ])('blocks invalid or dimension-incompatible WI%s code %s transactionally', async (wi, code) => {
    const validLine = '*11....+00000001 21..02+10000000 31..00+00123456'
    const invalidWord = `${wi}..0${code}+00000001`
    const source = `${validLine}\r\n*11....+00000002 ${invalidWord}\r\n`
    const result = await ingest(source)
    expect(result.observations).toEqual([])
    expect(result.knownPoints).toEqual([])
    expect(result.unknownPoints).toEqual([])
    expect(result.sourceFile).toMatchObject({
      disposition: 'archive-only', linearUnitCanonical: 'unverified', angularUnitCanonical: 'unverified',
      dispositionReason: expect.stringContaining('数值语义校验失败')
    })
    const diagnostic = result.sourceFile.diagnostics.find((item) => item.code === 'invalid_record')!
    expect(diagnostic).toMatchObject({ severity: 'blocking', byteOffset: source.indexOf(invalidWord), recordAnchor: expect.any(String) })
    const anchor = result.sourceFile.rawRecordAnchors.find((item) => item.id === diagnostic.recordAnchor)!
    expect(source.slice(anchor.rawOffset, anchor.rawOffset + anchor.rawLength)).toBe(invalidWord)
  })

  it.each([
    ['+00000000', 0], ['+00000001', Math.PI / 6_480_000],
    ['-00000001', -Math.PI / 6_480_000],
    ['+35959599', 2 * Math.PI - Math.PI / 6_480_000],
    ['-35959599', -2 * Math.PI + Math.PI / 6_480_000]
  ])('preserves valid compact DMS boundary %s without carrying', async (rawValue, expected) => {
    const result = await ingest(`*11....+00000001 21.324${rawValue}`)
    expect(result.observations[0]?.value).toBeCloseTo(expected, 13)
    expect(result.observations[0]?.rawFields).toMatchObject({ rawValue, information: '.324', unitCode: '4' })
  })

  it.each(['+01234600', '-01234600', '+01260000', '-01260000'])('rejects invalid DMS minute/second fields %s', async (rawValue) => {
    const result = await ingest(`*11....+00000001 21.324${rawValue}`)
    expect(result.observations).toEqual([])
    expect(result.sourceFile.dispositionReason).toContain('数值语义校验失败')
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_record', severity: 'blocking' }))
  })

  it('converts coordinate and height words by their own linear codes', async () => {
    const result = await ingest('*11....+00000001 21..03+09000000 22..04+09000000 31..00+00123456 81..01+00123456 82..06+00123456 83..08+00123456 84..00+00100000 85..07+00123456 86..08+00123456 87..06+00001500 88..00+00001500')
    expect(result.unknownPoints).toContainEqual(expect.objectContaining({ id: '1', x: 37.6293888, y: 12.3456, height: 1.23456 }))
    const station = result.unknownPoints.find((point) => point.id === 'STN@1')!
    expect(station).toMatchObject({ x: 100, height: 1.23456 })
    expect(station.y).toBeCloseTo(3.76293888, 12)
    expect(result.observations).toHaveLength(3)
    for (const observation of result.observations) {
      expect(observation).toMatchObject({ stationHeightOffset: 1.5, targetHeightOffset: 0.15 })
    }
    expect(result.sourceFile.linearUnitRaw).toBe('0:0.001-m, 1:0.001-ft, 6:0.0001-m, 7:0.0001-ft, 8:0.00001-m')
    expect(result.sourceFile.angularUnitRaw).toBe('3:0.00001-degree, 4:DDDMMSS.s')
  })

  it.each([
    '21..02+10000000 21..03+09000000',
    '31..00+00000000000000AB',
    '31..00+9007199254740992'
  ])('rejects ambiguous or unsafe numeric words %s', async (words) => {
    const width = words.split(' ')[0]!.split('+')[1]!.length
    const result = await ingest(`*11....+${'1'.padStart(width, '0')} ${words}`)
    expect(result.observations).toEqual([])
    expect(result.sourceFile).toMatchObject({ disposition: 'archive-only', linearUnitCanonical: 'unverified', angularUnitCanonical: 'unverified' })
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_record', severity: 'blocking' }))
  })
})
