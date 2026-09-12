import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const fixtureRoot = new URL('./fixtures/survey-formats/professional/', import.meta.url)
const registry = new SurveyFormatRegistry()

type GoldenCase = {
  file: string
  format: string
  observations: number
  first?: { type: string; value: number; unit: string }
  disposition?: 'adjustment-ready' | 'archive-only'
}

/**
 * Expected values are independently authored from the fixture records. They
 * are deliberately small and deterministic: this matrix verifies the native
 * driver boundary and provenance, not vendor interoperability approval.
 */
const goldenCases: readonly GoldenCase[] = [
  { file: 'leica-gsi8.gsi', format: 'leica-gsi8', observations: 3, first: { type: 'direction', value: 40.5 * Math.PI / 180, unit: 'rad' }, disposition: 'adjustment-ready' },
  { file: 'leica-gsi16.gsi', format: 'leica-gsi16', observations: 3, first: { type: 'direction', value: 40.5 * Math.PI / 180, unit: 'rad' }, disposition: 'adjustment-ready' },
  { file: 'leica-hexml.hexml', format: 'leica-hexml', observations: 2, first: { type: 'direction', value: 45, unit: 'deg' } },
  { file: 'trimble-jobxml.jxl', format: 'trimble-jobxml', observations: 2, first: { type: 'direction', value: 45, unit: 'deg' } },
  { file: 'trimble-m5.m5', format: 'trimble-m5', observations: 1, first: { type: 'height-difference', value: 0.125, unit: 'm' }, disposition: 'adjustment-ready' },
  { file: 'trimble-m5-dat.dat', format: 'trimble-m5', observations: 1, first: { type: 'height-difference', value: 0.125, unit: 'm' }, disposition: 'adjustment-ready' },
  { file: 'tds-raw.raw', format: 'tds-raw', observations: 1, first: { type: 'slope-distance', value: 10, unit: 'm' } },
  { file: 'carlson-rw5.rw5', format: 'carlson-rw5', observations: 1, first: { type: 'slope-distance', value: 10, unit: 'm' } },
  { file: 'sokkia-sdr20.sdr', format: 'sokkia-sdr', observations: 3, first: { type: 'direction', value: 45, unit: 'deg' } },
  { file: 'sokkia-sdr33.sdr', format: 'sokkia-sdr', observations: 3, first: { type: 'direction', value: 45, unit: 'deg' } },
  { file: 'landxml.xml', format: 'landxml', observations: 2, first: { type: 'direction', value: 45, unit: 'landxml-angular-unit-unverified' } }
]

const negativeCases = [
  ['leica-gsi-negative.gsi', 'leica-gsi8'],
  ['leica-hexml-negative.hexml', 'leica-hexml'],
  ['trimble-jobxml-negative.jxl', 'trimble-jobxml'],
  ['trimble-m5-negative.m5', 'trimble-m5'],
  ['trimble-m5-dat-negative.dat', 'trimble-m5'],
  ['tds-raw-negative.raw', 'tds-raw'],
  ['carlson-rw5-negative.rw5', 'carlson-rw5'],
  ['sokkia-sdr-negative.sdr', 'sokkia-sdr'],
  ['sokkia-sdr20-negative.sdr', 'sokkia-sdr'],
  ['landxml-negative.xml', 'landxml'],
  ['south-dat-negative.dat', 'south-dat']
] as const

describe('independent native survey-format driver matrix', () => {
  it.each(goldenCases)('keeps $file parseable with its documented pre-strategy disposition', async ({ file, format, observations, first, disposition = 'archive-only' }) => {
    const bytes = await readFile(new URL(file, fixtureRoot))
    const result = await registry.ingest({ name: file, bytes, networkType: 'plane-control' })

    expect(result.sourceFile.detection.format).toBe(format)
    expect(result.sourceFile.disposition).toBe(disposition)
    expect(result.sourceFile.requiresManualConfirmation).toBe(disposition !== 'adjustment-ready')
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.sourceFile.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(result.sourceFile.rawRecordAnchors.length).toBeGreaterThan(0)
    expect(result.sourceFile.records).toEqual(result.sourceFile.rawRecordAnchors)
    expect(result.observations).toHaveLength(observations)
    if (first) expect(result.observations[0]).toMatchObject(first)
  })

  it('lets a high-confidence M5 content signature win over the .dat claim while retaining the conflict', async () => {
    const bytes = await readFile(new URL('trimble-m5-dat.dat', fixtureRoot))
    const result = await registry.ingest({ name: 'trimble-m5-dat.dat', bytes, networkType: 'leveling' })

    expect(result.sourceFile.detection).toMatchObject({
      format: 'trimble-m5', extension: '.dat', extensionConflict: true,
      method: 'content-signature', confidence: 0.96
    })
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      code: 'format_conflict', severity: 'warning', message: expect.stringContaining('高置信内容优先')
    }))
    expect(result.observations[0]).toMatchObject({ type: 'height-difference', from: 'BM1', to: 'P1', value: 0.125, unit: 'm' })
  })

  it.each(negativeCases)('fails closed for malformed %s without partial observations', async (file, format) => {
    const result = await registry.ingest({ name: file, bytes: await readFile(new URL(file, fixtureRoot)), networkType: 'plane-control' })
    expect(result.sourceFile.detection.format).toBe(format)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.observations).toEqual([])
    expect(result.sourceFile.diagnostics.some((item) => item.severity === 'blocking')).toBe(true)
  })
})
