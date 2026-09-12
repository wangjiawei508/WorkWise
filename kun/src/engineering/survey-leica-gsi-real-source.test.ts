import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

// This project-specific acceptance input is supplied locally, never bundled in CI.
const SOURCE = process.env.WORKWISE_TEST_GSI_SOURCE?.trim()

describe('real NAS Leica GSI source parser evidence', () => {
  it.skipIf(!SOURCE)('preserves all WI41 chains, local turning-point namespaces, and closing edges', async () => {
    if (!SOURCE) throw new Error('WORKWISE_TEST_GSI_SOURCE is required for real-source acceptance')
    const bytes = await readFile(SOURCE)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('ed5c0a3343829bbfbc4fb8631e84af1157a1e24f5f200aba2702e02695b6512c')
    const result = await new SurveyFormatRegistry().ingest({
      name: '0305栎社-鄞州三角高程水准.GSI',
      bytes,
      networkType: 'height-control'
    })

    expect(result.sourceFile.detection.format).toBe('leica-gsi8')
    expect(result.sourceFile.recordCount).toBe(198)
    expect(result.sourceFile.summary).toMatchObject({
      observationCount: 36,
      recordCount: 198,
      skippedRecordCount: 0
    })
    expect(result.observations).toHaveLength(36)
    expect(result.observations.filter((observation) => observation.to === observation.rawFields?.instrumentStation)).toHaveLength(9)
    expect(result.observations.filter((observation) => observation.rawFields?.localTurningPoint === true)).toHaveLength(18)
    expect(new Set(result.observations.map((observation) => observation.rawFields?.blockId)).size).toBe(9)
    expect(result.sourceFile.rawRecordAnchors).toHaveLength(198)
    expect(result.sourceFile.diagnostics.some((diagnostic) => diagnostic.severity === 'blocking')).toBe(false)
  })
})
