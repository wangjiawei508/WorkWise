import type { CosaNetCoordinate } from './survey-cosa-net.js'

/**
 * Isolated COSA `.NET` topology generator for the documented A-09 subset.
 *
 * It accepts only explicitly supplied coordinates and undirected measured
 * edges. It never infers a coordinate, adds a diagonal, or fabricates an
 * observation. This is a synthetic-geometry foundation only: it is not wired
 * into the registry, COSA file groups, UI, or a real COSA interoperability
 * acceptance flow.
 */

const ASCII_POINT_ID = /^[\x21-\x2b\x2d-\x7e]+$/

export type CosaNetGeneratorPoint = Readonly<{
  id: string
  x: number
  y: number
}>

/** `first` and `second` are intentionally unordered measurement endpoints. */
export type CosaNetUndirectedEdge = Readonly<{
  first: string
  second: string
}>

export type CosaNetGeneratorInput = Readonly<{
  /** Explicit known or approximate planar coordinates; no coordinate is inferred. */
  points: readonly CosaNetGeneratorPoint[]
  /** Explicit measured edges; only complete three-edge cycles are emitted. */
  edges: readonly CosaNetUndirectedEdge[]
}>

export type CosaNetGeneratorDiagnosticCode =
  | 'invalid-input'
  | 'invalid-point'
  | 'invalid-point-id'
  | 'duplicate-point-id'
  | 'invalid-coordinate'
  | 'invalid-edge'
  | 'self-edge'
  | 'unknown-coordinate'
  | 'duplicate-edge'
  | 'invalid-geometry'
  | 'degenerate-triangle'
  | 'isolated-point'
  | 'non-triangular-cycle'
  | 'no-triangles'

export type CosaNetGeneratorDiagnostic = Readonly<{
  code: CosaNetGeneratorDiagnosticCode
  severity: 'blocking' | 'warning'
  /** Stable input/topology location, not a source-file byte offset. */
  path: string
  pointIds: readonly string[]
  message: string
  suggestedAction: string
  /** Every diagnostic can be resolved by correcting input and regenerating. */
  recoverable: true
}>

export type CosaNetGeneratedTriangle = Readonly<{
  id: string
  /** Deterministic counter-clockwise point order used in the emitted line. */
  points: readonly [string, string, string]
  /** Positive signed double area (`2S`), retained as geometric evidence. */
  signedDoubleArea: number
}>

export type CosaNetGeneratorSummary = Readonly<{
  inputPointCount: number
  inputEdgeCount: number
  uniqueEdgeCount: number
  duplicateEdgeCount: number
  /** Number of lines actually emitted; always zero for a blocked result. */
  outputTriangleCount: number
  isolatedPointIds: readonly string[]
  /** Residual cyclic components that cannot be represented by generated triangles. */
  nonTriangularCycleComponents: readonly (readonly string[])[]
}>

export type CosaNetGenerationResult = Readonly<{
  /** `blocked` and `no-triangles` deliberately expose no empty/partial `.NET` source. */
  state: 'generated' | 'no-triangles' | 'blocked'
  /** Deterministic ASCII, LF-terminated `.NET` source only when state is `generated`. */
  text: string | null
  triangles: readonly CosaNetGeneratedTriangle[]
  diagnostics: readonly CosaNetGeneratorDiagnostic[]
  summary: CosaNetGeneratorSummary
}>

type NormalizedEdge = Readonly<{
  key: string
  first: string
  second: string
}>

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function freezeTriple(first: string, second: string, third: string): readonly [string, string, string] {
  return Object.freeze([first, second, third]) as unknown as readonly [string, string, string]
}

function comparePointIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedEdge(first: string, second: string): NormalizedEdge {
  const [left, right] = comparePointIds(first, second) < 0 ? [first, second] : [second, first]
  // Point identifiers are ASCII graphic characters and cannot contain NUL.
  return Object.freeze({ key: `${left}\u0000${right}`, first: left, second: right })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPointId(value: unknown): value is string {
  return typeof value === 'string' && ASCII_POINT_ID.test(value)
}

function diagnostic(
  code: CosaNetGeneratorDiagnosticCode,
  severity: CosaNetGeneratorDiagnostic['severity'],
  path: string,
  pointIds: readonly string[],
  message: string,
  suggestedAction: string
): CosaNetGeneratorDiagnostic {
  return Object.freeze({
    code,
    severity,
    path,
    pointIds: freezeArray(pointIds),
    message,
    suggestedAction,
    recoverable: true as const
  })
}

function hasBlockingDiagnostic(diagnostics: readonly CosaNetGeneratorDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'blocking')
}

function doubleArea(
  first: CosaNetCoordinate,
  second: CosaNetCoordinate,
  third: CosaNetCoordinate
): number {
  return (second.x - first.x) * (third.y - first.y) - (third.x - first.x) * (second.y - first.y)
}

