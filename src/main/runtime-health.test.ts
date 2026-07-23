import { describe, expect, it } from 'vitest'
import { isRuntimeHealthResponseBody } from './runtime-health'

describe('isRuntimeHealthResponseBody', () => {
  it('accepts WorkWise Runtime serve health responses', () => {
    expect(isRuntimeHealthResponseBody(JSON.stringify({
      status: 'ok',
      service: 'kun',
      mode: 'serve',
      protocolVersion: 1
    }))).toBe(true)
  })

  it('rejects generic or legacy runtime health responses', () => {
    expect(isRuntimeHealthResponseBody(JSON.stringify({ status: 'ok' }))).toBe(false)
    expect(isRuntimeHealthResponseBody(JSON.stringify({
      status: 'ok',
      service: 'codewhale',
      mode: 'serve',
      protocolVersion: 1
    }))).toBe(false)
    expect(isRuntimeHealthResponseBody(JSON.stringify({
      status: 'ok',
      service: 'kun',
      mode: 'serve'
    }))).toBe(false)
  })
})
