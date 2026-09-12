export type LevelingClosureEdge = Readonly<{ id: string; from: string; to: string; heightDifferenceMetres: number }>

/**
 * Fundamental closures of a control-rooted spanning forest. Every non-tree
 * observation closes either a loop or an attached route between controls.
 * Values use raw height differences, not adjusted coordinates or residuals.
 */
export function levelingNetworkClosures(
  knownHeights: ReadonlyMap<string, number>,
  inputEdges: readonly LevelingClosureEdge[]
): ReadonlyArray<Readonly<{ observationId: string; misclosureMetres: number }>> {
  const edges = [...inputEdges].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  const adjacency = new Map<string, Array<{ index: number; to: string; delta: number }>>()
  edges.forEach((edge, index) => {
    const from = adjacency.get(edge.from) ?? []
    from.push({ index, to: edge.to, delta: edge.heightDifferenceMetres })
    adjacency.set(edge.from, from)
    const to = adjacency.get(edge.to) ?? []
    to.push({ index, to: edge.from, delta: -edge.heightDifferenceMetres })
    adjacency.set(edge.to, to)
  })
  const treeEdges = new Set<number>()
  const queue = [...knownHeights.keys()].sort()
  const origin = knownHeights.get(queue[0] ?? '') ?? 0
  const potentials = new Map([...knownHeights].map(([id, height]) => [id, height - origin]))
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor]!
    for (const edge of adjacency.get(id) ?? []) {
      if (potentials.has(edge.to)) continue
      potentials.set(edge.to, potentials.get(id)! + edge.delta)
      treeEdges.add(edge.index)
      queue.push(edge.to)
    }
  }
  return edges.flatMap((edge, index) => {
    const from = potentials.get(edge.from)
    const to = potentials.get(edge.to)
    if (treeEdges.has(index) || from === undefined || to === undefined) return []
    return [{ observationId: edge.id, misclosureMetres: from + edge.heightDifferenceMetres - to }]
  })
}
