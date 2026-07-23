import { describe, expect, it } from 'vitest'
import { WORKWISE_RUNTIME_PROTOCOL_VERSION } from '../../contracts/runtime-protocol.js'
import { healthJsonResponse } from './health.js'

describe('healthJsonResponse', () => {
  it('advertises the desktop compatibility protocol', () => {
    const response = healthJsonResponse()

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'ok',
      service: 'kun',
      mode: 'serve',
      protocolVersion: WORKWISE_RUNTIME_PROTOCOL_VERSION
    })
  })
})
