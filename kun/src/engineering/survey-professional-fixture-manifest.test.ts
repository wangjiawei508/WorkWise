import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'
import type { CosaIn1Mapping } from './survey-cosa-in1.js'

function expectedGoldenDisposition(file: string): 'adjustment-ready' | 'archive-only' {
  return file.startsWith('cosa-in1-level-golden-') || /^leica-gsi(?:8|16)\.gsi$/.test(file) ||
    file === 'trimble-m5.m5' || file === 'trimble-m5-dat.dat'
    ? 'adjustment-ready'
    : 'archive-only'
}

type FixtureManifest = {
  schemaVersion: number
  provenance: string
  fixtures: Array<{
    file: string
    format: string
    kind: 'golden' | 'negative'
    observations: boolean
  }>
}

const fixtureDirectory = new URL('./fixtures/survey-formats/professional/', import.meta.url)
const registry = new SurveyFormatRegistry()

async function ingestFixture(file: string) {
  return registry.ingest({
    name: file, bytes: await readFile(new URL(file, fixtureDirectory)), networkType: 'plane-control',
    ...(file.endsWith('.in1') ? { cosaIn1Mapping: JSON.parse(await readFile(new URL('cosa-in1-mapping.json', fixtureDirectory), 'utf8')) as CosaIn1Mapping } : {})
  })
}

async function loadManifest(): Promise<FixtureManifest> {
  return JSON.parse(await readFile(new URL('manifest.json', fixtureDirectory), 'utf8')) as FixtureManifest
}

describe('professional survey fixture manifest', () => {
  it('keeps every synthetic fixture bounded and provenance-labelled', async () => {
    const manifest = await loadManifest()
    expect(manifest).toMatchObject({ schemaVersion: 1, provenance: 'synthetic' })
    expect(manifest.fixtures.length).toBeGreaterThanOrEqual(17)
    expect(new Set(manifest.fixtures.map((fixture) => fixture.file)).size).toBe(manifest.fixtures.length)
    expect(manifest.fixtures.filter((fixture) => fixture.kind === 'golden').length).toBeGreaterThan(0)
    expect(manifest.fixtures.filter((fixture) => fixture.kind === 'negative').length).toBeGreaterThan(0)
  })

  it.each([
    'cosa-in1-level-golden-a.in1',
    'cosa-in1-level-golden-b.in1',
    'cosa-in1-level-golden-c.in1',
    'leica-gsi8.gsi',
    'leica-gsi16.gsi',
    'leica-hexml.hexml',
    'trimble-jobxml.jxl',
    'trimble-m5.m5',
    'trimble-m5-dat.dat',
    'tds-raw.raw',
    'carlson-rw5.rw5',
    'sokkia-sdr33.sdr',
    'sokkia-sdr20.sdr',
    'landxml.xml',
    'south-dat-explicit.dat'
  ])('parses the independent golden fixture %s with retained observations', async (file) => {
    const manifest = await loadManifest()
    const entry = manifest.fixtures.find((fixture) => fixture.file === file)
    expect(entry).toMatchObject({ kind: 'golden', observations: file === 'south-dat-explicit.dat' ? false : true })
    const result = await ingestFixture(file)

    expect(result.sourceFile.detection.format).toBe(entry?.format)
    if (file === 'south-dat-explicit.dat') expect(result.unknownPoints.length).toBeGreaterThan(0)
    else expect(result.observations.length).toBeGreaterThan(0)
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.sourceFile.diagnostics.length).toBeGreaterThan(0)
    expect(result.sourceFile.disposition).toBe(expectedGoldenDisposition(file))
  })

  it.each([
    ['cosa-in1-level-golden-a.in1', { observationCount: 3, first: { type: 'height-difference', value: 0.125, unit: 'm' } }],
    ['cosa-in1-level-golden-b.in1', { observationCount: 3, first: { type: 'height-difference', value: -0.125, unit: 'm' } }],
    ['cosa-in1-level-golden-c.in1', { observationCount: 3, first: { type: 'height-difference', value: 0.25, unit: 'm' } }],
    ['leica-gsi8.gsi', { observationCount: 3, first: { type: 'direction', value: 40.5 * Math.PI / 180, unit: 'rad' } }],
    ['leica-gsi16.gsi', { observationCount: 3, first: { type: 'direction', value: 40.5 * Math.PI / 180, unit: 'rad' } }],
    ['leica-hexml.hexml', { observationCount: 2, first: { type: 'direction', value: 45, unit: 'deg' } }],
    ['trimble-jobxml.jxl', { observationCount: 2, first: { type: 'direction', value: 45, unit: 'deg' } }],
    ['trimble-m5.m5', { observationCount: 1, first: { type: 'height-difference', value: 0.125, unit: 'm' } }],
    ['trimble-m5-dat.dat', { observationCount: 1, first: { type: 'height-difference', value: 0.125, unit: 'm' } }],
    ['tds-raw.raw', { observationCount: 1, first: { type: 'slope-distance', value: 10, unit: 'm' } }],
    ['carlson-rw5.rw5', { observationCount: 1, first: { type: 'slope-distance', value: 10, unit: 'm' } }],
    ['sokkia-sdr33.sdr', { observationCount: 3, first: { type: 'direction', value: 45, unit: 'deg' } }],
    ['sokkia-sdr20.sdr', { observationCount: 3, first: { type: 'direction', value: 45, unit: 'deg' } }],
    ['landxml.xml', { observationCount: 2, first: { type: 'direction', value: 45, unit: 'landxml-angular-unit-unverified' } }]
  ] as const)('retains deterministic observation values and the documented pre-strategy disposition for %s', async (file, expected) => {
    const result = await ingestFixture(file)
    expect(result.observations).toHaveLength(expected.observationCount)
    expect(result.observations[0]).toMatchObject(expected.first)
    expect(result.sourceFile.disposition).toBe(expectedGoldenDisposition(file))
  })

  it.each(['leica-hexml.hexml', 'trimble-jobxml.jxl', 'landxml.xml'])('publishes physical XML line anchors without claiming element offsets for %s', async (file) => {
    const result = await ingestFixture(file)

    expect(result.sourceFile.records.length).toBeGreaterThan(0)
    expect(result.sourceFile.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^xml-/),
        rawLineNo: expect.any(Number),
        byteOffset: expect.any(Number),
        byteLength: expect.any(Number),
        rawSnippet: expect.any(String)
      })
    ]))
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      code: 'invalid_record',
      severity: 'blocking',
      message: expect.stringContaining('元素级偏移')
    }))
  })

  it.each([
    'cosa-in1-level-negative-no-separator.in1',
    'cosa-in1-level-negative-columns.in1',
    'cosa-in1-level-negative-distance.in1',
    'leica-gsi-negative.gsi',
    'leica-hexml-negative.hexml',
    'trimble-jobxml-negative.jxl',
    'trimble-m5-negative.m5',
    'trimble-m5-dat-negative.dat',
    'tds-raw-negative.raw',
    'carlson-rw5-negative.rw5',
    'sokkia-sdr-negative.sdr',
    'sokkia-sdr20-negative.sdr',
    'landxml-negative.xml',
    'south-dat-negative.dat'
  ])('keeps the malformed fixture %s blocked with the original source', async (file) => {
    const manifest = await loadManifest()
    const entry = manifest.fixtures.find((fixture) => fixture.file === file)
    expect(entry).toMatchObject({ kind: 'negative', observations: false })
    const result = await ingestFixture(file)

    expect(result.sourceFile.detection.format).toBe(entry?.format)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.sourceFile.diagnostics.length).toBeGreaterThan(0)
  })
})
