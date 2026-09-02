import { describe, expect, it } from 'vitest'
import { MONITORING_REPORT_FLOW_TEMPLATE } from './monitoring-report-template.js'
import { buildFlowNodeRegistry } from './node-registry.js'
import { validateFlowDefinition } from './validator.js'

describe('monitoring report flow template', () => {
  it('contains the deterministic delivery stages and validates with the built-in registry', () => {
    const result = validateFlowDefinition({ ...MONITORING_REPORT_FLOW_TEMPLATE, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, buildFlowNodeRegistry({ railwise: { available: true } }))
    expect(result.valid).toBe(true)
    expect(MONITORING_REPORT_FLOW_TEMPLATE.nodes.map((node) => node.type)).toEqual(expect.arrayContaining(['railwise.monitoring_data_first_check', 'railwise.deformation_rate', 'railwise.chart_generator', 'railwise.report_export', 'human_approval', 'railwise.archive']))
  })
})
