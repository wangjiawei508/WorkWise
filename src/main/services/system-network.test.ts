import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeNetworkFailure, systemFetch } from './system-network'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('system-network', () => {
  it('falls back to the host fetch implementation outside Electron', async () => {
    const response = new Response('ok', { status: 200 })
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(systemFetch('https://example.com')).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledWith('https://example.com', undefined)
  })

  it('turns opaque fetch failures into actionable system-proxy diagnostics', () => {
    const error = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED', message: 'proxy unavailable' }
    })
    expect(describeNetworkFailure(error, 'GitHub download')).toContain(
      'GitHub download connection failed through the system network settings (ECONNREFUSED: proxy unavailable)'
    )
  })
})
