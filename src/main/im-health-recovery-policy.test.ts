import { describe, expect, it } from 'vitest'
import { shouldAutoRecoverFeishuHealth } from './im-health-recovery-policy'

describe('Feishu health recovery policy', () => {
  it('does not retry protected credentials automatically', () => {
    expect(shouldAutoRecoverFeishuHealth({
      provider: 'feishu',
      reasonCode: 'credential_unavailable',
      status: 'retrying'
    })).toBe(false)
  })

  it('still recovers network failures and stale bridges', () => {
    expect(shouldAutoRecoverFeishuHealth({
      provider: 'feishu',
      reasonCode: 'network',
      status: 'retrying'
    })).toBe(true)
    expect(shouldAutoRecoverFeishuHealth({
      provider: 'feishu',
      reasonCode: 'bridge_unavailable',
      status: 'stale'
    })).toBe(true)
  })

  it('never applies to WeChat health', () => {
    expect(shouldAutoRecoverFeishuHealth({
      provider: 'weixin',
      reasonCode: 'network',
      status: 'retrying'
    })).toBe(false)
  })
})
