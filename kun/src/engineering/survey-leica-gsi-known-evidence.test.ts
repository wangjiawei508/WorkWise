import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SurveyService } from './survey-service.js'
import { SurveyFormatRegistry } from './survey-format-registry.js'

// These assertions refer to the documented Ningbo project, not arbitrary GSI input.
const SOURCE = process.env.WORKWISE_TEST_GSI_SOURCE?.trim()

describe('real NAS Leica GSI known datum evidence', () => {
  it.skipIf(!SOURCE)('retains the source point-name conflict and blocks adjustment instead of guessing', async () => {
    if (!SOURCE) throw new Error('WORKWISE_TEST_GSI_SOURCE is required for real-source acceptance')
    const root = await mkdtemp(join(tmpdir(), 'workwise-real-gsi-known-evidence-'))
    let service: SurveyService | undefined
    try {
      const bytes = await readFile(SOURCE)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe('ed5c0a3343829bbfbc4fb8631e84af1157a1e24f5f200aba2702e02695b6512c')
      const parsed = await new SurveyFormatRegistry().ingest({ name: '0305栎社-鄞州三角高程水准.GSI', bytes, networkType: 'height-control' })
      expect(parsed.observations).toHaveLength(36)
      expect(parsed.observations.filter((item) => item.rawFields?.blockId === 'gsi-block-1')).toHaveLength(4)
      expect(parsed.observations.filter((item) => item.rawFields?.blockId === 'gsi-block-9')).toHaveLength(4)
      expect(parsed.observations.at(-1)).toMatchObject({ from: 'gsi-block-9:Z02', to: 'Y04H01' })
      expect(parsed.sourceFile.diagnostics.some((item) => item.severity === 'blocking')).toBe(false)
      service = new SurveyService({ rootDir: root })
      const network = await service.importNetwork({
        projectId: 'real-gsi-known-evidence', expectedRevision: 0, idempotencyKey: 'real-gsi-known-import',
        networkType: 'height-control', name: '0305栎社-鄞州三角高程水准.GSI', dataBase64: bytes.toString('base64'),
        knownPoints: ([
          ['YSH4', -11.2192], ['LYRB50', -9.8735], ['LYRB150', -12.9603], ['LYRB300', -17.5688],
          ['LYRB500', -23.4607], ['LYRB650', -24.4786], ['LYRB800', -24.1566], ['LYRB1000', -17.9979], ['LYRB1200', -12.4129]
        ] as const).map(([id, height]) => ({ id, height }))
      })
      const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'real-gsi-known-adjustment' })
      expect(network.knownPoints.map((point) => point.id)).toContain('LYRB800')
      expect(network.knownPoints.map((point) => point.id)).not.toContain('LYRB850')
      expect(network.unknownPoints.map((point) => point.id)).toContain('LYRB850')
      expect(adjustment.run.status).toBe('needs_attention')
      expect(adjustment.result.validation).toBe('invalid')
      expect(adjustment.result.qualityFindings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'rank_deficient', severity: 'blocking' })
      ]))
    } finally {
      try {
        service?.close()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  })
})
