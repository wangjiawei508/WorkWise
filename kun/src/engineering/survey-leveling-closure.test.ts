import { describe, expect, it } from 'vitest'
import { levelingNetworkClosures } from './survey-leveling-closure.js'

describe('raw leveling network closures', () => {
  it('reports independent attached-route and loop closures in an unordered branched network', () => {
    const controls = new Map([['A', 100], ['B', 103]])
    const edges = [
      { id: 'a', from: 'A', to: 'P', heightDifferenceMetres: 1 },
      { id: 'b', from: 'P', to: 'Q', heightDifferenceMetres: 1.001 },
      { id: 'c', from: 'Q', to: 'B', heightDifferenceMetres: 1 },
      { id: 'd', from: 'P', to: 'B', heightDifferenceMetres: 2.003 },
      { id: 'e', from: 'Q', to: 'A', heightDifferenceMetres: -2.005 }
    ]
    const closures = levelingNetworkClosures(controls, edges)
    expect(closures).toEqual([
      { observationId: 'b', misclosureMetres: expect.closeTo(-0.004, 12) },
      { observationId: 'c', misclosureMetres: expect.closeTo(0.005, 12) },
      { observationId: 'd', misclosureMetres: expect.closeTo(0.003, 12) }
    ])
    expect(levelingNetworkClosures(new Map([...controls].reverse()), [...edges].reverse())).toEqual(closures)
  })

  it('keeps reverse and parallel observations distinct and does not invent closure on a tree', () => {
    const controls = new Map([['A', 10]])
    const first = { id: 'a', from: 'A', to: 'P', heightDifferenceMetres: 1 }
    expect(levelingNetworkClosures(controls, [first])).toEqual([])
    expect(levelingNetworkClosures(controls, [first, { id: 'b', from: 'P', to: 'A', heightDifferenceMetres: -0.999 }])).toEqual([
      { observationId: 'b', misclosureMetres: expect.closeTo(0.001, 12) }
    ])
    expect(levelingNetworkClosures(controls, [{ id: 'disconnected', from: 'X', to: 'Y', heightDifferenceMetres: 5 }])).toEqual([])
  })
})
