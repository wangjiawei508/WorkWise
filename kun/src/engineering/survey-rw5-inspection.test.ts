import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

// Independently authored records based on field definitions, not copied
// vendor examples. See the Carlson RW5 entry in SURVEY_FORMAT_SOURCES.md.
const ingest = (lines: string[], name = 'field.rw5') => new SurveyFormatRegistry().ingest({
  name, bytes: Buffer.from(`${lines.join('\r\n')}\r\n`), networkType: 'plane-control'
})

describe('RW5 evidence-backed archive inspection', () => {
  it.each(['field.rw5', 'field.raw'])('uses OP as the occupied station and FP as the target in %s', async (name) => {
    const result = await ingest([
      'JB,NMIndependent regression', 'MO,UN1,AD0,AU0',
      'OC,OPS1,N 120,E 240,EL8', 'LS,HI1.45,HR1.9',
      'SS,OPS1,FPQ2,AR13.2456,VA2.3040,SD27.25'
    ], name)
    expect(result.observations).toEqual([expect.objectContaining({
      from: 'S1', to: 'Q2', station: 'S1', target: 'Q2',
      type: 'slope-distance', value: 27.25, unit: 'm',
      stationHeightOffset: 1.45, targetHeightOffset: 1.9,
      sourceRecordId: 'record-5', sourceRow: 5,
      rawFields: expect.objectContaining({ op: 'S1', fp: 'Q2', ar: '13.2456', va: '2.3040', modeRecord: 2, heightRecord: 4 })
    })])
    expect(result.unknownPoints).toContainEqual(expect.objectContaining({ id: 'S1', x: 120, y: 240, height: 8 }))
    expect(result.sourceFile).toMatchObject({ disposition: 'archive-only', angularUnitCanonical: 'unverified' })
  })

  it('preserves BK as a setup record and handles every direct/reverse shot code', async () => {
    const result = await ingest([
      'JB,NMAngle sets', 'MO,UN1', 'OC,OPS1', 'LS,HI1.4,HR1.8',
      'BK,OPS1,BPB1,BS15.0000,BC0.0000',
      'BD,OPS1,FPB1,AR0.0000,ZE90.0000,SD20',
      'BR,OPS1,FPB1,AR180.0000,ZE270.0000,SD20.01',
      'FD,OPS1,FPF1,AR60.0000,ZE89.0000,SD30',
      'FR,OPS1,FPF1,AR240.0000,ZE271.0000,SD30.01'
    ])
    expect(result.observations.map((item) => [item.target, item.face, item.rawFields?.recordType])).toEqual([
      ['B1', 'left', 'BD'], ['B1', 'right', 'BR'], ['F1', 'left', 'FD'], ['F1', 'right', 'FR']
    ])
    expect(result.sourceFile.records.find((item) => item.sourceRecord === 5)).toMatchObject({ recordType: 'BK', rawSnippet: expect.stringContaining('BPB1') })
  })

  it('applies partial LS updates without carrying instrument height to another occupied station', async () => {
    const result = await ingest([
      'JB,NMHeights', 'MO,UN1', 'OC,OPS1', 'LS,HI1.4,HR1.8',
      'SS,OPS1,FPA,HD12', 'LS,HR2.1', 'TR,OPS1,FPB,HD13',
      'SS,OPS2,FPC,HD14', 'OC,OPS2', 'SS,OPS2,FPD,HD15'
    ])
    expect(result.observations.map((item) => [item.stationHeightOffset, item.targetHeightOffset])).toEqual([
      [1.4, 1.8], [1.4, 2.1], [undefined, 2.1], [undefined, undefined]
    ])
  })

  it.each([
    ['0', 0.3048], ['1', 1], ['2', 1200 / 3937]
  ])('converts only the explicitly declared MO.UN=%s linear values', async (unit, scale) => {
    const result = await ingest([
      'JB,NMUnit regression', `MO,UN${unit}`, 'OC,OPS1,N 100,E 200,EL30',
      'LS,HI5,HR6', 'SS,OPS1,FPT1,SD10', 'GPS,PNG1,LA31.3000,LN121.0000,EL25'
    ])
    expect(result.observations[0]?.value).toBeCloseTo(10 * scale, 10)
    expect(result.observations[0]?.stationHeightOffset).toBeCloseTo(5 * scale, 10)
    expect(result.observations[0]?.targetHeightOffset).toBeCloseTo(6 * scale, 10)
    expect(result.unknownPoints.find((point) => point.id === 'S1')?.x).toBeCloseTo(100 * scale, 10)
    expect(result.unknownPoints.find((point) => point.id === 'G1')).toMatchObject({ height: 25 })
    expect(result.sourceFile.linearUnitRaw).toContain(`MO.UN=${unit}`)
    expect(result.sourceFile.disposition).toBe('archive-only')
  })

  it.each(['', 'MO,UN9', 'MO,UN', 'MO,UNmetres'])('does not silently default ambiguous units (%s) to metres', async (mode) => {
    const result = await ingest(['JB,NMUnknown units', mode, 'OC,OPS1,N 100,E 200,EL30', 'LS,HI5,HR6', 'SS,OPS1,FPT1,SD10'])
    expect(result.observations[0]).toMatchObject({ value: 10, unit: 'rw5-linear-unverified' })
    expect(result.observations[0]?.stationHeightOffset).toBeUndefined()
    expect(result.unknownPoints.find((point) => point.id === 'S1')?.x).toBeUndefined()
    expect(result.sourceFile).toMatchObject({ disposition: 'archive-only', linearUnitCanonical: 'unverified' })
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('MO.UN') }))
  })

  it.each(['AZ20.3040', 'BRN20.3040W', 'AR20.3040', 'AL20.3040', 'DR20.3040', 'DL20.3040', 'ZE91.3040', 'VA1.3040', 'CE2'])('retains %s without inventing an angular observation', async (field) => {
    const result = await ingest(['JB,NMRaw angles', 'MO,UN1,AU0', 'OC,OPS1', `SS,OPS1,FPT1,${field},SD10`])
    expect(result.observations.map((item) => item.type)).toEqual(['slope-distance'])
    expect(result.observations[0]?.rawFields?.[field.slice(0, 2).toLowerCase()]).toBe(field.slice(2))
    expect(result.sourceFile.angularUnitCanonical).toBe('unverified')
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('AU 枚举') }))
  })

  it('keeps line-accurate anchors for comments, LS updates and rejected geometry', async () => {
    const lines = ['JB,NMAnchors', 'MO,UN1', 'OC,OPS1', '--independent note', 'LS,HR1.8', 'SS,OPS1,SD10', 'SS,OPS1,FPS1,SD10', 'SS,OPS1,FPT1,SD10']
    const result = await ingest(lines)
    expect(result.observations).toHaveLength(1)
    expect(result.sourceFile.records).toHaveLength(lines.length)
    for (const record of result.sourceFile.records) {
      expect(result.effectiveBytes.subarray(record.rawOffset, record.rawOffset + record.rawLength).toString()).toBe(lines[record.sourceRecord! - 1])
    }
    for (const record of [6, 7]) expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing_geometry', sourceRecord: record, recordAnchor: `record-${record}` }))
  })

  it('rejects duplicate field tokens instead of overriding the first numeric value', async () => {
    const result = await ingest(['JB,NMDuplicate', 'MO,UN1', 'OC,OPS1', 'SS,OPS1,FPT1,SD10,SD100'])
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_record', severity: 'blocking', message: expect.stringContaining('重复字段 sd') }))
  })
})
