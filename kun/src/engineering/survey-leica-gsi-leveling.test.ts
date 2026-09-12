import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const registry = new SurveyFormatRegistry()

function gsiLevelingFixture(): string {
  return [
    '410001+?......4',
    '110002+00000001 83..58-00000001',
    '110003+00000002 571.28+00000001 572.28+00000002 573..8+00012345 574..8+00100000 83..28+00000100',
    '110004+00000003 571.28+00000003 572.28+00000004 573..8+00023456 574..8+00300000 83..08-00000050',
    '110005+00000004 83..18+00000000',
    '410010+?......4',
    '110011+00000005 83..58-00000001',
    '110012+00000006 571.28+00000005 572.28+00000006 573..8+00034567 574..6+00020000 83..28+00000020',
    '110013+00000007 571.28+00000007 572.28+00000008 573..8+00045678 574..6+00050000 83..28+00000030 575.28+00000009'
  ].join('\r\n')
}

function gsiBlock(...records: string[]): string {
  return ['410001+?......4', ...records].join('\r\n')
}

const station = '110002+00000001 83..58+00000000'
const final = (target: string, cumulative: string, height = '+00000100'): string =>
  `110003+${target.padStart(8, '0')} 574..8+${cumulative.padStart(8, '0')} 83..28${height}`

function namedLevelingBlocksFixture(): string {
  return [
    '410001+?......4',
    '110002+00Y04H02 83..58+00000000',
    '110003+00000Z01 574..8+00100000 83..28+00000100',
    '110004+0000YSH4 574..8+00300000 83..28-00000050',
    '110005+00000Z02 574..8+00500000 83..28+00000020',
    '110006+00Y04H02 574..8+00700000 83..28+00000000',
    '410010+?......4',
    '110011+00Y02H01 83..58+00000000',
    '110012+00000Z01 574..8+00200000 83..28+00000030',
    '110013+00LYRB50 574..8+00500000 83..28+00000040',
    '110014+00000Z02 574..8+00900000 83..28-00000020',
    '110015+00Y02H01 574..8+01200000 83..28+00000000'
  ].join('\r\n')
}

