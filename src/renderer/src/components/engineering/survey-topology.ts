export type TopologyPoint = {
  id: string
  x?: number
  y?: number
  known?: boolean
  pointClass?: string
}

export type TopologyObservation = {
  id: string
  from?: string
  to?: string
  station?: string
  target?: string
  left?: string
  right?: string
}

export type TopologyNode = TopologyPoint & {
  index: number
  x: number
  y: number
  positionedFromCoordinates: boolean
}

export type TopologyEdge = {
  id: string
  from: string
  to: string
  sourceObservationId: string
}

export type SurveyTopology = {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  hasCoordinateLayout: boolean
}

function endpointIds(observation: TopologyObservation): string[] {
  return [observation.from, observation.to, observation.station, observation.target, observation.left, observation.right]
    .filter((id): id is string => Boolean(id))
}

/**
 * Build a deterministic, source-backed network view model.
 *
 * Coordinates are preferred whenever every point has finite X/Y values. If
 * coordinates are incomplete we use a clearly marked fallback grid, but
 * edges still follow the observation's actual point ids; they never connect
 * points by array position.
 */
export function buildSurveyTopology(points: TopologyPoint[], observations: TopologyObservation[]): SurveyTopology {
  const hasCoordinateLayout = points.length > 0 && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  const coordinates = new Map<string, { x: number; y: number }>()

  if (hasCoordinateLayout) {
    const xs = points.map((point) => point.x as number)
    const ys = points.map((point) => point.y as number)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(1e-9, maxX - minX)
    const spanY = Math.max(1e-9, maxY - minY)
    for (const point of points) {
      coordinates.set(point.id, {
        x: 38 + ((point.x as number - minX) / spanX) * 444,
        y: 32 + (1 - (point.y as number - minY) / spanY) * 166
      })
    }
  } else {
    const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.max(1, points.length)))))
    points.forEach((point, index) => coordinates.set(point.id, {
      x: 54 + (index % columns) * (430 / Math.max(1, columns - 1 || 1)),
      y: 44 + Math.floor(index / columns) * 74
    }))
  }

  const nodes = points.map((point, index) => ({
    ...point,
    index,
    ...(coordinates.get(point.id) ?? { x: 54, y: 44 }),
    positionedFromCoordinates: hasCoordinateLayout
  }))
  const pointIds = new Set(points.map((point) => point.id))
  const edges: TopologyEdge[] = []
  for (const observation of observations) {
    const ids = endpointIds(observation).filter((id) => pointIds.has(id))
    if (ids.length < 2) continue
    const [from, to] = ids
    if (!from || !to || from === to) continue
    edges.push({ id: `${observation.id}:${from}:${to}`, from, to, sourceObservationId: observation.id })
  }
  return { nodes, edges, hasCoordinateLayout }
}
