import { describe, expect, it } from 'vitest'
import { clawDefaultAgentName } from './SidebarClawDialogHelpers'

describe('SidebarClawDialogHelpers', () => {
  it('uses product default agent names for phone providers', () => {
    expect(clawDefaultAgentName('feishu')).toBe('WorkWise')
    expect(clawDefaultAgentName('lark')).toBe('WorkWise')
    expect(clawDefaultAgentName('weixin')).toBe('WorkWise')
  })
})
