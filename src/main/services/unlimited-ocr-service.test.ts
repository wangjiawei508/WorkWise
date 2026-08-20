import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { atomicWriteFile, drainSerializedWrites } from './durable-file'
import { UnlimitedOcrService, normalizeUnlimitedOcrServerUrl } from './unlimited-ocr-service'

describe('UnlimitedOcrService', () => {
  it('only accepts explicit loopback server origins', () => {
    expect(normalizeUnlimitedOcrServerUrl(' http://127.0.0.1:3000/path ')).toBe('http://127.0.0.1:3000')
    expect(normalizeUnlimitedOcrServerUrl('http://[::1]:3000')).toBe('http://[::1]:3000')
    expect(() => normalizeUnlimitedOcrServerUrl('https://ocr.example.com')).toThrow(/loopback/)
    expect(() => normalizeUnlimitedOcrServerUrl('http://localhost:3000')).toThrow(/loopback/)
    expect(() => normalizeUnlimitedOcrServerUrl('http://127.0.0.1:3000?token=secret')).toThrow(/query/)
  })

  it('reports a reachable local OCR server as healthy', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
    const service = new UnlimitedOcrService({ fetch: fetcher })

    await expect(service.checkHealth('http://127.0.0.1:3000')).resolves.toEqual({ available: true })
    expect(fetcher).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:3000/health'),
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    )
  })

  it('reports an unreachable local OCR server without throwing', async () => {
    const fetcher = vi.fn(async () => { throw new Error('connection refused') }) as unknown as typeof fetch
    const service = new UnlimitedOcrService({ fetch: fetcher })

    await expect(service.checkHealth('http://127.0.0.1:3000')).resolves.toMatchObject({
      available: false,
      message: expect.stringMatching(/connection refused/)
    })
  })

  it('redacts local paths and URLs from health diagnostics', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('request failed at /private/tmp/workwise-secret/token.json via http://127.0.0.1:3000/health?token=secret')
    }) as unknown as typeof fetch
    const service = new UnlimitedOcrService({ fetch: fetcher })

    const result = await service.checkHealth('http://127.0.0.1:3000')

    expect(result).toEqual({
      available: false,
      message: 'request failed at [path] via [url]'
    })
  })

  it('uploads a PDF, polls page jobs, and writes ordered page markdown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const responses = [
      { jobs: [{ id: 'page-2', status_url: '/v1/jobs/page-2' }, { id: 'page-1', status_url: '/v1/jobs/page-1' }] },
      { status: 'succeeded', document_page: 2, result: { result: { text: 'second page' } } },
      { status: 'succeeded', document_page: 1, result: { generated_text: 'first page' } }
    ]
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch
    const service = new UnlimitedOcrService({ fetch: fetcher, pollIntervalMs: 0 })

    const result = await service.parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })

    expect(await readFile(result.markdownPath, 'utf8')).toBe(
      '<!-- page:1 -->\n\nfirst page\n\n<!-- page:2 -->\n\nsecond page\n'
    )
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['a string', '1'],
    ['zero', 0],
    ['a negative number', -1],
    ['a fractional number', 1.5],
    ['an out-of-range number', 2]
  ])('rejects %s as an OCR document page', async (_label, documentPage) => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-page-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const responses = [
      { jobs: [{ id: 'page-1', status_url: '/v1/jobs/page-1' }] },
      { status: 'succeeded', document_page: documentPage, result: { generated_text: 'page' } }
    ]
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch

    await expect(new UnlimitedOcrService({ fetch: fetcher, pollIntervalMs: 0 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow(/invalid document page/u)
  })

  it('rejects duplicate OCR document pages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-duplicate-page-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const responses = [
      {
        jobs: [
          { id: 'page-1', status_url: '/v1/jobs/page-1' },
          { id: 'page-2', status_url: '/v1/jobs/page-2' }
        ]
      },
      { status: 'succeeded', document_page: 1, result: { generated_text: 'first' } },
      { status: 'succeeded', document_page: 1, result: { generated_text: 'duplicate' } }
    ]
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch

    await expect(new UnlimitedOcrService({ fetch: fetcher, pollIntervalMs: 0 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow(/duplicate document page/u)
  })

  it('rejects cross-origin job URLs before polling', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-origin-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      jobs: [{ id: 'page-1', status_url: 'https://attacker.example/job' }]
    }), { status: 200 })) as unknown as typeof fetch
    const service = new UnlimitedOcrService({ fetch: fetcher })

    await expect(service.parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow(/left the configured server origin/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('cancels an oversized response stream as soon as the byte limit is crossed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-size-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    let cancelled = false
    const oneMiB = new Uint8Array(1024 * 1024).fill(0x61)
    let emitted = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted += 1
        controller.enqueue(oneMiB)
        if (emitted === 20) controller.close()
      },
      cancel() {
        cancelled = true
      }
    })
    const fetcher = vi.fn(async () => new Response(stream, { status: 200 })) as unknown as typeof fetch

    await expect(new UnlimitedOcrService({ fetch: fetcher }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow(/size limit/)
    expect(cancelled).toBe(true)
  })

  it('honors cancellation and the overall polling deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-cancel-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const queued = { jobs: [{ id: 'page-1', status_url: '/v1/jobs/page-1' }] }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(
      fetchMock.mock.calls.length === 1 ? queued : { status: 'queued' }
    ), { status: 200 }))
    const fetcher = fetchMock as unknown as typeof fetch
    const controller = new AbortController()
    const pending = new UnlimitedOcrService({ fetch: fetcher, pollIntervalMs: 60_000 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: controller.signal
    })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not replace the OCR output after cancellation while the atomic write is queued', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-late-write-'))
    const inputPath = join(root, 'input.pdf')
    const outputPath = join(root, 'unlimited-ocr.md')
    await writeFile(inputPath, '%PDF-test')

    let releaseBlocker: (() => void) | undefined
    let notifyBlocked: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      notifyBlocked = resolve
    })
    const blocker = atomicWriteFile(outputPath, 'existing output', {
      beforeReplace: () => new Promise<void>((resolve) => {
        releaseBlocker = resolve
        notifyBlocked?.()
      })
    })
    await blocked

    const responses = [
      { jobs: [{ id: 'page-1', status_url: '/v1/jobs/page-1' }] },
      { status: 'succeeded', document_page: 1, result: { generated_text: 'late OCR output' } }
    ]
    const fetcher = vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch
    const controller = new AbortController()
    const pending = new UnlimitedOcrService({ fetch: fetcher, pollIntervalMs: 0 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: controller.signal
    })

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    releaseBlocker?.()
    await blocker
    await drainSerializedWrites()

    expect(await readFile(outputPath, 'utf8')).toBe('existing output')
  })

  it('rejects a non-positive deadline before making a network request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-expired-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch

    await expect(new UnlimitedOcrService({ fetch: fetcher, timeoutMs: 0 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow('Unlimited-OCR parsing timed out.')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('applies the total deadline to a submission fetch that never resolves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-hanging-fetch-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch
    const startedAt = Date.now()
    let safetyTimer: ReturnType<typeof setTimeout> | undefined
    const safety = new Promise<never>((_, reject) => {
      safetyTimer = setTimeout(() => reject(new Error('test safety timeout')), 500)
    })

    try {
      await expect(Promise.race([
        new UnlimitedOcrService({ fetch: fetcher, timeoutMs: 30 }).parse({
          serverUrl: 'http://127.0.0.1:3000',
          inputPath,
          outputDirectory: root,
          signal: new AbortController().signal
        }),
        safety
      ])).rejects.toThrow('Unlimited-OCR parsing timed out.')
      expect(Date.now() - startedAt).toBeLessThan(300)
    } finally {
      clearTimeout(safetyTimer)
    }
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('applies the total deadline while reading a response body', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-hanging-body-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"jobs":['))
      }
    })
    const fetcher = vi.fn(async () => new Response(stream, { status: 200 })) as unknown as typeof fetch

    await expect(new UnlimitedOcrService({ fetch: fetcher, timeoutMs: 30 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow('Unlimited-OCR parsing timed out.')
  })

  it('does not let a polling delay extend the total deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-unlimited-ocr-poll-deadline-'))
    const inputPath = join(root, 'input.pdf')
    await writeFile(inputPath, '%PDF-test')
    const submission = { jobs: [{ id: 'page-1', status_url: '/v1/jobs/page-1' }] }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(
      fetchMock.mock.calls.length === 1 ? submission : { status: 'queued' }
    ), { status: 200 }))
    const fetcher = fetchMock as unknown as typeof fetch

    await expect(new UnlimitedOcrService({ fetch: fetcher, pollIntervalMs: 60_000, timeoutMs: 30 }).parse({
      serverUrl: 'http://127.0.0.1:3000',
      inputPath,
      outputDirectory: root,
      signal: new AbortController().signal
    })).rejects.toThrow('Unlimited-OCR parsing timed out.')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
