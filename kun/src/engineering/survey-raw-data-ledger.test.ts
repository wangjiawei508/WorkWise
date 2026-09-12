import { describe, expect, it } from 'vitest'
import {
  SurveyRawSourceIntegrityError,
  rawAnchorDigest,
  recordRawSource,
  reverifyRawSource,
  verifyRawSourceLedger,
  type SurveyRawSourceEvidence
} from './survey-raw-data-ledger.js'

const SOURCE_HASH = 'a'.repeat(64)

function source(overrides: Partial<SurveyRawSourceEvidence> = {}): SurveyRawSourceEvidence {
  return {
    sha256: SOURCE_HASH,
    fileSize: 48,
    originalPreserved: true,
    records: [
      { id: 'raw-1', rawOffset: 0, rawLength: 16, rawLineNo: 1 },
      { id: 'raw-2', rawOffset: 16, rawLength: 32, rawLineNo: 2 }
    ],
    ...overrides
  }
}

describe('survey raw-data ledger', () => {
  it('records a frozen source identity and extends it through an append-only verification chain', () => {
    const initial = recordRawSource({
      id: 'raw-ledger-1',
      networkId: 'network-1',
      source: source(),
      occurredAt: '2026-09-04T00:00:00.000Z'
    })
    const reverified = reverifyRawSource({
      ledger: [initial],
      id: 'raw-ledger-2',
      source: source(),
      occurredAt: '2026-09-04T00:01:00.000Z',
      actor: 'human'
    })

    expect(Object.isFrozen(initial)).toBe(true)
    expect(reverified.sequence).toBe(2)
    expect(reverified.previousHash).toBe(initial.thisHash)
    expect(verifyRawSourceLedger([initial, reverified])).toEqual({ valid: true, errors: [] })
  })

  it('refuses to replace a recorded source with different bytes even when its record layout is unchanged', () => {
    const initial = recordRawSource({ id: 'raw-ledger-1', networkId: 'network-1', source: source(), occurredAt: '2026-09-04T00:00:00.000Z' })

    expect(() => reverifyRawSource({
      ledger: [initial],
      id: 'raw-ledger-2',
      source: source({ sha256: 'b'.repeat(64) }),
      occurredAt: '2026-09-04T00:01:00.000Z'
    })).toThrow('raw source identity changed')
  })

  it('treats a changed raw anchor layout as a source-identity change', () => {
    const initial = recordRawSource({ id: 'raw-ledger-1', networkId: 'network-1', source: source(), occurredAt: '2026-09-04T00:00:00.000Z' })

    expect(() => reverifyRawSource({
      ledger: [initial],
      id: 'raw-ledger-2',
      source: source({ records: [{ id: 'raw-1', rawOffset: 0, rawLength: 48, rawLineNo: 1 }] }),
      occurredAt: '2026-09-04T00:01:00.000Z'
    })).toThrow('raw source identity changed')
  })

  it('detects durable-ledger tampering by recomputing every chain hash', () => {
    const initial = recordRawSource({ id: 'raw-ledger-1', networkId: 'network-1', source: source(), occurredAt: '2026-09-04T00:00:00.000Z' })
    const reverified = reverifyRawSource({ ledger: [initial], id: 'raw-ledger-2', source: source(), occurredAt: '2026-09-04T00:01:00.000Z' })
    const tampered = { ...reverified, actor: 'human' as const }

    expect(verifyRawSourceLedger([initial, tampered]).valid).toBe(false)
    expect(verifyRawSourceLedger([initial, tampered]).errors).toContain('entry raw-ledger-2 hash does not match its payload')
  })

  it('rejects absent preservation proof and invalid raw locators before creating a record', () => {
    expect(() => recordRawSource({
      id: 'raw-ledger-1', networkId: 'network-1',
      source: source({ originalPreserved: false }),
      occurredAt: '2026-09-04T00:00:00.000Z'
    })).toThrow(SurveyRawSourceIntegrityError)
    expect(() => rawAnchorDigest(source({ records: [{ id: 'raw-1', rawOffset: 20, rawLength: 30 }] }))).toThrow('lies outside the preserved source')
  })
})
