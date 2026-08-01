import { describe, expect, it } from 'vitest'
import { flowMatchesFilter } from './flow-filter'
describe('Flow list filter', () => { it('keeps only scheduled-trigger Flows in the legacy schedule view', () => { expect(flowMatchesFilter({ nodes: [{ type: 'schedule_trigger' }] }, 'scheduled')).toBe(true); expect(flowMatchesFilter({ nodes: [{ type: 'manual_trigger' }] }, 'scheduled')).toBe(false); expect(flowMatchesFilter({ nodes: [] }, 'all')).toBe(true) }) })
