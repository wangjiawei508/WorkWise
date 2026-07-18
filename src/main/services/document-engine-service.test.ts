import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assessDocumentQuality,
  DocumentEngineError,
  DocumentEngineService,
  type DocumentEngineRunner,
  type DocumentSidecarResponse
} from './document-engine-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(extension = '.pdf'): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-document-engine-'))
  roots.push(root)
  const path = join(root, `source${extension}`)
  await writeFile(path, extension === '.pdf' ? '%PDF-1.7\n%%EOF' : 'office fixture')
  return { root, path }
}

function runner(markdown = '# Parsed\n\n| A | B |\n|---|---|\n| 1 | 2 |') {
  return vi.fn<DocumentEngineRunner>(async (input) => {
    await mkdir(input.outputDirectory, { recursive: true })
    const markdownPath = join(input.outputDirectory, 'document.md')
    await writeFile(markdownPath, markdown)
    const payload = {
      ok: true,
      engine: input.engine,
      engineVersion: 'fixture-1',
      sourceSha256: 'source-hash',
      markdownPath: relative(input.workspaceRoot, markdownPath),
      headings: [{ level: 1, text: 'Parsed' }],
      tables: [],
      media: [],
      references: [],
      warnings: [],
      durationMs: 5
    } satisfies DocumentSidecarResponse
    await writeFile(join(input.outputDirectory, 'result.json'), JSON.stringify(payload))
    return payload
  })
}

describe('DocumentEngineService', () => {
  it('detects low-density and garbled PDFs for explainable auto routing', () => {
    expect(assessDocumentQuality({ extension: '.pdf', markdown: 'tiny', sourceBytes: 8 * 1024 * 1024 })).toEqual({
      needsAccurateEngine: true,
      reasons: ['low_text_density']
    })
    expect(assessDocumentQuality({ extension: '.docx', markdown: 'tiny', sourceBytes: 8 * 1024 * 1024 }).needsAccurateEngine).toBe(false)
    expect(assessDocumentQuality({ extension: '.pdf', markdown: `${'正文'.repeat(200)}${'�'.repeat(12)}`, sourceBytes: 1024 }).reasons).toContain('garbled_text')
  })

  it('parses locally and reuses the SHA/version cache', async () => {
    const { root } = await fixture()
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast' as const,
      idempotencyKey: 'parse-one'
    }
    const first = await service.parse(request)
    const second = await service.parse({ ...request, parseId: 'parse-two' })
    expect(first.markdown).toContain('# Parsed')
    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect(bridge).toHaveBeenCalledTimes(1)
  })

  it('rejects workspace escape and unsupported formats', async () => {
    const { root } = await fixture('.txt')
    const outside = await mkdtemp(join(tmpdir(), 'workwise-document-outside-'))
    roots.push(outside)
    await writeFile(join(outside, 'outside.pdf'), '%PDF-1.7\n%%EOF')
    const service = new DocumentEngineService({ runner: runner() })
    await expect(service.parse({
      workspaceRoot: root,
      relativePath: join(outside, 'outside.pdf'),
      mode: 'fast',
      idempotencyKey: 'escape'
    })).rejects.toMatchObject({ code: 'unsafe_path' })
    await expect(service.parse({
      workspaceRoot: root,
      relativePath: 'source.txt',
      mode: 'fast',
      idempotencyKey: 'format'
    })).rejects.toBeInstanceOf(DocumentEngineError)
  })

  it('never uses a private MinerU endpoint without explicit upload permission', async () => {
    const { root } = await fixture()
    const service = new DocumentEngineService({ runner: runner() })
    await expect(service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      preferredEngine: 'mineru-private',
      idempotencyKey: 'private-denied'
    })).rejects.toMatchObject({ code: 'document_upload_not_allowed' })
  })

  it('cancels an active local parse', async () => {
    const { root } = await fixture()
    let started!: () => void
    const didStart = new Promise<void>((resolve) => { started = resolve })
    const service = new DocumentEngineService({
      runner: async (input) => new Promise((resolve, reject) => {
        started()
        if (input.signal.aborted) {
          reject(new Error('aborted'))
          return
        }
        input.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        void resolve
      })
    })
    const pending = service.parse({
      parseId: 'cancel-me',
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast',
      idempotencyKey: 'cancel-me'
    })
    await didStart
    expect(service.cancel('cancel-me')).toBe(true)
    await expect(pending).rejects.toMatchObject({ code: 'document_parse_cancelled' })
  })

  it('keeps the lightweight result when auto MinerU fails', async () => {
    const { root } = await fixture()
    const bridge = vi.fn<DocumentEngineRunner>(async (input) => {
      if (input.engine === 'mineru-local') throw new Error('/Users/test/private/model failed')
      return runner('fallback')(input)
    })
    const service = new DocumentEngineService({ runner: bridge })
    const result = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'auto',
      preferredEngine: 'mineru-local',
      idempotencyKey: 'fallback'
    })
    expect(result.engine).toBe('markitdown')
    expect(result.degradedFrom).toBe('mineru-local')
    expect(result.quality).toMatchObject({ status: 'degraded', reasons: ['engine_fallback'] })
    expect(result.warnings.join(' ')).toContain('[path]')
    const cached = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'auto',
      preferredEngine: 'mineru-local',
      parseId: 'fallback-cached',
      idempotencyKey: 'fallback'
    })
    expect(cached).toMatchObject({ cacheHit: true, degradedFrom: 'mineru-local' })
    expect(cached.warnings.join(' ')).toContain('[path]')
  })

  it('uses PDF.js text-layer evidence to map MarkItDown headings back to pages', async () => {
    const { root, path } = await fixture()
    await writeFile(path, minimalPdf('Parsed heading content'))
    const service = new DocumentEngineService({ runner: runner('# Parsed heading content\n\nBody') })
    const result = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast',
      idempotencyKey: 'page-map'
    })
    expect(result.headings[0]).toMatchObject({ text: 'Parsed', page: 1 })
    expect(result.references).toContainEqual({ page: 1, blockId: 'heading-1', kind: 'text' })
    expect(result.route).toEqual({ requestedMode: 'fast', selectedEngine: 'markitdown' })
  })

  it('routes low-quality auto parsing to local MinerU but keeps fast mode on MarkItDown', async () => {
    const { root } = await fixture()
    const bridge = runner('tiny')
    const service = new DocumentEngineService({ runner: bridge })
    const automatic = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'auto',
      idempotencyKey: 'auto-route'
    })
    expect(automatic).toMatchObject({ engine: 'mineru-local', quality: { status: 'enhanced' } })
    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual(['markitdown', 'mineru-local'])

    const fastBridge = runner('tiny')
    const fast = new DocumentEngineService({ runner: fastBridge })
    await fast.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast',
      idempotencyKey: 'fast-route'
    })
    expect(fastBridge.mock.calls.map(([input]) => input.engine)).toEqual(['markitdown'])
  })
})

function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}
