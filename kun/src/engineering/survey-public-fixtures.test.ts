import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const fixtureRoot = new URL('../../../docs/references/third-party/open-format-samples/', import.meta.url)
const registry = new SurveyFormatRegistry()

describe('fixed public survey-format research fixtures', () => {
  it.each([
    ['pynadjust-gsisample.gsi', 'leica-gsi16', true, 'adjustment-ready'],
    ['osgeolab-labor.gsi', 'leica-gsi16', true, 'archive-only'],
    ['osgeolab-sample.m5', 'trimble-m5', true, 'archive-only'],
    ['trimble-jobxml-test.jxl', 'trimble-jobxml', true, 'archive-only'],
    ['openbim-landxml-example.xml', 'landxml', false, 'archive-only'],
    ['openbim-landxml-client.xml', 'landxml', true, 'archive-only']
  ] as const)('parses %s from its immutable public source with its documented pre-strategy disposition', async (file, format, hasRecords, disposition) => {
    const result = await registry.ingest({
      name: file,
      bytes: await readFile(new URL(file, fixtureRoot)),
      networkType: format === 'trimble-m5' ? 'leveling' : 'plane-control'
    })

    expect(result.sourceFile.detection.format).toBe(format)
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.sourceFile.disposition).toBe(disposition)
    expect(result.sourceFile.sha256).toMatch(/^[a-f0-9]{64}$/)
    if (hasRecords) {
      expect(result.sourceFile.records.length).toBeGreaterThan(0)
      expect(result.sourceFile.records.every((record) => record.rawSnippet.length > 0)).toBe(true)
    } else {
      expect(result.sourceFile.records).toHaveLength(0)
      expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid_record', severity: 'blocking' }))
    }
  })

  it.each([
    ['orekit-hatanaka.crx', 'hatanaka-rinex', 'converter-required'],
    ['orekit-sinex.snx', 'sinex', 'gnss-processing-required'],
    ['orekit-antex.atx', 'antex', 'gnss-processing-required'],
    ['orekit-sp3.sp3', 'sp3', 'gnss-processing-required']
  ] as const)('inspects %s as %s and keeps the GNSS processing gate', async (file, format, disposition) => {
    const result = await registry.ingest({ name: file, bytes: await readFile(new URL(file, fixtureRoot)), networkType: 'gnss' })
    expect(result.sourceFile.detection.format).toBe(format)
    expect(result.sourceFile.disposition).toBe(disposition)
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.sourceFile.records.length).toBeGreaterThan(0)
    expect(result.observations).toHaveLength(0)
  })

  it('keeps public sample provenance separate from synthetic P0 fixture provenance', async () => {
    const manifest = JSON.parse(await readFile(new URL('MANIFEST.json', fixtureRoot), 'utf8')) as {
      schemaVersion: number
      sources: Array<{ name: string; path: string; bytes: number; ref: string; license: string; sha256: string; gitBlobSha1: string; workwiseDisposition: string }>
    }
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.sources).toHaveLength(10)
    expect(new Set(manifest.sources.map((source) => source.ref)).size).toBe(5)
    for (const source of manifest.sources) {
      expect(source.license).toMatch(/^(Apache-2\.0|CC0-1\.0|MIT|AGPL-3\.0)$/)
      expect(source.workwiseDisposition).toMatch(/^(archive-only|converter-required|gnss-processing-required)$/)
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(source.gitBlobSha1).toMatch(/^[a-f0-9]{40}$/)
      const bytes = await readFile(new URL(source.name, fixtureRoot))
      expect(bytes.byteLength).toBe(source.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256)
      const gitBlob = createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
      expect(gitBlob).toBe(source.gitBlobSha1)
    }
  })
})
