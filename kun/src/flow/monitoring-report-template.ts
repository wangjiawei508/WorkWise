import type { FlowDefinitionV1 } from '../contracts/flow.js'

const node = (id: string, type: string, label: string, x: number) => ({
  id, type, label, position: { x, y: 160 }, bindings: {}, config: {},
  policy: { timeoutMs: 120_000, retryAttempts: 1, retryBackoffMs: 1000, errorBehavior: 'fail' as const, concurrencyLimit: 1, resumable: true, breakpoint: false }, disabled: false
})

/** Reusable graph definition; adapters are resolved by the same Runtime as the Engineering UI. */
export const MONITORING_REPORT_FLOW_TEMPLATE: Omit<FlowDefinitionV1, 'revision' | 'createdAt' | 'updatedAt'> = {
  schemaVersion: 1, id: 'builtin_monitoring_report', name: 'Monitoring report delivery',
  description: 'Import data, validate quality, analyse trends, generate evidence, request approval, and archive.',
  nodes: [
    node('trigger', 'manual_trigger', '数据导入', 0),
    node('quality', 'railwise.monitoring_data_first_check', '质量校核', 220),
    node('analysis', 'railwise.deformation_rate', '趋势分析', 440),
    node('chart', 'railwise.chart_generator', '图表生成', 660),
    node('report', 'railwise.report_export', '报告生成', 880),
    node('approval', 'human_approval', '人工审批', 1100),
    node('archive', 'railwise.archive', '成果归档', 1320)
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'trigger', sourcePortId: 'output', targetNodeId: 'quality', targetPortId: 'input', branch: 'normal' },
    { id: 'e2', sourceNodeId: 'quality', sourcePortId: 'output', targetNodeId: 'analysis', targetPortId: 'input', branch: 'normal' },
    { id: 'e3', sourceNodeId: 'analysis', sourcePortId: 'output', targetNodeId: 'chart', targetPortId: 'input', branch: 'normal' },
    { id: 'e4', sourceNodeId: 'chart', sourcePortId: 'output', targetNodeId: 'report', targetPortId: 'input', branch: 'normal' },
    { id: 'e5', sourceNodeId: 'report', sourcePortId: 'file', targetNodeId: 'approval', targetPortId: 'file', branch: 'normal' },
    { id: 'e6', sourceNodeId: 'approval', sourcePortId: 'approved', targetNodeId: 'archive', targetPortId: 'input', branch: 'normal' }
  ], variables: { builtin: true, engineering: true }
}
