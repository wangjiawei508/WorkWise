import { describe, expect, it, vi } from 'vitest'
import { sanitizeAttachmentEvidence } from '../src/contracts/vision-evidence.js'
import { HttpVisionEvidenceService, normalizeVisionEvidenceEndpoint } from '../src/vision/vision-evidence-service.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

describe('HttpVisionEvidenceService', () => {
  it('accepts only explicit loopback endpoints', () => {
    expect(normalizeVisionEvidenceEndpoint('http://127.0.0.1:4000/analyze')).toBe('http://127.0.0.1:4000/analyze')
    expect(normalizeVisionEvidenceEndpoint('http://[::1]:4000/analyze')).toBe('http://[::1]:4000/analyze')
    expect(() => normalizeVisionEvidenceEndpoint('https://vision.example.com')).toThrow(/loopback/)
    expect(() => normalizeVisionEvidenceEndpoint('http://localhost:4000')).toThrow(/loopback/)
  })

  it('sanitizes every analyzer-controlled evidence string including short and line-wrapped secrets', () => {
    const shortBase64 = Buffer.from('small-secret').toString('base64')
    const wrappedBase64 = Buffer.from('line-wrapped-secret-material').toString('base64')
      .match(/.{1,8}/g)?.join('\n') ?? ''
    const signedUrl = 'https://files.example.test/evidence.png?X-Amz-Signature=\nsigned-url-secret'
    const evidence = sanitizeAttachmentEvidence({
      version: 1,
      attachmentId: `att-${shortBase64}`,
      summary: signedUrl,
      ocr: `data:image/png;base64,\n${wrappedBase64}`,
      layout: [{ type: `heading-${shortBase64}`, text: `text ${signedUrl}` }],
      semantics: [`semantic ${wrappedBase64}`],
      visual: `visual ${shortBase64}`,
      uncertainty: [`uncertain ${signedUrl}`],
      source: {
        kind: 'configured-endpoint',
        analyzer: `analyzer-${shortBase64}`,
        configFingerprint: 'a'.repeat(64)
      },
      status: 'ready'
    })

    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain(shortBase64)
    expect(serialized.replace(/\\n/g, '')).not.toContain(wrappedBase64.replace(/\n/g, ''))
    expect(serialized).not.toContain('signed-url-secret')
    expect(evidence.layout[0]?.type).toContain('[encoded-data]')
    expect(evidence.attachmentId).toContain('[encoded-data]')
    expect(serialized).toContain('[data-url]')
    expect(serialized).toContain('[url]')
  })

  it('preserves ordinary OCR identifiers around redacted URLs', () => {
    const evidence = sanitizeAttachmentEvidence({
      version: 1,
      attachmentId: 'att-WorkWise2026',
      summary: 'https://example.test/page?X-Amz-Signature=\nYWJjMTIz\neHl6NDU2\nBridgePierA123\nSettlement2026',
      ocr: 'WorkWise2026 BridgePierA123 Settlement2026',
      layout: [{ type: 'BridgePierA123', text: 'Settlement2026' }],
      semantics: ['WorkWise2026'],
      visual: 'BridgePierA123',
      uncertainty: ['Settlement2026'],
      source: {
        kind: 'configured-endpoint',
        analyzer: 'WorkWise2026',
        configFingerprint: 'a'.repeat(64)
      },
      status: 'ready'
    })

    expect(evidence.summary).toBe('[url]\nBridgePierA123\nSettlement2026')
    expect(evidence.summary).not.toContain('YWJjMTIz')
    expect(evidence.summary).not.toContain('eHl6NDU2')
    expect(JSON.stringify(evidence)).toContain('WorkWise2026')
    expect(JSON.stringify(evidence)).toContain('BridgePierA123')
    expect(JSON.stringify(evidence)).toContain('Settlement2026')
  })

  it('validates magic bytes and shares in-flight analysis by content hash', async () => {
    let resolveResponse!: (response: Response) => void
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve })
    const fetcher = vi.fn(() => response) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({
      enabled: true,
      endpoint: 'http://127.0.0.1:4000/analyze'
    }, { fetch: fetcher })
    const first = service.analyze({ attachmentId: 'a1', name: 'one.png', mimeType: 'image/png', data: PNG, signal: new AbortController().signal })
    const second = service.analyze({ attachmentId: 'a2', name: 'two.png', mimeType: 'image/png', data: PNG, signal: new AbortController().signal })
    resolveResponse(new Response(JSON.stringify({
      summary: 'diagram',
      ocr: 'hello',
      layout: [],
      semantics: ['flow chart'],
      visual: 'boxes connected by arrows',
      uncertainty: []
    }), { status: 200 }))

    await expect(first).resolves.toMatchObject({ attachmentId: 'a1', summary: 'diagram', status: 'ready' })
    await expect(second).resolves.toMatchObject({ attachmentId: 'a2', summary: 'diagram', status: 'ready' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    await expect(service.analyze({ attachmentId: 'a3', name: 'bad.png', mimeType: 'image/jpeg', data: PNG, signal: new AbortController().signal }))
      .rejects.toThrow(/MIME type/)
  })

  it('cancels one waiter without cancelling another waiter for the same analysis', async () => {
    let resolveResponse!: (response: Response) => void
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve })
    const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit): Promise<Response> => response)
    const service = new HttpVisionEvidenceService({ enabled: true, endpoint: 'http://127.0.0.1:4000/analyze' }, { fetch: fetchMock as unknown as typeof fetch })
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = service.analyze({ attachmentId: 'a1', name: 'one.png', mimeType: 'image/png', data: PNG, signal: firstController.signal })
    const second = service.analyze({ attachmentId: 'a2', name: 'two.png', mimeType: 'image/png', data: PNG, signal: secondController.signal })

    firstController.abort('caller cancelled')
    await expect(first).rejects.toThrow(/cancelled/)
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeDefined()
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal).aborted).toBe(false)

    resolveResponse(new Response(JSON.stringify({
      summary: 'diagram',
      ocr: 'hello',
      layout: [],
      semantics: ['flow chart'],
      visual: 'boxes connected by arrows',
      uncertainty: []
    }), { status: 200 }))
    await expect(second).resolves.toMatchObject({ attachmentId: 'a2', status: 'ready' })
  })

  it('does not start an analyzer request for an already-aborted waiter', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({ enabled: true, endpoint: 'http://127.0.0.1:4000/analyze' }, { fetch: fetcher })
    const controller = new AbortController()
    controller.abort('already cancelled')

    await expect(service.analyze({ attachmentId: 'a1', name: 'one.png', mimeType: 'image/png', data: PNG, signal: controller.signal }))
      .rejects.toThrow(/cancelled/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('cancels a streaming analyzer response as soon as it exceeds 2 MiB', async () => {
    let cancelled = false
    let chunkCount = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunkCount === 0) controller.enqueue(new Uint8Array(2 * 1024 * 1024))
        else if (chunkCount === 1) controller.enqueue(new Uint8Array(1))
        else return
        chunkCount += 1
      },
      cancel() {
        cancelled = true
      }
    })
    const fetcher = vi.fn(async () => new Response(stream, { status: 200 })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({ enabled: true, endpoint: 'http://127.0.0.1:4000/analyze' }, { fetch: fetcher })

    await expect(service.analyze({ attachmentId: 'a1', name: 'one.png', mimeType: 'image/png', data: PNG, signal: new AbortController().signal }))
      .rejects.toThrow(/size limit/)
    expect(cancelled).toBe(true)
  })

  it('does not cache analyzer failures', async () => {
    const fetcher = vi.fn(async () => new Response('failed', { status: 500 })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({ enabled: true, endpoint: 'http://127.0.0.1:4000/analyze' }, { fetch: fetcher })
    const input = { attachmentId: 'a1', name: 'one.png', mimeType: 'image/png', data: PNG, signal: new AbortController().signal }
    await expect(service.analyze(input)).rejects.toThrow('attachment_analysis_unavailable')
    await expect(service.analyze(input)).rejects.toThrow('attachment_analysis_unavailable')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('aborts a stalled analyzer at the configured timeout', async () => {
    let aborted = false
    const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
        reject(new Error('aborted'))
      }, { once: true })
    })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({
      enabled: true,
      endpoint: 'http://127.0.0.1:4000/analyze',
      timeoutMs: 10
    }, { fetch: fetcher })

    await expect(service.analyze({
      attachmentId: 'timeout', name: 'one.png', mimeType: 'image/png', data: PNG,
      signal: new AbortController().signal
    })).rejects.toThrow(/timed out|cancelled/)
    expect(aborted).toBe(true)
  })

  it('times out when the response body ignores the fetch abort signal', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined)
      },
      cancel() {
        cancelled = true
      }
    })
    const fetcher = vi.fn(async () => new Response(stream, { status: 200 })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({
      enabled: true,
      endpoint: 'http://127.0.0.1:4000/analyze',
      timeoutMs: 10
    }, { fetch: fetcher })

    await expect(service.analyze({
      attachmentId: 'body-timeout', name: 'one.png', mimeType: 'image/png', data: PNG,
      signal: new AbortController().signal
    })).rejects.toThrow(/timed out|cancelled/)
    expect(cancelled).toBe(true)
  })

  it('evicts the least recently used evidence and separates analyzer configurations', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      summary: 'diagram', ocr: 'hello', layout: [], semantics: [], visual: 'boxes', uncertainty: []
    }), { status: 200 })) as unknown as typeof fetch
    const input = (attachmentId: string, marker = attachmentId) => ({
      attachmentId, name: `${attachmentId}.png`, mimeType: 'image/png', data: Buffer.concat([PNG, Buffer.from(marker)]),
      signal: new AbortController().signal
    })
    const service = new HttpVisionEvidenceService({
      enabled: true, endpoint: 'http://127.0.0.1:4000/analyze', analyzer: 'v1'
    }, { fetch: fetcher, maxCacheEntries: 1 })
    await service.analyze(input('a1', 'one'))
    await service.analyze(input('a2', 'two'))
    await service.analyze(input('a1', 'one'))
    expect(fetcher).toHaveBeenCalledTimes(3)

    const otherConfig = new HttpVisionEvidenceService({
      enabled: true, endpoint: 'http://127.0.0.1:4000/analyze', analyzer: 'v2'
    }, { fetch: fetcher, maxCacheEntries: 1 })
    await otherConfig.analyze(input('a1', 'one'))
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it.each([128, Number.NaN])('enforces the absolute 64-entry cache cap for injected limit %s', async (maxCacheEntries) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      summary: 'diagram', ocr: 'hello', layout: [], semantics: [], visual: 'boxes', uncertainty: []
    }), { status: 200 })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({
      enabled: true,
      endpoint: 'http://127.0.0.1:4000/analyze'
    }, { fetch: fetcher, maxCacheEntries })
    const input = (index: number) => ({
      attachmentId: `a${index}`,
      name: `${index}.png`,
      mimeType: 'image/png',
      data: Buffer.concat([PNG, Buffer.from([index])]),
      signal: new AbortController().signal
    })

    for (let index = 0; index < 65; index += 1) await service.analyze(input(index))
    await service.analyze(input(0))

    expect(fetcher).toHaveBeenCalledTimes(66)
  })

  it('requires fetch to reject redirects and never follows analyzer responses', async () => {
    const fetcher = vi.fn(async () => new Response('redirected', {
      status: 302,
      headers: { location: 'http://127.0.0.1:4001/other' }
    })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({
      enabled: true,
      endpoint: 'http://127.0.0.1:4000/analyze'
    }, { fetch: fetcher })

    await expect(service.analyze({
      attachmentId: 'redirect', name: 'one.png', mimeType: 'image/png', data: PNG,
      signal: new AbortController().signal
    })).rejects.toThrow('attachment_analysis_unavailable')
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/analyze',
      expect.objectContaining({ redirect: 'error' })
    )
  })

  it('rejects oversized image inputs before calling the analyzer', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const service = new HttpVisionEvidenceService({ enabled: true, endpoint: 'http://127.0.0.1:4000/analyze' }, { fetch: fetcher })
    await expect(service.analyze({
      attachmentId: 'large', name: 'large.png', mimeType: 'image/png',
      data: Buffer.concat([PNG, Buffer.alloc(20 * 1024 * 1024 + 1)]),
      signal: new AbortController().signal
    })).rejects.toThrow(/size limit/)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
