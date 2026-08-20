import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { UnlimitedOcrService } from './unlimited-ocr-service'

function sendJson(response: ServerResponse, payload: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

it('runs the complete OCR protocol over a real loopback HTTP connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workwise-ocr-loopback-'))
  const inputPath = join(root, 'scan.pdf')
  const outputDirectory = join(root, 'output')
  await writeFile(inputPath, '%PDF-loopback-fixture')
  await mkdir(outputDirectory)

  const requests: string[] = []
  const pollCounts = new Map<string, number>()
  let submissionContentType = ''
  let submissionBody: Buffer = Buffer.alloc(0)
  const server = createServer(async (request, response) => {
    const route = `${request.method ?? ''} ${request.url ?? ''}`
    requests.push(route)

    if (route === 'GET /health') {
      sendJson(response, {
        service: 'Unlimited-OCR',
        version: 'loopback-1',
        model: 'fixture-model'
      })
      return
    }
    if (route === 'POST /v1/infer') {
      submissionContentType = String(request.headers['content-type'] ?? '')
      submissionBody = await readRequestBody(request)
      sendJson(response, {
        jobs: [
          { id: 'page-2', status_url: '/v1/jobs/page-2' },
          { id: 'page-1', status_url: '/v1/jobs/page-1' }
        ]
      })
      return
    }
    if (route === 'GET /v1/jobs/page-2' || route === 'GET /v1/jobs/page-1') {
      const count = (pollCounts.get(route) ?? 0) + 1
      pollCounts.set(route, count)
      if (count === 1) {
        sendJson(response, { status: 'queued' })
        return
      }
      const page = route.endsWith('page-2') ? 2 : 1
      sendJson(response, {
        status: 'succeeded',
        document_page: page,
        result: { generated_text: page === 1 ? '# First page' : 'Second page' }
      })
      return
    }

    response.writeHead(404)
    response.end()
  })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const port = (server.address() as AddressInfo).port
    const serverUrl = `http://127.0.0.1:${port}`
    const service = new UnlimitedOcrService({ pollIntervalMs: 0 })

    const health = await service.checkHealth(serverUrl)
    expect(health).toEqual({
      available: true,
      identity: 'service=Unlimited-OCR;version=loopback-1;model=fixture-model'
    })

    const result = await service.parse({
      serverUrl,
      inputPath,
      outputDirectory,
      signal: new AbortController().signal,
      engineVersion: health.identity
    })

    expect(result.engineVersion).toBe('service=Unlimited-OCR;version=loopback-1;model=fixture-model')
    expect(await readFile(result.markdownPath, 'utf8')).toBe(
      '<!-- page:1 -->\n\n# First page\n\n<!-- page:2 -->\n\nSecond page\n'
    )
    expect(submissionContentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(submissionBody.includes(Buffer.from('%PDF-loopback-fixture'))).toBe(true)
    const multipartText = submissionBody.toString('utf8')
    expect(multipartText).toContain('name="image"; filename="scan.pdf"')
    expect(multipartText).toContain('name="text_input"')
    expect(multipartText).toContain('<|grounding|><image>Convert the document to markdown.')
    expect(requests).toEqual([
      'GET /health',
      'POST /v1/infer',
      'GET /v1/jobs/page-2',
      'GET /v1/jobs/page-2',
      'GET /v1/jobs/page-1',
      'GET /v1/jobs/page-1'
    ])
  } finally {
    server.closeAllConnections()
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
