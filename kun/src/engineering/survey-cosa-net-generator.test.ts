import { describe, expect, it } from 'vitest'
import { parseCosaNet, type CosaNetCoordinate } from './survey-cosa-net.js'
import {
  generateCosaNet,
  type CosaNetGeneratorInput
} from './survey-cosa-net-generator.js'

/** All topology inputs in this suite are synthetic geometry fixtures, not COSA-certified files. */
function coordinates(input: CosaNetGeneratorInput): ReadonlyMap<string, CosaNetCoordinate> {
  return new Map(input.points.map((point) => [point.id, { x: point.x, y: point.y }]))
}

function ambiguityTriangleInput(): CosaNetGeneratorInput {
  return {
    points: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 100, y: 0 },
      { id: 'P', x: 35, y: -40 }
    ],
    // `P` is the ambiguous distance-intersection candidate; all three real
    // measured edges are supplied, in deliberately non-canonical order.
    edges: [
      { first: 'P', second: 'B' },
      { first: 'A', second: 'P' },
      { first: 'B', second: 'A' }
    ]
  }
}

describe('COSA .NET topology generator', () => {
  it('enumerates a measured ambiguity triangle and emits its deterministic counter-clockwise line', () => {
    const input = ambiguityTriangleInput()
    const result = generateCosaNet(input)

    expect(result).toMatchObject({
      state: 'generated',
      text: 'A,P,B\n',
      diagnostics: [],
      summary: { inputPointCount: 3, inputEdgeCount: 3, uniqueEdgeCount: 3, outputTriangleCount: 1 }
    })
    expect(result.triangles).toEqual([
      expect.objectContaining({
        id: 'cosa-net-generated-triangle-1',
        points: ['A', 'P', 'B'],
        signedDoubleArea: 4000
      })
    ])
    expect(result.triangles[0]!.signedDoubleArea).toBeGreaterThan(0)
    expect([...result.text!].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true)
  })

  it('deduplicates reverse and repeated undirected edges without changing the deterministic output', () => {
    const input = ambiguityTriangleInput()
    const result = generateCosaNet({
      ...input,
      edges: [
        { first: 'B', second: 'A' },
        { first: 'P', second: 'A' },
        { first: 'A', second: 'B' },
        { first: 'A', second: 'P' },
        { first: 'B', second: 'P' },
        { first: 'P', second: 'B' }
      ]
    })

    expect(result).toMatchObject({
      state: 'generated',
      text: 'A,P,B\n',
      summary: { inputEdgeCount: 6, uniqueEdgeCount: 3, duplicateEdgeCount: 3, outputTriangleCount: 1 }
    })
    expect(result.diagnostics).toHaveLength(3)
    expect(result.diagnostics.every((item) => item.code === 'duplicate-edge' && item.severity === 'warning')).toBe(true)
  })

  it('blocks all output when a degenerate triangle or invalid edge is present, rather than emitting a prefix', () => {
    const degenerateAlongsideValid = generateCosaNet({
      points: [
        { id: 'A', x: 0, y: 0 }, { id: 'B', x: 1, y: 0 }, { id: 'C', x: 2, y: 0 },
        { id: 'D', x: 0, y: 2 }, { id: 'E', x: 2, y: 2 }, { id: 'F', x: 0, y: 4 }
      ],
      edges: [
        { first: 'A', second: 'B' }, { first: 'B', second: 'C' }, { first: 'C', second: 'A' },
        { first: 'D', second: 'E' }, { first: 'E', second: 'F' }, { first: 'F', second: 'D' }
      ]
    })

    expect(degenerateAlongsideValid).toMatchObject({ state: 'blocked', text: null, triangles: [] })
    expect(degenerateAlongsideValid.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'degenerate-triangle', severity: 'blocking', pointIds: ['A', 'B', 'C'], recoverable: true })
    ]))

    const badEdges = generateCosaNet({
      points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 1, y: 0 }],
      edges: [{ first: 'A', second: 'A' }, { first: 'A', second: 'MISSING' }]
    })
    expect(badEdges).toMatchObject({ state: 'blocked', text: null, triangles: [] })
    expect(badEdges.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'self-edge', severity: 'blocking', recoverable: true }),
      expect.objectContaining({ code: 'unknown-coordinate', severity: 'blocking', pointIds: ['MISSING'], recoverable: true })
    ]))
  })

  it('reports isolated points and non-triangular closed residual topology without inventing a diagonal', () => {
    const result = generateCosaNet({
      points: [
        { id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 0, y: 3 },
        { id: 'D', x: 10, y: 0 }, { id: 'E', x: 14, y: 0 }, { id: 'F', x: 14, y: 4 }, { id: 'G', x: 10, y: 4 },
        { id: 'I', x: 99, y: 99 }
      ],
      edges: [
        { first: 'A', second: 'B' }, { first: 'B', second: 'C' }, { first: 'C', second: 'A' },
        { first: 'D', second: 'E' }, { first: 'E', second: 'F' }, { first: 'F', second: 'G' }, { first: 'G', second: 'D' }
      ]
    })

    expect(result).toMatchObject({
      state: 'generated',
      text: 'A,B,C\n',
      summary: {
        outputTriangleCount: 1,
        isolatedPointIds: ['I'],
        nonTriangularCycleComponents: [['D', 'E', 'F', 'G']]
      }
    })
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'isolated-point', severity: 'warning', pointIds: ['I'], recoverable: true }),
      expect.objectContaining({ code: 'non-triangular-cycle', severity: 'warning', pointIds: ['D', 'E', 'F', 'G'], recoverable: true })
    ]))
    expect(result.text).not.toContain('D,E,F')
  })

  it('round-trips every emitted line through the isolated COSA .NET reader with positive orientation', () => {
    const input = {
      points: [
        { id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 0, y: 3 },
        { id: 'D', x: 4, y: 3 }
      ],
      edges: [
        { first: 'A', second: 'B' }, { first: 'B', second: 'C' }, { first: 'C', second: 'A' },
        { first: 'B', second: 'D' }, { first: 'D', second: 'C' }
      ]
    } satisfies CosaNetGeneratorInput
    const generated = generateCosaNet(input)
    expect(generated.state).toBe('generated')

    const readBack = parseCosaNet(generated.text!, coordinates(input))
    expect(readBack).toMatchObject({ state: 'valid', diagnostics: [] })
    expect(readBack.triangles).toHaveLength(generated.triangles.length)
    expect(readBack.triangles.every((triangle) => triangle.orientation === 'counter-clockwise' && triangle.signedDoubleArea > 0)).toBe(true)
  })
})
