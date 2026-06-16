import { describe, expect, it } from 'vitest'
import { clawDefaultAgentName } from './SidebarClawDialogHelpers'

describe('SidebarClawDialogHelpers', () => {
  it('uses product default agent names for phone providers', () => {
    expect(clawDefaultAgentName('feishu')).toBe('WORKGPT')
    expect(clawDefaultAgentName('lark')).toBe('WORKGPT')
    expect(clawDefaultAgentName('weixin')).toBe('WORKGPT')
  })
})
