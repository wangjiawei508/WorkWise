import { describe, expect, it } from 'vitest'
import { SurveyNetworkV1 } from '../contracts/survey.js'
import { SurveyFormatRegistry } from './survey-format-registry.js'
import {
  recordDerivedObservationValueCorrection,
  replayDerivedCorrections,
  surveyObservationSnapshotHash
} from './survey-derived-correction-ledger.js'
import { recordRawSource } from './survey-raw-data-ledger.js'

/**
 * A real frozen WorkWise source, rather than a legacy vendor XML fixture.
 * The registry gives each point and observation a separate exact byte-range
 * anchor; the slope distance remains the A → P plane-control observation
 * used by the correction-ledger scenarios below.
 */
const frozenWorkwiseSource = JSON.stringify({
  format: 'workwise-survey-network',
  formatVersion: 1,
  network: {
    networkType: 'plane-control',
    coordinateSystem: 'local',
    projection: 'none',
    ellipsoid: 'none',
    verticalDatum: 'none',
    unit: 'm',
    knownPoints: [{ id: 'A', pointClass: 'known', known: true, x: 0, y: 0 }],
    unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, x: 10, y: 10 }],
    observations: [{
      id: 'a-p-slope-distance',
      type: 'slope-distance',
      from: 'A',
      to: 'P',
      station: 'A',
      target: 'P',
      value: 14.142,
      unit: 'm',
      sigma: 0.001,
      sigmaUnit: 'm'
    }]
  }
})

async function fixture() {
  const envelope = await new SurveyFormatRegistry().ingest({
    name: 'verified-workwise-plane-control.json',
    bytes: Buffer.from(frozenWorkwiseSource),
    networkType: 'plane-control'
  })
  if (envelope.sourceFile.disposition !== 'adjustment-ready') throw new Error('fixture must produce an adjustment-ready frozen source')
  const observation = envelope.observations.find((item) => item.type === 'slope-distance')
  if (!observation?.sourceRecordId) throw new Error('fixture must produce a raw-source-linked observation')
  const network = SurveyNetworkV1.parse({
    schemaVersion: 1,
    id: 'network-derived-ledger',
    projectId: 'project-derived-ledger',
    networkType: 'plane-control',
    coordinateSystem: 'local',
    projection: 'none',
    ellipsoid: 'none',
    verticalDatum: 'none',
    unit: 'm',
    knownPoints: envelope.knownPoints,
    unknownPoints: envelope.unknownPoints,
    observations: envelope.observations,
    sourceFile: envelope.sourceFile,
    instrumentParameters: {},
    qualityStatus: 'imported',
    findings: [],
    revision: 1,
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z'
  })
  const raw = recordRawSource({
    id: 'raw-source-ledger-1',
    networkId: network.id,
    occurredAt: '2026-09-04T00:00:00.000Z',
    source: {
      sha256: network.sourceFile!.sha256,
      fileSize: network.sourceFile!.fileSize,
      originalPreserved: network.sourceFile!.originalPreserved,
      records: network.sourceFile!.records.filter((record) => record.rawLength > 0).map((record) => ({
        id: record.id,
        rawOffset: record.rawOffset,
        rawLength: record.rawLength,
        ...(record.rawLineNo === undefined ? {} : { rawLineNo: record.rawLineNo })
      }))
    }
  })
  return { network, raw, observation }
}

