import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

type Manifest = {
  schemaVersion: number
  provenance: string
  fixtures: Array<{ name: string; format: string; probe?: string; bytes?: number[] }>
}

const root = new URL('./fixtures/survey-formats/gnss/', import.meta.url)
const registry = new SurveyFormatRegistry()

describe('GNSS format manifest coverage', () => {
  it('keeps every advertised GNSS family represented by a bounded synthetic probe', async () => {
    const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8')) as Manifest
    expect(manifest).toMatchObject({ schemaVersion: 1, provenance: 'synthetic-probe' })
    expect(manifest.fixtures.length).toBeGreaterThanOrEqual(24)
    expect(new Set(manifest.fixtures.map((fixture) => fixture.format)).size).toBe(manifest.fixtures.length - 2)
    for (const fixture of manifest.fixtures) {
      expect(fixture.probe || fixture.bytes).toBeTruthy()
      const bytes = fixture.bytes ? Buffer.from(fixture.bytes) : Buffer.from(fixture.probe ?? '')
      const result = await registry.ingest({ name: fixture.name, bytes, networkType: 'gnss' })
      expect(result.sourceFile.detection.format).toBe(fixture.format)
      expect(result.sourceFile.disposition).toBe(fixture.format === 'hatanaka-rinex' ? 'converter-required' : 'gnss-processing-required')
      expect(result.sourceFile.originalPreserved).toBe(true)
      expect(result.observations).toHaveLength(0)
      expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
        code: fixture.format === 'hatanaka-rinex' ? 'converter_required' : 'gnss_processing_required',
        severity: 'blocking'
      }))
    }
  })
})