function freezeComponents(components: readonly (readonly string[])[]): readonly (readonly string[])[] {
  return Object.freeze(components.map((component) => freezeArray(component)))
}

function summary(
  inputPointCount: number,
  inputEdgeCount: number,
  uniqueEdgeCount: number,
  duplicateEdgeCount: number,
  outputTriangleCount: number,
  isolatedPointIds: readonly string[] = [],
  nonTriangularCycleComponents: readonly (readonly string[])[] = []
): CosaNetGeneratorSummary {
  return Object.freeze({
    inputPointCount,
    inputEdgeCount,
    uniqueEdgeCount,
    duplicateEdgeCount,
    outputTriangleCount,
    isolatedPointIds: freezeArray(isolatedPointIds),
    nonTriangularCycleComponents: freezeComponents(nonTriangularCycleComponents)
  })
}

function result(
  state: CosaNetGenerationResult['state'],
  text: string | null,
  triangles: readonly CosaNetGeneratedTriangle[],
  diagnostics: readonly CosaNetGeneratorDiagnostic[],
  resultSummary: CosaNetGeneratorSummary
): CosaNetGenerationResult {
  return Object.freeze({
    state,
    text,
    triangles: freezeArray(triangles),
    diagnostics: freezeArray(diagnostics),
    summary: resultSummary
  })
}

function cyclicResidualComponents(edges: readonly NormalizedEdge[]): readonly (readonly string[])[] {
  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    const firstNeighbors = adjacency.get(edge.first) ?? new Set<string>()
    firstNeighbors.add(edge.second)
    adjacency.set(edge.first, firstNeighbors)
    const secondNeighbors = adjacency.get(edge.second) ?? new Set<string>()
    secondNeighbors.add(edge.first)
    adjacency.set(edge.second, secondNeighbors)
  }

  const visited = new Set<string>()
  const cyclic: string[][] = []
  for (const start of [...adjacency.keys()].sort(comparePointIds)) {
    if (visited.has(start)) continue
    const queue = [start]
    const component: string[] = []
    let cursor = 0
    let degreeSum = 0
    visited.add(start)
    while (cursor < queue.length) {
      const pointId = queue[cursor]!
      cursor += 1
      component.push(pointId)
      const neighbors = adjacency.get(pointId)!
      degreeSum += neighbors.size
      for (const neighbor of [...neighbors].sort(comparePointIds)) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
    // In an undirected connected component, E >= V is equivalent to having at
    // least one closed cycle. These are residual edges not used by any emitted
    // three-edge triangle, so they require user review rather than synthesis.
    if (degreeSum / 2 >= component.length) cyclic.push(component.sort(comparePointIds))
  }
  return freezeComponents(cyclic)
}

/**
 * Enumerate all complete, measured three-edge cycles and render them as COSA
 * `.NET` lines. Input order, undirected edge orientation, and duplicate edges
 * do not affect the output. Any blocking input or geometry issue makes the
 * whole result non-emittable; a prefix `.NET` is never returned.
 */