describe('Leica GSI leveling WI41 semantic adapter', () => {
  it('differences cumulative WI83 heights including the nonzero initialization and return edge', async () => {
    // Synthetic independent reference: cumulative heights 100, 99.8, 100.6,
    // 99.8001, 100.0004 m imply a complete loop closure of +0.4 mm.
    const bytes = await readFile(new URL('./fixtures/survey-formats/professional/leica-gsi-cumulative-leveling.gsi', import.meta.url))
    const result = await registry.ingest({ name: 'loop.GSI', bytes, networkType: 'leveling' })
    expect(result.sourceFile).toMatchObject({ disposition: 'adjustment-ready', parserVersion: '0.4.0' })
    const expected = [-0.2, 0.8, -0.7999, 0.2003]
    result.observations.forEach((item, index) => expect(item.value).toBeCloseTo(expected[index]!, 10))
    expect(result.observations).toHaveLength(4)
    expect(result.observations.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(0.0004, 10)
    expect(result.observations.map((item) => item.routeLength)).toEqual([100, 200, 200, 100])
    expect(result.observations[1]?.rawFields).toMatchObject({
      heightDifferenceSource: 'adjacent-WI83-cumulative-height-difference',
      heightCumulativeValue: 100.6,
      heightPreviousCumulativeValue: 99.8,
      heightPreviousRecordId: 'record-3'
    })
  })

  it('blocks a truncated block without an initial cumulative height instead of assuming zero', async () => {
    const result = await registry.ingest({
      name: 'missing-initial-height.GSI',
      bytes: Buffer.from(gsiBlock('110002+00000001 32...8+00010000', final('2', '10000'))),
      networkType: 'leveling'
    })
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'blocking', message: expect.stringContaining('缺少首个 WI83 初始化高程')
    }))
  })

  it('maps physical WI57 information codes and derives adjacent route lengths per block', async () => {
    const source = gsiLevelingFixture()
    const result = await registry.ingest({ name: 'leveling.GSI', bytes: Buffer.from(source), networkType: 'height-control' })

    expect(result.sourceFile.detection.format).toBe('leica-gsi8')
    expect(result.sourceFile.disposition).toBe('adjustment-ready')
    expect(result.sourceFile.summary).toMatchObject({ observationCount: 4, recordCount: 9 })
    expect(result.observations.map((item) => item.routeLength)).toEqual([1, 2, 2, 3])
    const expectedDifferences = [0.00101, -0.0015, 0.00021, 0.0001]
    result.observations.forEach((item, index) => expect(item.value).toBeCloseTo(expectedDifferences[index]!, 12))
    expect(result.observations[0]?.rawFields).toMatchObject({
      routeLengthSource: 'WI57 information code 4 (cumulative)',
      routeLengthInformation: '4..8',
      routeLengthCumulativeValue: 1,
      routeLengthDeltaValue: 1,
      routeLengthRawLexeme: '574..8+00100000'
    })
    expect(result.observations[1]?.rawFields).toMatchObject({
      routeLengthCumulativeValue: 3,
      routeLengthPreviousCumulativeValue: 1,
      routeLengthDeltaValue: 2,
      routeLengthInformation: '4..8'
    })
    expect(result.observations[2]?.rawFields).toMatchObject({
      blockId: 'gsi-block-2',
      routeLengthCumulativeValue: 2,
      routeLengthCumulativeUnit: '6:0.0001-m',
      routeLengthDeltaValue: 2,
      routeLengthInformation: '4..6'
    })
    expect(result.observations[3]?.rawFields).toMatchObject({
      routeLengthCumulativeValue: 5,
      routeLengthPreviousCumulativeValue: 2,
      routeLengthDeltaValue: 3,
      'word-7:wi57': '575.28+00000009'
    })
    expect(result.observations.every((item) => item.qualityFlags?.includes('leica-gsi-wi57-cumulative-distance') ?? false)).toBe(true)
  })

  it('keeps setup initialization WI83 information codes out of observations', async () => {
    const result = await registry.ingest({ name: 'leveling.GSI', bytes: Buffer.from(gsiLevelingFixture()), networkType: 'height-control' })
    expect(result.observations.every((item) => item.rawFields?.heightDifferenceInformation === '..08' || item.rawFields?.heightDifferenceInformation === '..28')).toBe(true)
    expect(result.sourceFile.diagnostics.some((item) => item.severity === 'blocking')).toBe(false)
  })

  it('blocks a WI41 block whose first data record has no station WI11', async () => {
    const result = await registry.ingest({
      name: 'missing-station.GSI',
      bytes: Buffer.from(gsiBlock('574..8+00010000 83..28+00000100')),
      networkType: 'height-control'
    })
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('缺少首个 WI11 设站点号') })
    ]))
  })

  it('blocks duplicate final height fields instead of choosing one', async () => {
    const result = await registry.ingest({
      name: 'duplicate-final.GSI',
      bytes: Buffer.from(gsiBlock(station, '110003+00000002 574..8+00010000 83..28+00000100 83..08+00000200')),
      networkType: 'height-control'
    })
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('重复的最终 WI83..08/..28') })
    ]))
  })

  it('blocks a final height record without a target WI11', async () => {
    const result = await registry.ingest({
      name: 'missing-target.GSI',
      bytes: Buffer.from(gsiBlock(station, '574..8+00010000 83..28+00000100')),
      networkType: 'height-control'
    })
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('缺少同记录 WI11 目标点号') })
    ]))
  })

  it('blocks non-increasing WI57 information-code-4 cumulative distance', async () => {
    const result = await registry.ingest({
      name: 'non-increasing-distance.GSI',
      bytes: Buffer.from(gsiBlock(station, final('2', '10000'), final('3', '09000'))),
      networkType: 'height-control'
    })
    expect(result.observations).toHaveLength(1)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('累计距离未严格递增') })
    ]))
  })

  it('keeps a self-closure as a warning and excludes it from production edges', async () => {
    const result = await registry.ingest({
      name: 'self-closure.GSI',
      bytes: Buffer.from(gsiBlock(station, final('1', '10000'), final('2', '20000'))),
      networkType: 'height-control'
    })
    expect(result.observations).toHaveLength(1)
    expect(result.observations[0]?.to).toBe('2')
    expect(result.sourceFile.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('到自身的闭合检查记录') })
    ]))
    expect(result.sourceFile.disposition).toBe('adjustment-ready')
  })

  it('builds sequential chains for alphanumeric stations and namespaces repeated local turning points per WI41 block', async () => {
    const source = namedLevelingBlocksFixture()
    const result = await registry.ingest({ name: 'named-leveling.GSI', bytes: Buffer.from(source), networkType: 'height-control' })

    expect(result.sourceFile.detection.format).toBe('leica-gsi8')
    expect(result.sourceFile.summary).toMatchObject({ observationCount: 8, recordCount: 12, skippedRecordCount: 0 })
    expect(result.observations.map(({ from, to }) => [from, to])).toEqual([
      ['Y04H02', 'gsi-block-1:Z01'],
      ['gsi-block-1:Z01', 'YSH4'],
      ['YSH4', 'gsi-block-1:Z02'],
      ['gsi-block-1:Z02', 'Y04H02'],
      ['Y02H01', 'gsi-block-2:Z01'],
      ['gsi-block-2:Z01', 'LYRB50'],
      ['LYRB50', 'gsi-block-2:Z02'],
      ['gsi-block-2:Z02', 'Y02H01']
    ])
    expect(result.observations.map((item) => item.routeLength)).toEqual([1, 2, 2, 2, 2, 3, 4, 3])
    expect(result.observations.filter((item) => item.rawFields?.blockId === 'gsi-block-1')).toHaveLength(4)
    expect(result.observations.filter((item) => item.rawFields?.blockId === 'gsi-block-2')).toHaveLength(4)
    expect(result.observations.map((item) => item.rawFields)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rawPointId: 'Z01', localTurningPoint: true, instrumentStation: 'Y04H02', station: 'Y04H02', from: 'Y04H02' }),
      expect.objectContaining({ rawPointId: 'Z02', localTurningPoint: true, instrumentStation: 'Y04H02', station: 'YSH4', from: 'YSH4' }),
      expect.objectContaining({ rawPointId: 'Z01', localTurningPoint: true, instrumentStation: 'Y02H01', station: 'Y02H01', from: 'Y02H01' }),
      expect.objectContaining({ rawPointId: 'Z02', localTurningPoint: true, instrumentStation: 'Y02H01', station: 'LYRB50', from: 'LYRB50' })
    ]))
    expect(result.observations.filter((item) => item.to === 'Y04H02' || item.to === 'Y02H01')).toHaveLength(2)

    const selfClosureWarnings = result.sourceFile.diagnostics.filter((item) => item.severity === 'warning' && item.message.includes('到自身的闭合检查记录'))
    expect(selfClosureWarnings).toHaveLength(0)
    expect(result.sourceFile.rawRecordAnchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 3, rawSnippet: expect.stringContaining('110003+00000Z01') }),
      expect.objectContaining({ line: 9, rawSnippet: expect.stringContaining('110012+00000Z01') }),
      expect.objectContaining({ line: 6, rawSnippet: expect.stringContaining('110006+00Y04H02') }),
      expect.objectContaining({ line: 12, rawSnippet: expect.stringContaining('110015+00Y02H01') })
    ]))
  })
})
