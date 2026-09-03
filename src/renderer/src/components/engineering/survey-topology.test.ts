import { describe, expect, it } from 'vitest'
import { buildSurveyTopology } from './survey-topology'

describe('survey topology view model', () => {
  it('connects observation endpoints by point id, not array position', () => {
    const result = buildSurveyTopology(
      [{ id: 'BM-02', known: true }, { id: 'P-17' }, { id: 'BM-01', known: true }],
      [{ id: 'obs-7', from: 'BM-01', to: 'P-17' }]
    )

    expect(result.edges).toEqual([{ id: 'obs-7:BM-01:P-17', from: 'BM-01', to: 'P-17', sourceObservationId: 'obs-7' }])
    expect(result.hasCoordinateLayout).toBe(false)
  })

  it('normalizes complete coordinates and keeps source-backed edges', () => {
    const result = buildSurveyTopology(
      [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 10, y: 20 }],
      [{ id: 'distance-1', station: 'A', target: 'B' }]
    )

    expect(result.hasCoordinateLayout).toBe(true)
    expect(result.nodes.map(({ id, positionedFromCoordinates }) => [id, positionedFromCoordinates])).toEqual([['A', true], ['B', true]])
    expect(result.edges[0]).toMatchObject({ from: 'A', to: 'B', sourceObservationId: 'distance-1' })
  })

  it('drops observations that do not resolve to two known points', () => {
    const result = buildSurveyTopology([{ id: 'A' }], [{ id: 'broken', from: 'A', to: 'MISSING' }])
    expect(result.edges).toHaveLength(0)
  })
})