export function generateCosaNet(input: CosaNetGeneratorInput): CosaNetGenerationResult {
  const rawInput = input as unknown
  const inputRecord = isRecord(rawInput) ? rawInput : undefined
  const rawPoints = inputRecord && Array.isArray(inputRecord.points) ? inputRecord.points : undefined
  const rawEdges = inputRecord && Array.isArray(inputRecord.edges) ? inputRecord.edges : undefined
  const diagnostics: CosaNetGeneratorDiagnostic[] = []

  if (!rawPoints) {
    diagnostics.push(diagnostic(
      'invalid-input',
      'blocking',
      'input.points',
      [],
      '生成 COSA .NET 需要明确的点坐标数组。',
      '提供 points: [{ id, x, y }, ...]，且每个坐标均为有限数值。'
    ))
  }
  if (!rawEdges) {
    diagnostics.push(diagnostic(
      'invalid-input',
      'blocking',
      'input.edges',
      [],
      '生成 COSA .NET 需要明确的无向测边数组。',
      '提供 edges: [{ first, second }, ...]；生成器不会补充缺失测边。'
    ))
  }

  const coordinateById = new Map<string, CosaNetCoordinate>()
  const declaredPointIds = new Set<string>()
  const invalidCoordinateIds = new Set<string>()
  for (let index = 0; index < (rawPoints?.length ?? 0); index += 1) {
    const rawPoint = rawPoints![index]
    const path = `input.points[${index}]`
    if (!isRecord(rawPoint)) {
      diagnostics.push(diagnostic(
        'invalid-point',
        'blocking',
        path,
        [],
        `${path} 必须是含 id、x、y 的点坐标对象。`,
        '将该项改为 { id: "点名", x: 数值, y: 数值 }。'
      ))
      continue
    }
    if (!isPointId(rawPoint.id)) {
      diagnostics.push(diagnostic(
        'invalid-point-id',
        'blocking',
        `${path}.id`,
        [],
        `${path}.id 必须是非空 ASCII 点名，且不能包含逗号、空白或换行。`,
        '提供能够原样写入 point1,point2,point3 的 ASCII 点名。'
      ))
      continue
    }
    const id = rawPoint.id
    if (declaredPointIds.has(id)) {
      diagnostics.push(diagnostic(
        'duplicate-point-id',
        'blocking',
        `${path}.id`,
        [id],
        `点名 ${id} 被重复定义，生成器无法判断应使用哪组坐标。`,
        '保留每个点名的一组明确坐标，或为不同点使用不同点名。'
      ))
      continue
    }
    declaredPointIds.add(id)
    if (typeof rawPoint.x !== 'number' || typeof rawPoint.y !== 'number' || !Number.isFinite(rawPoint.x) || !Number.isFinite(rawPoint.y)) {
      invalidCoordinateIds.add(id)
      diagnostics.push(diagnostic(
        'invalid-coordinate',
        'blocking',
        path,
        [id],
        `点 ${id} 的 X、Y 坐标必须都是有限数值。`,
        '提供该点的明确已知或概略平面坐标后重新生成。'
      ))
      continue
    }
    coordinateById.set(id, Object.freeze({ x: rawPoint.x, y: rawPoint.y }))
  }

  const edgeByKey = new Map<string, NormalizedEdge>()
  let duplicateEdgeCount = 0
  for (let index = 0; index < (rawEdges?.length ?? 0); index += 1) {
    const rawEdge = rawEdges![index]
    const path = `input.edges[${index}]`
    if (!isRecord(rawEdge)) {
      diagnostics.push(diagnostic(
        'invalid-edge',
        'blocking',
        path,
        [],
        `${path} 必须是含 first、second 的无向测边对象。`,
        '将该项改为 { first: "点名1", second: "点名2" }。'
      ))
      continue
    }
    if (!isPointId(rawEdge.first) || !isPointId(rawEdge.second)) {
      diagnostics.push(diagnostic(
        'invalid-edge',
        'blocking',
        path,
        [],
        `${path} 的两个端点必须是可原样写入 .NET 的非空 ASCII 点名。`,
        '为 first 和 second 提供不含逗号、空白或换行的 ASCII 点名。'
      ))
      continue
    }
    const first = rawEdge.first
    const second = rawEdge.second
    if (first === second) {
      diagnostics.push(diagnostic(
        'self-edge',
        'blocking',
        path,
        [first],
        `测边 ${first}-${second} 是自环，不能构成交会三角形。`,
        '删除该自环，或提供两个不同点之间的实际测边。'
      ))
      continue
    }
    const unknownIds = [first, second].filter((pointId) => !declaredPointIds.has(pointId))
    if (unknownIds.length) {
      diagnostics.push(diagnostic(
        'unknown-coordinate',
        'blocking',
        path,
        unknownIds,
        `测边 ${first}-${second} 引用了未提供明确坐标的点：${unknownIds.join('、')}。`,
        '为每个测边端点提供唯一、有限的 X/Y 坐标；生成器不会推算坐标。'
      ))
      continue
    }
    const coordinateInvalidIds = [first, second].filter((pointId) => invalidCoordinateIds.has(pointId))
    if (coordinateInvalidIds.length) continue
    // A duplicate-id blocker may leave a declared endpoint without a usable
    // coordinate. Its duplicate definition diagnostic is already authoritative.
    if (!coordinateById.has(first) || !coordinateById.has(second)) continue

    const edge = normalizedEdge(first, second)
    if (edgeByKey.has(edge.key)) {
      duplicateEdgeCount += 1
      diagnostics.push(diagnostic(
        'duplicate-edge',
        'warning',
        path,
        [edge.first, edge.second],
        `测边 ${edge.first}-${edge.second} 与先前无向测边重复，已仅保留一条拓扑边。`,
        '可移除重复观测拓扑声明；原始观测是否重复应在观测质量流程中另行核查。'
      ))
      continue
    }
    edgeByKey.set(edge.key, edge)
  }

  const inputPointCount = rawPoints?.length ?? 0
  const inputEdgeCount = rawEdges?.length ?? 0
  const normalizedEdges = [...edgeByKey.values()].sort((left, right) => comparePointIds(left.key, right.key))
  if (hasBlockingDiagnostic(diagnostics)) {
    return result(
      'blocked',
      null,
      [],
      diagnostics,
      summary(inputPointCount, inputEdgeCount, normalizedEdges.length, duplicateEdgeCount, 0)
    )
  }

  const pointIds = [...coordinateById.keys()].sort(comparePointIds)
  const adjacency = new Map<string, Set<string>>(pointIds.map((pointId) => [pointId, new Set<string>()]))
  for (const edge of normalizedEdges) {
    adjacency.get(edge.first)!.add(edge.second)
    adjacency.get(edge.second)!.add(edge.first)
  }

  const triangles: CosaNetGeneratedTriangle[] = []
  const triangleEdgeKeys = new Set<string>()
  for (const first of pointIds) {
    const firstNeighbors = [...adjacency.get(first)!].filter((pointId) => comparePointIds(pointId, first) > 0).sort(comparePointIds)
    for (const second of firstNeighbors) {
      const secondNeighbors = [...adjacency.get(second)!].filter((pointId) => comparePointIds(pointId, second) > 0).sort(comparePointIds)
      for (const third of secondNeighbors) {
        if (!adjacency.get(first)!.has(third)) continue
        const area = doubleArea(coordinateById.get(first)!, coordinateById.get(second)!, coordinateById.get(third)!)
        const trianglePointIds = freezeTriple(first, second, third)
        if (!Number.isFinite(area)) {
          diagnostics.push(diagnostic(
            'invalid-geometry',
            'blocking',
            `topology.triangle(${first},${second},${third})`,
            trianglePointIds,
            `三角形 ${first},${second},${third} 的有向面积不是有限数值，无法安全生成 .NET。`,
            '缩小或校核输入坐标范围，确保三角形面积可在数值范围内计算。'
          ))
          continue
        }
        if (area === 0) {
          diagnostics.push(diagnostic(
            'degenerate-triangle',
            'blocking',
            `topology.triangle(${first},${second},${third})`,
            trianglePointIds,
            `三条已给测边形成的 ${first},${second},${third} 三角形共线（2S=0）。`,
            '校核点坐标和测边拓扑；不要为退化三角形生成 .NET 行。'
          ))
          continue
        }
        const points = area > 0 ? trianglePointIds : freezeTriple(first, third, second)
        triangles.push(Object.freeze({
          id: `cosa-net-generated-triangle-${triangles.length + 1}`,
          points,
          signedDoubleArea: Math.abs(area)
        }))
        triangleEdgeKeys.add(normalizedEdge(first, second).key)
        triangleEdgeKeys.add(normalizedEdge(first, third).key)
        triangleEdgeKeys.add(normalizedEdge(second, third).key)
      }
    }
  }

  if (hasBlockingDiagnostic(diagnostics)) {
    return result(
      'blocked',
      null,
      [],
      diagnostics,
      summary(inputPointCount, inputEdgeCount, normalizedEdges.length, duplicateEdgeCount, 0)
    )
  }

  const isolatedPointIds = pointIds.filter((pointId) => adjacency.get(pointId)!.size === 0)
  if (isolatedPointIds.length) {
    diagnostics.push(diagnostic(
      'isolated-point',
      'warning',
      'topology.isolatedPoints',
      isolatedPointIds,
      `发现 ${isolatedPointIds.length} 个孤立点：${isolatedPointIds.join('、')}；它们不参与任何已给测边。`,
      '补充实际测边，或确认这些点不属于本次待生成的交会网。'
    ))
  }

  const residualEdges = normalizedEdges.filter((edge) => !triangleEdgeKeys.has(edge.key))
  const nonTriangularCycleComponents = cyclicResidualComponents(residualEdges)
  for (let index = 0; index < nonTriangularCycleComponents.length; index += 1) {
    const component = nonTriangularCycleComponents[index]!
    diagnostics.push(diagnostic(
      'non-triangular-cycle',
      'warning',
      `topology.residualCycleComponents[${index}]`,
      component,
      `点 ${component.join('、')} 构成未被任何已给三角形覆盖的闭环；生成器不会擅自添加对角测边。`,
      '核查该闭环是否需要额外的实测对角边、.XYO 概略坐标或其他网形处理；确认后重新生成。'
    ))
  }

  const resultSummary = summary(
    inputPointCount,
    inputEdgeCount,
    normalizedEdges.length,
    duplicateEdgeCount,
    triangles.length,
    isolatedPointIds,
    nonTriangularCycleComponents
  )
  if (!triangles.length) {
    diagnostics.push(diagnostic(
      'no-triangles',
      'warning',
      'topology',
      [],
      '没有找到由三条已给测边闭合而成的非退化交会三角形，因此没有生成 .NET 文本。',
      '提供完整的三边交会拓扑后重新生成；生成器不会补造缺失边。'
    ))
    return result('no-triangles', null, [], diagnostics, resultSummary)
  }

  const text = `${triangles.map((triangle) => triangle.points.join(',')).join('\n')}\n`
  return result('generated', text, triangles, diagnostics, resultSummary)
}