describe('survey derived-correction ledger', () => {
  it('replays chained scalar corrections without changing the source network', async () => {
    const { network, raw, observation } = await fixture()
    const first = recordDerivedObservationValueCorrection({
      id: 'derived-1', networkId: network.id, sequence: 1, initialRawSourceLedgerEntry: raw, previousHash: raw.thisHash,
      observation, beforeValue: observation.value, afterValue: observation.value + 0.001, sourceAnchorId: observation.sourceRecordId!,
      reason: '现场复核后录入棱镜常数更正', basis: { kind: 'manual-review', referenceId: 'review-2026-09-04' },
      operation: { id: 'trusted-manual-entry', version: '1' }, actor: { id: 'surveyor-1', kind: 'human' }, occurredAt: '2026-09-04T00:01:00.000Z'
    })
    const second = recordDerivedObservationValueCorrection({
      id: 'derived-2', networkId: network.id, sequence: 2, initialRawSourceLedgerEntry: raw, previousHash: first.thisHash,
      observation, beforeValue: first.after.value, afterValue: first.after.value + 0.002, sourceAnchorId: observation.sourceRecordId!,
      reason: '复核仪器记录后补充派生修正', basis: { kind: 'instrument-reprocessing', referenceId: 'instrument-log-42' },
      operation: { id: 'trusted-manual-entry', version: '1' }, actor: { id: 'surveyor-2', kind: 'human' }, occurredAt: '2026-09-04T00:02:00.000Z'
    })

    const replay = replayDerivedCorrections({ network, rawLedger: [raw], corrections: [first, second] })

    expect(replay).toMatchObject({ valid: true, correctionCount: 2, rawSourceLedgerInitialHash: raw.thisHash, correctionLedgerHeadHash: second.thisHash })
    expect(replay.steps).toEqual([
      expect.objectContaining({ recordId: first.id, beforeValue: observation.value, afterValue: first.after.value }),
      expect.objectContaining({ recordId: second.id, beforeValue: first.after.value, afterValue: second.after.value })
    ])
    expect(network.observations.find((item) => item.id === observation.id)?.value).toBe(observation.value)
    expect(replay.derivedNetwork?.observations.find((item) => item.id === observation.id)?.value).toBe(second.after.value)
    expect(first.before.observationSnapshotHash).toBe(surveyObservationSnapshotHash(observation))
  })

  it('rejects a changed record payload, changed source observation, or missing raw anchor', async () => {
    const { network, raw, observation } = await fixture()
    const record = recordDerivedObservationValueCorrection({
      id: 'derived-tamper', networkId: network.id, sequence: 1, initialRawSourceLedgerEntry: raw, previousHash: raw.thisHash,
      observation, beforeValue: observation.value, afterValue: observation.value + 0.001, sourceAnchorId: observation.sourceRecordId!,
      reason: '经过人工复核的派生修正', basis: { kind: 'manual-review', referenceId: 'review-7' },
      operation: { id: 'trusted-manual-entry', version: '1' }, actor: { id: 'surveyor-1', kind: 'human' }, occurredAt: '2026-09-04T00:01:00.000Z'
    })
    const changedReason = replayDerivedCorrections({ network, rawLedger: [raw], corrections: [{ ...record, reason: '被篡改的理由' }] })
    expect(changedReason.valid).toBe(false)
    expect(changedReason.errors.join('\n')).toContain('hash does not match')

    const changedNetwork = SurveyNetworkV1.parse({
      ...network,
      observations: network.observations.map((item) => item.id === observation.id ? { ...item, value: item.value + 1 } : item)
    })
    const changedSourceObservation = replayDerivedCorrections({ network: changedNetwork, rawLedger: [raw], corrections: [record] })
    expect(changedSourceObservation.valid).toBe(false)
    expect(changedSourceObservation.errors.join('\n')).toContain('original observation snapshot has changed')

    const noAnchorNetwork = SurveyNetworkV1.parse({
      ...network,
      sourceFile: { ...network.sourceFile!, records: [], rawRecordAnchors: [] }
    })
    const missingAnchor = replayDerivedCorrections({ network: noAnchorNetwork, rawLedger: [raw], corrections: [record] })
    expect(missingAnchor.valid).toBe(false)
    expect(missingAnchor.errors.join('\n')).toContain('source evidence does not match')
  })

  it('fails closed when persisted input has duplicate observation or raw-anchor IDs', async () => {
    const { network, raw, observation } = await fixture()
    const duplicateObservation = SurveyNetworkV1.parse({
      ...network,
      observations: [...network.observations, { ...observation }]
    })
    const observationReplay = replayDerivedCorrections({ network: duplicateObservation, rawLedger: [raw], corrections: [] })
    expect(observationReplay.valid).toBe(false)
    expect(observationReplay.errors.join('\n')).toContain(`duplicate observation id: ${observation.id}`)

    const duplicateAnchor = SurveyNetworkV1.parse({
      ...network,
      sourceFile: {
        ...network.sourceFile!,
        records: [...network.sourceFile!.records, { ...network.sourceFile!.records[0]! }],
        rawRecordAnchors: [...network.sourceFile!.rawRecordAnchors, { ...network.sourceFile!.rawRecordAnchors[0]! }]
      }
    })
    const anchorReplay = replayDerivedCorrections({ network: duplicateAnchor, rawLedger: [raw], corrections: [] })
    expect(anchorReplay.valid).toBe(false)
    expect(anchorReplay.errors.join('\n')).toContain('duplicate raw')
  })
})
