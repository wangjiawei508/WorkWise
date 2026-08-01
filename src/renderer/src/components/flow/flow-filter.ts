export type FlowListFilter = 'all' | 'scheduled'
export function flowMatchesFilter(flow: { nodes: Array<{ type: string }> }, filter: FlowListFilter): boolean { return filter === 'all' || flow.nodes.some((node) => node.type === 'schedule_trigger') }
