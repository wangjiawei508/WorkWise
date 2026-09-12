import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { CosaIn2ParseError, DEFAULT_COSA_IN2_PARSE_LIMITS, parseCosaIn2, type CosaIn2ParseLimitOverrides } from './survey-cosa-in2.js'

const FIXTURE_DIRECTORY = new URL('./fixtures/survey-formats/cosa-in2/', import.meta.url)

async function fixture(name: string): Promise<Buffer> {
  return await readFile(new URL(name, FIXTURE_DIRECTORY))
}

function parseFailure(source: string | Uint8Array, limits?: CosaIn2ParseLimitOverrides): CosaIn2ParseError {
  try {
    parseCosaIn2(source, limits)
  } catch (error) {
    if (error instanceof CosaIn2ParseError) return error
    throw error
  }
  throw new Error('expected COSA .in2 parse failure')
}

/** Synthetic grammar fixture used only for parser resource-boundary tests. */
const LIMIT_FIXTURE = [
  '1,1,1',
  'A,0,0',
  'S1',
  'A,L,0',
  'B,S,1',
  'C,S,1'
].join('\n')
const LIMIT_FIXTURE_BYTES = new TextEncoder().encode(LIMIT_FIXTURE)

describe('COSA .in2 parser', () => {
  it('keeps the synthetic fixture manifest aligned with the frozen format ID', async () => {
    const manifest = JSON.parse(await readFile(new URL('manifest.json', FIXTURE_DIRECTORY), 'utf8')) as {
      schemaVersion: number
      formatId: string
      origin: string
      files: Array<{ path: string; kind: string }>
    }

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      formatId: 'cosa-in2',
      origin: 'synthetic-not-vendor-certified'
    })
    expect(manifest.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'golden-single-station.in2', kind: 'golden' }),
      expect.objectContaining({ path: 'negative-header-two-fields.in2', kind: 'negative' })
    ]))
  })

  it('parses the single-station synthetic fixture with typed canonical observations and raw anchors', async () => {
    const source = await fixture('golden-single-station.in2')
    const parsed = parseCosaIn2(source)

    expect(parsed.priorPrecisions).toMatchObject({
      directionArcSeconds: 1.768,
      distanceConstantMillimetres: 1,
      distancePpm: 1,
      rawValues: { directionArcSeconds: '1.768', distanceConstantMillimetres: '1', distancePpm: '1' }
    })
    expect(parsed.points).toHaveLength(3)
    expect(parsed.points[0]).toMatchObject({ id: 'K1', known: true, x: 1000, y: 2000 })
    expect(parsed.stations.map((station) => station.id)).toEqual(['S1'])
    expect(parsed.observations).toHaveLength(4)
    expect(parsed.observations.map((observation) => observation.type)).toEqual(['direction', 'direction', 'distance', 'direction'])
    expect(parsed.observations[0]).toMatchObject({ station: 'S1', target: 'K1', role: 'backsight-reset', unit: 'rad', value: 0, rawValue: '0', rawValues: { target: 'K1', code: 'L', value: '0', record: 'K1,L,0' } })
    expect(parsed.observations[1]).toMatchObject({ station: 'S1', target: 'K2', role: 'foresight', unit: 'rad', rawValue: '90.00000', rawValues: { target: 'K2', code: 'L', value: '90.00000', record: 'K2,L,90.00000' } })
    expect(parsed.observations[1]?.value).toBeCloseTo(Math.PI / 2, 15)
    expect(parsed.observations[2]).toMatchObject({ type: 'distance', value: 100, unit: 'm', rawValue: '100.000' })
    expect(parsed.summary).toEqual({ pointCount: 3, stationCount: 1, observationCount: 4, recordCount: 9, skippedRecordCount: 0 })

    const directionAnchor = parsed.observations[1]!.anchor
    const sourceText = source.toString('utf8')
    expect(directionAnchor.byteOffset).toBe(new TextEncoder().encode(sourceText.slice(0, sourceText.indexOf('K2,L,90.00000'))).byteLength)
    expect(directionAnchor.rawOffset).toBe(directionAnchor.byteOffset)
    expect(directionAnchor.rawLength).toBe(directionAnchor.byteLength)
    expect(directionAnchor.rawSnippet).toBe('K2,L,90.00000')
    expect(parsed.recordAnchors).toHaveLength(parsed.summary.recordCount)
  })

  it('parses every golden fixture in the synthetic directory and never converts S,0 into a distance', async () => {
    const names = (await readdir(FIXTURE_DIRECTORY)).filter((name) => name.startsWith('golden-') && name.endsWith('.in2')).sort()
    expect(names).toEqual(expect.arrayContaining([
      'golden-dms-carry-boundary.in2',
      'golden-multi-station-known-edge.in2',
      'golden-single-station.in2'
    ]))

    const parsed = await Promise.all(names.map(async (name) => parseCosaIn2(await fixture(name))))
    expect(parsed.every((item) => item.observations.length > 0)).toBe(true)

    const multiStation = parsed.find((item) => item.stations.length === 2)!
    expect(multiStation.observations.filter((observation) => observation.type === 'distance').map((observation) => observation.value)).toEqual([141.421, 100])
    expect(multiStation.observations.some((observation) => observation.type === 'distance' && observation.value === 0)).toBe(false)
    expect(multiStation.summary).toEqual({ pointCount: 3, stationCount: 2, observationCount: 8, recordCount: 16, skippedRecordCount: 2 })

    const carryBoundary = parsed.find((item) => item.observations.some((observation) => observation.rawValue === '12.5959995'))!
    const direction = carryBoundary.observations.find((observation) => observation.type === 'direction' && observation.rawValue === '12.5959995')!
    expect(direction.value).toBeCloseTo((12 + 59 / 60 + 59.995 / 3_600) * Math.PI / 180, 15)
  })

  it('keeps the first L,0 as a backsight reset and a later zero direction as a foresight', () => {
    const parsed = parseCosaIn2([
      '1,1,1',
      'A,0,0',
      'S1',
      'A,L,0',
      'A,L,0.0000'
    ].join('\n'))

    expect(parsed.observations).toMatchObject([
      { type: 'direction', role: 'backsight-reset', target: 'A', value: 0, rawValue: '0' },
      { type: 'direction', role: 'foresight', target: 'A', value: 0, rawValue: '0.0000' }
    ])
    expect(parsed.summary).toEqual({ pointCount: 1, stationCount: 1, observationCount: 2, recordCount: 5, skippedRecordCount: 0 })
  })

  it('preserves blank COSA export separators without changing station or observation semantics', () => {
    const parsed = parseCosaIn2([
      '1,1,1',
      '',
      'A,0,0',
      '',
      'S1',
      '',
      'A,L,0',
      'B,L,90.00000',
      '',
      'B,S,100.000'
    ].join('\n'))

    expect(parsed.stations).toHaveLength(1)
    expect(parsed.observations).toMatchObject([
      { type: 'direction', role: 'backsight-reset', station: 'S1', target: 'A' },
      { type: 'direction', role: 'foresight', station: 'S1', target: 'B' },
      { type: 'distance', station: 'S1', target: 'B', value: 100 }
    ])
    expect(parsed.recordAnchors.filter((anchor) => anchor.recordType === 'blank').map((anchor) => anchor.line)).toEqual([2, 4, 6, 9])
    expect(parsed.summary).toEqual({ pointCount: 1, stationCount: 1, observationCount: 3, recordCount: 10, skippedRecordCount: 0 })
  })

  it('throws a recoverable, source-anchored error for every negative synthetic fixture', async () => {
    const expectations: Readonly<Record<string, number>> = {
      'negative-header-two-fields.in2': 1,
      'negative-missing-backsight-reset.in2': 5,
      'negative-point-name-comma.in2': 3,
      'negative-dms-minutes-60.in2': 6,
      'negative-dms-seconds-60.in2': 6
    }

    const names = (await readdir(FIXTURE_DIRECTORY)).filter((name) => name.startsWith('negative-') && name.endsWith('.in2')).sort()
    expect(names).toEqual(expect.arrayContaining(Object.keys(expectations)))
    for (const name of names) {
      const error = parseFailure(await fixture(name))
      expect(error.recoverable).toBe(true)
      if (expectations[name] !== undefined) expect(error.line).toBe(expectations[name])
      expect(error.column).toBeGreaterThan(0)
      expect(error.expected).not.toBe('')
      expect(error.suggestedAction).not.toBe('')
      expect(error.recordAnchor.line).toBe(error.line)
      expect(error.recordAnchor.byteOffset).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps resource limits inclusive at their exact configured boundary', () => {
    expect(DEFAULT_COSA_IN2_PARSE_LIMITS).toMatchObject({
      maxSourceBytes: 64 * 1024 * 1024,
      maxLines: 200_000,
      maxLineBytes: 1 * 1024 * 1024,
      maxRecords: 100_000,
      maxObservations: 100_000
    })

    const parsed = parseCosaIn2(LIMIT_FIXTURE, {
      maxSourceBytes: LIMIT_FIXTURE_BYTES.byteLength,
      maxLines: 6,
      maxLineBytes: 5,
      maxRecords: 6,
      maxObservations: 3
    })

    expect(parsed.summary).toMatchObject({ recordCount: 6, observationCount: 3 })
  })

  it('applies maxSourceBytes to both strings and Uint8Array input before decoding or record allocation', () => {
    for (const source of [LIMIT_FIXTURE, LIMIT_FIXTURE_BYTES]) {
      const error = parseFailure(source, { maxSourceBytes: LIMIT_FIXTURE_BYTES.byteLength - 1 })
      expect(error).toMatchObject({ code: 'limit-exceeded', recoverable: true, line: 1 })
      expect(error.expected).toContain('maxSourceBytes')
      expect(error.recordAnchor).toMatchObject({ byteOffset: 0, rawOffset: 0, rawSnippet: expect.stringContaining('1,1,1') })
    }
  })

  it('rejects line count, line byte length, and record count before returning a topology prefix', () => {
    const lineLimit = parseFailure(LIMIT_FIXTURE, { maxLines: 5 })
    expect(lineLimit).toMatchObject({ code: 'limit-exceeded', recoverable: true, line: 6 })
    expect(lineLimit.expected).toContain('maxLines')
    expect(lineLimit.recordAnchor).toMatchObject({ byteOffset: 27, rawSnippet: 'C,S,1' })

    const lineByteLimit = parseFailure('1,1,1\nTOO-LONG', { maxLineBytes: 5 })
    expect(lineByteLimit).toMatchObject({ code: 'limit-exceeded', recoverable: true, line: 2 })
    expect(lineByteLimit.expected).toContain('maxLineBytes')
    expect(lineByteLimit.recordAnchor).toMatchObject({ byteOffset: 6, rawSnippet: 'TOO-LO' })

    const recordLimit = parseFailure(LIMIT_FIXTURE, { maxRecords: 5 })
    expect(recordLimit).toMatchObject({ code: 'limit-exceeded', recoverable: true, line: 6 })
    expect(recordLimit.expected).toContain('maxRecords')
    expect(recordLimit.recordAnchor).toMatchObject({ byteOffset: 27, rawSnippet: 'C,S,1' })
  })

  it('blocks at maxObservations with an anchor for the rejected record and never returns a partial result', () => {
    const error = parseFailure(LIMIT_FIXTURE, { maxObservations: 2 })
    expect(error).toMatchObject({ code: 'limit-exceeded', recoverable: true, line: 6 })
    expect(error.expected).toContain('maxObservations')
    expect(error.recordAnchor).toMatchObject({ byteOffset: 27, rawSnippet: 'C,S,1', recordType: 'distance' })
  })
})
