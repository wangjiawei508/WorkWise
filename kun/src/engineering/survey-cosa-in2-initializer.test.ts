import { describe, expect, it } from 'vitest'
import {
  COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS,
  initializeCosaDirectionDistanceNetwork,
  initializeCosaDistanceNetwork
} from './survey-cosa-in2-initializer.js'

describe('COSA .in2 distance-network initializer', () => {
  it('is deterministic, fits connected distances, and leaves a disconnected target unresolved', () => {
    const points = [
      { id: 'A', fixed: true, x: 0, y: 0 },
      { id: 'B', fixed: true, x: 10, y: 0 },
      { id: 'P', fixed: false },
      { id: 'DISCONNECTED', fixed: false }
    ] as const
    const distances = [
      { from: 'A', to: 'P', distance: 5 },
      { from: 'B', to: 'P', distance: Math.sqrt(45) }
    ] as const

    const first = initializeCosaDistanceNetwork(points, distances)
    const second = initializeCosaDistanceNetwork(points, distances)

    expect([...first.initialCoordinates]).toEqual([...second.initialCoordinates])
    expect(first.initialCoordinates.get('P')).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number)
    }))
    expect(first.rmsMetres).toBeLessThan(0.01)
    expect(first.unresolvedPointIds).toEqual(['DISCONNECTED'])
    expect(first.limited).toBe(false)
  })

  it('fails closed at configured node and edge bounds without returning partial coordinates', () => {
    const tooManyPoints = Array.from(
      { length: COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxNodes + 1 },
      (_, index) => ({ id: `P${index}`, fixed: false })
    )
    const nodeLimited = initializeCosaDistanceNetwork(tooManyPoints, [])
    expect(nodeLimited).toMatchObject({
      initialCoordinates: new Map(),
      unresolvedPointIds: tooManyPoints.map((point) => point.id),
      rmsMetres: null,
      limited: true
    })

    const edgeLimited = initializeCosaDistanceNetwork(
      [{ id: 'A', fixed: true, x: 0, y: 0 }, { id: 'P', fixed: false }],
      Array.from(
        { length: COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxEdges + 1 },
        () => ({ from: 'A', to: 'P', distance: 1 })
      )
    )
    expect(edgeLimited).toMatchObject({
      initialCoordinates: new Map(),
      unresolvedPointIds: ['P'],
      rmsMetres: null,
      limited: true
    })
  })

  it('joins signed polar layouts when no station sees two controls, without modifying inputs', () => {
    const truth = new Map([
      ['A', { x: 3_000_000, y: 500_000 }], ['B', { x: 3_000_100, y: 500_025 }],
      ['S1', { x: 3_000_020, y: 500_040 }], ['S2', { x: 3_000_070, y: 500_055 }],
      ['T', { x: 3_000_040, y: 500_030 }], ['U', { x: 3_000_055, y: 500_060 }]
    ])
    const points = [...truth].map(([id, coordinate]) => ({ id, fixed: id === 'A' || id === 'B', ...(['A', 'B'].includes(id) ? coordinate : {}) }))
    const pairs = [['S1', 'A'], ['S1', 'T'], ['S1', 'U'], ['S2', 'T'], ['S2', 'U'], ['S2', 'B']]
    const distances = pairs.map(([from, to]) => ({ from: from!, to: to!, distance: Math.hypot(truth.get(to!)!.x - truth.get(from!)!.x, truth.get(to!)!.y - truth.get(from!)!.y) }))
    const directions = pairs.map(([station, target]) => ({ station: station!, target: target!, radians: Math.atan2(truth.get(target!)!.y - truth.get(station!)!.y, truth.get(target!)!.x - truth.get(station!)!.x) + (station === 'S1' ? 1.1 : -0.7) }))
    const original = JSON.stringify({ points, distances, directions })
    const first = initializeCosaDirectionDistanceNetwork(points, distances, directions)
    const second = initializeCosaDirectionDistanceNetwork([...points].reverse(), [...distances].reverse(), [...directions].reverse())
    expect(first.unresolvedPointIds).toEqual([])
    expect(first.initialCoordinates.size).toBe(4)
    expect(first.rmsMetres).toBeLessThan(1e-8)
    for (const [id, point] of first.initialCoordinates) {
      expect(point.x).toBeCloseTo(truth.get(id)!.x, 8)
      expect(point.y).toBeCloseTo(truth.get(id)!.y, 8)
      expect(second.initialCoordinates.get(id)!.x).toBeCloseTo(point.x, 8)
      expect(second.initialCoordinates.get(id)!.y).toBeCloseTo(point.y, 8)
    }
    expect(JSON.stringify({ points, distances, directions })).toBe(original)
    const missingDatum = initializeCosaDirectionDistanceNetwork(points.map((point) => ({ ...point, fixed: point.id === 'A' })), distances, directions)
    expect(missingDatum.initialCoordinates.size).toBe(0)
    expect(missingDatum.unresolvedPointIds).toHaveLength(5)
  })

  it('does not align components using only one shared target or coincident controls', () => {
    const points = [{ id: 'A', fixed: true, x: 0, y: 0 }, { id: 'B', fixed: true, x: 0, y: 0 }, { id: 'S', fixed: false }, { id: 'T', fixed: false }]
    const distances = [{ from: 'S', to: 'A', distance: 5 }, { from: 'S', to: 'B', distance: 5 }, { from: 'T', to: 'A', distance: 4 }]
    const directions = distances.map((edge, index) => ({ station: edge.from, target: edge.to, radians: index }))
    expect(initializeCosaDirectionDistanceNetwork(points, distances, directions).initialCoordinates.size).toBe(0)
    expect(initializeCosaDirectionDistanceNetwork(points, distances, Array.from({ length: COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxEdges + 1 }, () => directions[0]!)).limited).toBe(true)
  })
})
