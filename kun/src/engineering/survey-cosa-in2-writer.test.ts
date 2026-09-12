import { describe, expect, it } from 'vitest'
import { parseCosaIn2 } from './survey-cosa-in2.js'
import {
  CosaIn2WriteError,
  writeCosaIn2,
  type CosaIn2ExportModel
} from './survey-cosa-in2-writer.js'

function exportModel(): CosaIn2ExportModel {
  return {
    priorPrecisions: {
      directionArcSeconds: '1.768',
      distanceConstantMillimetres: '1',
      distancePpm: '1.5'
    },
    knownPoints: [
      { id: '后视', xMetres: '1000.000', yMetres: '2000.000' },
      { id: '前视', xMetres: '1100.000', yMetres: '2000.000' },
      { id: 'P1', xMetres: '1050.000', yMetres: '2050.000' }
    ],
    stations: [
      {
        id: '测站1',
        backsightTarget: '后视',
        observations: [
          { kind: 'direction', target: '前视', directionDms: '90.00000' },
          { kind: 'known-edge', target: '前视', zeroDistanceToken: '0.000' },
          { kind: 'distance', target: 'P1', distanceMetres: '70.710' },
          { kind: 'direction', target: 'P1', directionDms: '12.5959995' }
        ]
      },
      {
        id: '测站2',
        backsightTarget: '前视',
        observations: [
          { kind: 'direction', target: '后视', directionDms: '270.00000' },
          { kind: 'distance', target: 'P1', distanceMetres: '100.000' }
        ]
      }
    ]
  }
}

function writeFailure(model: CosaIn2ExportModel): CosaIn2WriteError {
  try {
    writeCosaIn2(model)
  } catch (error) {
    if (error instanceof CosaIn2WriteError) return error
    throw error
  }
  throw new Error('expected COSA .in2 writer failure')
}

describe('COSA .in2 writer', () => {
  it('writes deterministic UTF-8 source which the strict parser can read back without reformatting lexical values', () => {
    const result = writeCosaIn2(exportModel())

    expect(result.text).toBe([
      '1.768,1,1.5',
      '后视,1000.000,2000.000',
      '前视,1100.000,2000.000',
      'P1,1050.000,2050.000',
      '测站1',
      '后视,L,0',
      '前视,L,90.00000',
      '前视,S,0.000',
      'P1,S,70.710',
      'P1,L,12.5959995',
      '测站2',
      '前视,L,0',
      '后视,L,270.00000',
      'P1,S,100.000',
      ''
    ].join('\n'))
    expect(new TextDecoder('utf-8', { fatal: true }).decode(result.utf8)).toBe(result.text)

    const reparsed = parseCosaIn2(result.utf8)
    expect(reparsed.summary).toEqual({
      pointCount: 3,
      stationCount: 2,
      observationCount: 7,
      recordCount: 14,
      skippedRecordCount: 1
    })
    expect(reparsed.observations[0]).toMatchObject({
      type: 'direction', role: 'backsight-reset', station: '测站1', target: '后视', rawValue: '0'
    })
    expect(reparsed.observations[1]).toMatchObject({
      type: 'direction', role: 'foresight', target: '前视', rawValue: '90.00000'
    })
    expect(reparsed.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'direction', target: 'P1', rawValue: '12.5959995' })
    ]))
    expect(reparsed.observations.some((observation) => observation.type === 'distance' && observation.value === 0)).toBe(false)
    expect(reparsed.recordAnchors.find((anchor) => anchor.rawSnippet === '前视,S,0.000')).toMatchObject({ recordType: 'known-edge' })
  })

  it('rejects incomplete station blocks instead of emitting a partial source', () => {
    const noStation = exportModel()
    const noStationFailure = writeFailure({ ...noStation, stations: [] })
    expect(noStationFailure).toMatchObject({ code: 'incomplete-station-block', path: 'model.stations', recoverable: true })

    const noObservation = exportModel()
    const noObservationFailure = writeFailure({
      ...noObservation,
      stations: [{ id: 'S1', backsightTarget: '后视', observations: [] }]
    })
    expect(noObservationFailure).toMatchObject({
      code: 'incomplete-station-block',
      path: 'model.stations[0].observations',
      recoverable: true
    })
  })

  it('rejects invalid D.MMSS tokens rather than treating them as decimal degrees or carrying 60 seconds', () => {
    const model = exportModel()
    const failure = writeFailure({
      ...model,
      stations: [{
        ...model.stations[0]!,
        observations: [{ kind: 'direction', target: '前视', directionDms: '12.596000' }]
      }]
    })

    expect(failure).toMatchObject({
      code: 'invalid-direction',
      path: 'model.stations[0].observations[0].directionDms',
      recoverable: true
    })
  })

  it('rejects illegal numeric values and does not reinterpret a zero distance as an ordinary observation', () => {
    const model = exportModel()
    const zeroDistanceFailure = writeFailure({
      ...model,
      stations: [{
        ...model.stations[0]!,
        observations: [{ kind: 'distance', target: '前视', distanceMetres: '0' }]
      }]
    })
    expect(zeroDistanceFailure).toMatchObject({
      code: 'invalid-number',
      path: 'model.stations[0].observations[0].distanceMetres'
    })

    const nonZeroKnownEdgeFailure = writeFailure({
      ...model,
      stations: [{
        ...model.stations[0]!,
        observations: [{ kind: 'known-edge', target: '前视', zeroDistanceToken: '1' }]
      }]
    })
    expect(nonZeroKnownEdgeFailure).toMatchObject({
      code: 'invalid-number',
      path: 'model.stations[0].observations[0].zeroDistanceToken'
    })
  })
})
