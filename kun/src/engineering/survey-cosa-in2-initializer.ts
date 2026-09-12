/**
 * Deterministic, bounded approximate-coordinate initializer for COSA `.in2`
 * distance networks. It is deliberately an initializer only: the canonical
 * weighted adjustment remains the source of the reported coordinates.
 */

export const COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS = Object.freeze({
  maxNodes: 250,
  maxEdges: 2_000,
  iterations: 4_000,
  seedCount: 8
})

export type CosaDistanceNetworkInitialPoint = Readonly<{
  id: string
  fixed: boolean
  x?: number
  y?: number
}>

export type CosaDistanceNetworkDistance = Readonly<{
  from: string
  to: string
  distance: number
}>

/**
 * A horizontal circle reading attached to one distance-network station. It is
 * used only to derive deterministic initializer geometry; the canonical
 * adjustment still consumes the original directions and distances separately.
 */
export type CosaDistanceNetworkDirection = Readonly<{
  station: string
  target: string
  radians: number
}>

export type CosaDistanceNetworkInitialization = Readonly<{
  initialCoordinates: ReadonlyMap<string, Readonly<{ x: number; y: number }>>
  unresolvedPointIds: readonly string[]
  rmsMetres: number | null
  limited: boolean
}>

type Coordinate = { x: number; y: number }
type Edge = CosaDistanceNetworkDistance & { from: string; to: string; distance: number }

/** Fit rotation and translation only: neither reflection nor scale is allowed. */
function rigidAlignment(local: ReadonlyMap<string, Coordinate>, target: ReadonlyMap<string, Coordinate>): ((point: Coordinate) => Coordinate) | null {
  const common = [...local.keys()].filter((id) => target.has(id)).sort()
  if (common.length < 2) return null
  const centroid = (source: ReadonlyMap<string, Coordinate>): Coordinate => ({
    x: common.reduce((sum, id) => sum + source.get(id)!.x, 0) / common.length,
    y: common.reduce((sum, id) => sum + source.get(id)!.y, 0) / common.length
  })
  const from = centroid(local)
  const to = centroid(target)
  let dot = 0
  let cross = 0
  for (const id of common) {
    const a = local.get(id)!
    const b = target.get(id)!
    dot += (a.x - from.x) * (b.x - to.x) + (a.y - from.y) * (b.y - to.y)
    cross += (a.x - from.x) * (b.y - to.y) - (a.y - from.y) * (b.x - to.x)
  }
  const norm = Math.hypot(dot, cross)
  if (!Number.isFinite(norm) || norm <= 1e-12) return null
  const cosine = dot / norm
  const sine = cross / norm
  return (point) => ({
    x: to.x + cosine * (point.x - from.x) - sine * (point.y - from.y),
    y: to.y + sine * (point.x - from.x) + cosine * (point.y - from.y)
  })
}

/**
 * Join oriented station-local polar layouts through at least two shared
 * points, then bind each component to two fixed controls. COSA uses X=north,
 * Y=east. Keeping signed directions avoids the mirror ambiguity of distances.
 * The result is an initial guess only, not a second adjustment or datum fit.
 */
