import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeNetworkError, OpenAiCompatImageClient } from './image-gen-tool-provider.js'

describe('describeNetworkError', () => {
  it('unwraps the cause behind undici fetch failed errors', () => {
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND images.example.test'), {
      code: 'ENOTFOUND'
    })
    const wrapped = new TypeError('fetch failed', { cause: dns })
    expect(describeNetworkError(wrapped)).toBe(
      'fetch failed: getaddrinfo ENOTFOUND images.example.test'
    )
  })

  it('digs into AggregateError connection failures', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), {
      code: 'ECONNREFUSED'
    })
    const wrapped = new TypeError('fetch failed', { cause: new AggregateError([refused], '') })
    expect(describeNetworkError(wrapped)).toBe('fetch failed: connect ECONNREFUSED 127.0.0.1:8080')
  })

  it('appends error codes missing from the message', () => {
    const tls = Object.assign(new Error('self-signed certificate'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT'
    })
    expect(describeNetworkError(new TypeError('fetch failed', { cause: tls }))).toBe(
      'fetch failed: self-signed certificate (DEPTH_ZERO_SELF_SIGNED_CERT)'
    )
  })

  it('handles non-error values and empty chains', () => {
    expect(describeNetworkError('boom')).toBe('boom')
    expect(describeNetworkError(new Error(''))).toBe('unknown network error')
  })
})

describe('OpenAiCompatImageClient network failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces the failing endpoint and root cause instead of bare fetch failed', async () => {
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND images.example.test'), {
      code: 'ENOTFOUND'
    })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: dns })
    }))

    const client = new OpenAiCompatImageClient('https://images.example.test/v1', 'sk-test')
    await expect(
      client.generate({
        prompt: 'a cat',
        model: 'test-model',
        timeoutMs: 5_000,
        signal: new AbortController().signal
      })
    ).rejects.toThrow(
      'image request to https://images.example.test/v1/images/generations failed: ' +
        'fetch failed: getaddrinfo ENOTFOUND images.example.test'
    )
  })

  it('reports timeouts with the configured duration', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }))

    const client = new OpenAiCompatImageClient('https://images.example.test/v1', 'sk-test')
    await expect(
      client.generate({
        prompt: 'a cat',
        model: 'test-model',
        timeoutMs: 5_000,
        signal: new AbortController().signal
      })
    ).rejects.toThrow('image request to https://images.example.test/v1/images/generations timed out after 5000ms')
  })
})
