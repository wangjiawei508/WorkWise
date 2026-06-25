import { describe, expect, it } from 'vitest'
import { WebToolFailureGuard } from '../src/loop/web-tool-failure-guard.js'

function call(toolName: string, callId = toolName) {
  return {
    callId,
    toolName,
    arguments: {}
  }
}

describe('WebToolFailureGuard', () => {
  it('blocks web tools after consecutive failures in a turn', () => {
    const guard = new WebToolFailureGuard({ threshold: 2 })

    expect(guard.inspect(call('web_fetch')).suppress).toBe(false)
    guard.observe(call('web_fetch'), true)
    expect(guard.inspect(call('web_search')).suppress).toBe(false)
    guard.observe(call('web_search'), true)

    const blocked = guard.inspect(call('web_fetch', 'third'))
    expect(blocked.suppress).toBe(true)
    expect(blocked.reason).toContain('consecutive failures')
  })

  it('does not block non-web tools and resets after a successful web call', () => {
    const guard = new WebToolFailureGuard({ threshold: 2 })

    guard.observe(call('web_fetch'), true)
    guard.observe(call('read'), true)
    expect(guard.inspect(call('grep')).suppress).toBe(false)
    expect(guard.inspect(call('web_search')).suppress).toBe(false)

    guard.observe(call('web_search'), false)
    expect(guard.inspect(call('web_fetch')).suppress).toBe(false)
  })
})