export function initializeCosaDirectionDistanceNetwork(
  inputPoints: readonly CosaDistanceNetworkInitialPoint[],
  distances: readonly CosaDistanceNetworkDistance[],
  directions: readonly CosaDistanceNetworkDirection[]
): CosaDistanceNetworkInitialization {
  const unknowns = inputPoints.filter((point) => !point.fixed)
  const initialCoordinates = new Map<string, Coordinate>()
  if (inputPoints.length > COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxNodes
    || distances.length > COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxEdges
    || directions.length > COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxEdges) {
    return { initialCoordinates, unresolvedPointIds: unknowns.map((point) => point.id), rmsMetres: null, limited: true }
  }
  const ids = new Set(inputPoints.map((point) => point.id))
  const controls = new Map<string, Coordinate>()
  for (const point of inputPoints) {
    if (point.fixed && Number.isFinite(point.x) && Number.isFinite(point.y)) controls.set(point.id, { x: point.x!, y: point.y! })
  }
  const readings = new Map<string, Map<string, number>>()
  for (const direction of directions) {
    if (!ids.has(direction.station) || !ids.has(direction.target) || !Number.isFinite(direction.radians)) continue
    const station = readings.get(direction.station) ?? new Map<string, number>()
    station.set(direction.target, direction.radians)
    readings.set(direction.station, station)
  }
  const layouts = new Map<string, Map<string, Coordinate>>()
  for (const edge of distances) {
    const angle = readings.get(edge.from)?.get(edge.to)
    if (angle === undefined || edge.from === edge.to || !Number.isFinite(edge.distance) || edge.distance <= 0) continue
    const layout = layouts.get(edge.from) ?? new Map([[edge.from, { x: 0, y: 0 }]])
    layout.set(edge.to, { x: edge.distance * Math.cos(angle), y: edge.distance * Math.sin(angle) })
    layouts.set(edge.from, layout)
  }
  const remaining = new Set([...layouts.keys()].sort())
  while (remaining.size) {
    const seed = remaining.values().next().value!
    const component = new Map(layouts.get(seed)!)
    remaining.delete(seed)
    let joined = true
    while (joined) {
      joined = false
      for (const station of remaining) {
        const layout = layouts.get(station)!
        const align = rigidAlignment(layout, component)
        if (!align) continue
        for (const [id, point] of layout) if (!component.has(id)) component.set(id, align(point))
        remaining.delete(station)
        joined = true
      }
    }
    const align = rigidAlignment(component, controls)
    if (!align) continue
    for (const [id, point] of component) if (!controls.has(id) && !initialCoordinates.has(id)) initialCoordinates.set(id, align(point))
  }
  const unresolvedPointIds = unknowns.filter((point) => !initialCoordinates.has(point.id)).map((point) => point.id)
  const located = new Map([...controls, ...initialCoordinates])
  const activeEdges = distances.filter((edge) => located.has(edge.from) && located.has(edge.to) && Number.isFinite(edge.distance) && edge.distance > 0)
  const residual = rms(activeEdges, located)
  return { initialCoordinates, unresolvedPointIds, rmsMetres: Number.isFinite(residual) ? residual : null, limited: false }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function unitInterval(value: string): number {
  return fnv1a(value) / 0x1_0000_0000
}

function median(values: readonly number[]): number {
  if (!values.length) return 1
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function connectedToControls(points: ReadonlyMap<string, CosaDistanceNetworkInitialPoint>, edges: readonly Edge[]): Set<string> {
  const adjacent = new Map<string, string[]>()
  for (const edge of edges) {
    const from = adjacent.get(edge.from) ?? []
    from.push(edge.to)
    adjacent.set(edge.from, from)
    const to = adjacent.get(edge.to) ?? []
    to.push(edge.from)
    adjacent.set(edge.to, to)
  }
  const connected = new Set<string>()
  const queue = [...points.values()]
    .filter((point) => point.fixed && point.x !== undefined && point.y !== undefined)
    .map((point) => point.id)
  for (const id of queue) connected.add(id)
  for (let index = 0; index < queue.length; index += 1) {
    for (const id of adjacent.get(queue[index]!) ?? []) {
      if (!connected.has(id)) {
        connected.add(id)
        queue.push(id)
      }
    }
  }
  return connected
}

function rms(edges: readonly Edge[], coordinates: ReadonlyMap<string, Coordinate>): number {
  if (!edges.length) return Number.POSITIVE_INFINITY
  const sumSquares = edges.reduce((sum, edge) => {
    const from = coordinates.get(edge.from)
    const to = coordinates.get(edge.to)
    if (!from || !to) return Number.POSITIVE_INFINITY
    return sum + (Math.hypot(to.x - from.x, to.y - from.y) - edge.distance) ** 2
  }, 0)
  return Number.isFinite(sumSquares) ? Math.sqrt(sumSquares / edges.length) : Number.POSITIVE_INFINITY
}

/**
 * Returns coordinates only for originally unlocated non-fixed points. The
 * computation is normalized around the fixed-control centroid so large local
 * grid values do not reduce numerical stability.
 */
export function initializeCosaDistanceNetwork(
  inputPoints: readonly CosaDistanceNetworkInitialPoint[],
  inputDistances: readonly CosaDistanceNetworkDistance[]
): CosaDistanceNetworkInitialization {
  const points = new Map(inputPoints.map((point) => [point.id, point] as const))
  const edges: Edge[] = inputDistances
    .filter((edge) => edge.from !== edge.to && points.has(edge.from) && points.has(edge.to) && Number.isFinite(edge.distance) && edge.distance > 0)
    .map((edge) => ({ ...edge }))
  const unlocated = inputPoints.filter((point) => !point.fixed && (point.x === undefined || point.y === undefined))
  if (points.size > COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxNodes || edges.length > COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.maxEdges) {
    return { initialCoordinates: new Map(), unresolvedPointIds: unlocated.map((point) => point.id), rmsMetres: null, limited: true }
  }
  const controls = inputPoints.filter((point) => point.fixed && point.x !== undefined && point.y !== undefined) as Array<CosaDistanceNetworkInitialPoint & { x: number; y: number }>
  if (!controls.length || !edges.length || !unlocated.length) {
    return { initialCoordinates: new Map(), unresolvedPointIds: unlocated.map((point) => point.id), rmsMetres: null, limited: false }
  }
  const connected = connectedToControls(points, edges)
  const resolvable = unlocated.filter((point) => connected.has(point.id))
  const unresolvedPointIds = unlocated.filter((point) => !connected.has(point.id)).map((point) => point.id)
  if (!resolvable.length) return { initialCoordinates: new Map(), unresolvedPointIds, rmsMetres: null, limited: false }

  // COSA station coordinates can have a bounded centroid seed before a target
  // first appears. They remain unknowns: keeping them fixed would sever their
  // distance edges from target-only points during initialization.
  const variablePoints = inputPoints.filter((point) => !point.fixed && connected.has(point.id))

  const origin = {
    x: controls.reduce((sum, point) => sum + point.x, 0) / controls.length,
    y: controls.reduce((sum, point) => sum + point.y, 0) / controls.length
  }
  const scale = Math.max(1, median(edges.map((edge) => edge.distance)))
  const activeIds = new Set([...controls.map((point) => point.id), ...variablePoints.map((point) => point.id)])
  const activeEdges = edges.filter((edge) => activeIds.has(edge.from) && activeIds.has(edge.to))
  const fixedIds = new Set(controls.map((point) => point.id))
  let best: Map<string, Coordinate> | null = null
  let bestRms = Number.POSITIVE_INFINITY

  for (let seed = 0; seed < COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.seedCount; seed += 1) {
    const coordinates = new Map<string, Coordinate>()
    for (const point of controls) coordinates.set(point.id, { x: point.x - origin.x, y: point.y - origin.y })
    for (const point of variablePoints) {
      if (point.x !== undefined && point.y !== undefined) {
        coordinates.set(point.id, { x: point.x - origin.x, y: point.y - origin.y })
        continue
      }
      const angle = 2 * Math.PI * unitInterval(`angle:${seed}:${point.id}`)
      const radius = scale * (0.35 + 1.15 * unitInterval(`radius:${seed}:${point.id}`))
      coordinates.set(point.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
    }

    for (let iteration = 0; iteration < COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.iterations; iteration += 1) {
      const force = new Map<string, Coordinate>()
      for (const point of variablePoints) force.set(point.id, { x: 0, y: 0 })
      for (const edge of activeEdges) {
        const from = coordinates.get(edge.from)!
        const to = coordinates.get(edge.to)!
        let dx = from.x - to.x
        let dy = from.y - to.y
        let length = Math.hypot(dx, dy)
        if (length < 1e-9) {
          const angle = 2 * Math.PI * unitInterval(`separate:${seed}:${edge.from}:${edge.to}`)
          dx = Math.cos(angle) * 1e-6
          dy = Math.sin(angle) * 1e-6
          length = 1e-6
        }
        const error = length - edge.distance
        const gradientX = error * dx / length
        const gradientY = error * dy / length
        const fromForce = force.get(edge.from)
        if (fromForce) { fromForce.x -= gradientX; fromForce.y -= gradientY }
        const toForce = force.get(edge.to)
        if (toForce) { toForce.x += gradientX; toForce.y += gradientY }
      }
      const progress = iteration / Math.max(1, COSA_DISTANCE_NETWORK_INITIALIZER_LIMITS.iterations - 1)
      const learningRate = 0.045 * (1 - progress) + 0.0015
      const maxStep = scale * 0.08
      for (const point of variablePoints) {
        if (fixedIds.has(point.id)) continue
        const coordinate = coordinates.get(point.id)!
        const vector = force.get(point.id)!
        const length = Math.hypot(vector.x, vector.y)
        const ratio = length > maxStep / learningRate ? maxStep / (learningRate * length) : 1
        coordinate.x += learningRate * vector.x * ratio
        coordinate.y += learningRate * vector.y * ratio
      }
    }
    const candidateRms = rms(activeEdges, coordinates)
    if (candidateRms < bestRms) {
      bestRms = candidateRms
      best = new Map([...coordinates].map(([id, coordinate]) => [id, { ...coordinate }]))
    }
  }

  const initialCoordinates = new Map<string, Coordinate>()
  for (const point of resolvable) {
    if (point.x !== undefined && point.y !== undefined) continue
    const coordinate = best?.get(point.id)
    if (coordinate) initialCoordinates.set(point.id, { x: coordinate.x + origin.x, y: coordinate.y + origin.y })
  }
  return {
    initialCoordinates,
    unresolvedPointIds,
    rmsMetres: Number.isFinite(bestRms) ? bestRms : null,
    limited: false
  }
}
