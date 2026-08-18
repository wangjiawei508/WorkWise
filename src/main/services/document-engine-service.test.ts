import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import {
  assessDocumentQuality,
  DocumentEngineError,
  DocumentEngineService,
  sanitizeDocumentDiagnostic,
  type DocumentEngineRunner,
  type DocumentSidecarResponse
} from './document-engine-service'
import { UnlimitedOcrService } from './unlimited-ocr-service'

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
      sourceSha256: createHash('sha256').update(await readFile(input.inputPath)).digest('hex'),
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

  it('distinguishes weak text layers, scans, formulas, tables, and complex layouts', () => {
    expect(assessDocumentQuality({
      extension: '.pdf',
      markdown: '可读正文'.repeat(200),
      sourceBytes: 1024,
      pageCount: 10,
      pageTextCharacters: 120
    }).reasons).toContain('weak_text_layer')
    expect(assessDocumentQuality({
      extension: '.pdf',
      markdown: '',
      sourceBytes: 1024,
      pageCount: 10,
      pageTextCharacters: 0,
      warnings: ['OCR recommended for scanned pages.']
    }).reasons).toContain('scanned_document')
    expect(assessDocumentQuality({
      extension: '.pdf',
      markdown: '可读正文'.repeat(200),
      sourceBytes: 1024,
      warnings: ['Formula-dense document detected.', 'Cross-page table detected.', 'Multi-column layout detected.']
    }).reasons).toEqual(expect.arrayContaining(['formula_dense', 'table_dense', 'complex_layout']))

    const markdownWithoutParserWarnings = [
      '可读正文'.repeat(200),
      '',
      '$$ \\frac{a}{b} = \\sum_{i=1}^{n} x_i $$',
      '$$ \\sqrt{x^2 + y^2} $$',
      '',
      '| 条款 | 金额 | 说明 |',
      '| --- | --- | --- |',
      '| A | 100 | 跨页 1 |',
      '| B | 200 | 跨页 2 |',
      '| C | 300 | 跨页 3 |',
      '',
      '左栏内容\t中栏内容\t右栏内容',
      '左栏续文\t中栏续文\t右栏续文'
    ].join('\n')
    expect(assessDocumentQuality({
      extension: '.pdf',
      markdown: markdownWithoutParserWarnings,
      sourceBytes: 1024
    }).reasons).toEqual(expect.arrayContaining(['formula_dense', 'table_dense', 'complex_layout']))
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
  }, 15_000)

  it('rejects oversized Markdown from the current cache', async () => {
    const { root } = await fixture()
    const outputDirectory = join(root, '.workwise', 'cache', 'oversized-current')
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      outputDirectory: relative(root, outputDirectory),
      mode: 'fast' as const,
      idempotencyKey: 'oversized-current-cache'
    }
    await service.parse(request)
    await rm(join(outputDirectory, 'result.json'))
    await writeFile(join(outputDirectory, 'document.md'), Buffer.alloc(16 * 1024 * 1024 + 1, 0x61))

    await expect(service.parse({ ...request, parseId: 'oversized-current-cache-hit' }))
      .rejects.toMatchObject({ code: 'resource_limit' })
    expect(bridge).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('rejects oversized Markdown from a legacy sidecar cache', async () => {
    const { root } = await fixture()
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast' as const,
      idempotencyKey: 'oversized-legacy-cache'
    }
    await service.parse(request)
    const [cacheName] = await readdir(join(root, '.workwise', 'cache', 'documents'))
    const outputDirectory = join(root, '.workwise', 'cache', 'documents', cacheName)
    await rm(join(outputDirectory, 'workwise-result.json'))
    await writeFile(join(outputDirectory, 'document.md'), Buffer.alloc(16 * 1024 * 1024 + 1, 0x61))

    await expect(service.parse({ ...request, parseId: 'oversized-legacy-cache-hit' }))
      .rejects.toMatchObject({ code: 'resource_limit' })
    expect(bridge).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('rejects oversized cache metadata before parsing JSON', async () => {
    const { root } = await fixture()
    const outputDirectory = join(root, '.workwise', 'cache', 'oversized-metadata')
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      outputDirectory: relative(root, outputDirectory),
      mode: 'fast' as const,
      idempotencyKey: 'oversized-cache-metadata'
    }
    await service.parse(request)
    await writeFile(join(outputDirectory, 'workwise-result.json'), Buffer.alloc(1024 * 1024 + 1, 0x61))

    await expect(service.parse({ ...request, parseId: 'oversized-cache-metadata-hit' }))
      .rejects.toMatchObject({ code: 'resource_limit' })
    expect(bridge).toHaveBeenCalledTimes(1)
  })

  it('ignores cache metadata whose arrays exceed the runtime schema bounds', async () => {
    const { root } = await fixture()
    const outputDirectory = join(root, '.workwise', 'cache', 'invalid-array-metadata')
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      outputDirectory: relative(root, outputDirectory),
      mode: 'fast' as const,
      idempotencyKey: 'invalid-array-cache-metadata'
    }
    await service.parse(request)
    const metadataPath = join(outputDirectory, 'workwise-result.json')
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
      result: { warnings: string[] }
    }
    metadata.result.warnings = Array.from({ length: 1_001 }, () => 'warning')
    await writeFile(metadataPath, JSON.stringify(metadata))

    await expect(service.parse({ ...request, parseId: 'invalid-array-cache-metadata-hit' }))
      .resolves.toMatchObject({ cacheHit: false })
    expect(bridge).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a custom output directory after the source changes', async () => {
    const { root, path } = await fixture()
    const outputDirectory = join(root, '.workwise', 'cache', 'shared-output')
    const bridge = runner('first source')
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      outputDirectory: relative(root, outputDirectory),
      mode: 'fast' as const,
      idempotencyKey: 'custom-output-source-change'
    }

    const first = await service.parse(request)
    await writeFile(path, '%PDF-1.7\nchanged source\n%%EOF')
    bridge.mockImplementationOnce(runner('second source'))

    const second = await service.parse({ ...request, parseId: 'custom-output-source-change-2' })

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(false)
    expect(second.markdown).toContain('second source')
    expect(bridge).toHaveBeenCalledTimes(2)
  }, 15_000)

  it('does not permanently cache a degraded high-accuracy result', async () => {
    const { root } = await fixture()
    let mineruAttempts = 0
    const bridge = vi.fn<DocumentEngineRunner>(async (input) => {
      if (input.engine === 'mineru-local') {
        mineruAttempts += 1
        if (mineruAttempts === 1) throw new Error('MinerU temporarily unavailable')
        return runner('accurate result')(input)
      }
      return runner('degraded result')(input)
    })
    const service = new DocumentEngineService({ runner: bridge })
    const request = {
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate' as const,
      idempotencyKey: 'retry-accurate'
    }

    const degraded = await service.parse(request)
    const recovered = await service.parse({ ...request, parseId: 'retry-accurate-2' })

    expect(degraded).toMatchObject({ engine: 'markitdown', degradedFrom: 'mineru-local', cacheHit: false })
    expect(recovered).toMatchObject({ engine: 'mineru-local', cacheHit: false })
    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual([
      'mineru-local',
      'markitdown',
      'mineru-local'
    ])
  }, 15_000)

  it('ignores an invalid optional Unlimited-OCR URL on MarkItDown-only routes', async () => {
    const { root } = await fixture()
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })

    await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast',
      unlimitedOcrServerUrl: 'not a URL',
      idempotencyKey: 'invalid-ocr-fast'
    })
    await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'auto',
      unlimitedOcrServerUrl: 'not a URL',
      idempotencyKey: 'invalid-ocr-auto'
    })

    const spreadsheet = await officeFixture('.xlsx', {
      '[Content_Types].xml': '<Types/>',
      'xl/workbook.xml': '<workbook><sheets><sheet name="Sheet1"/></sheets></workbook>'
    })
    await service.parse({
      workspaceRoot: spreadsheet.root,
      relativePath: 'source.xlsx',
      mode: 'accurate',
      unlimitedOcrServerUrl: 'not a URL',
      idempotencyKey: 'invalid-ocr-office'
    })

    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual([
      'markitdown',
      'markitdown',
      'markitdown'
    ])
  })

  it('only reports Unlimited-OCR as available after a successful health probe', async () => {
    const unreachable = new DocumentEngineService({
      runner: runner(),
      unlimitedOcr: new UnlimitedOcrService({ fetch: vi.fn(async () => { throw new Error('connection refused') }) as unknown as typeof fetch })
    })
    await expect(unreachable.listEngines(undefined, 'http://127.0.0.1:3000')).resolves.toContainEqual(expect.objectContaining({
      id: 'unlimited-ocr-local',
      state: 'error'
    }))

    const reachable = new DocumentEngineService({
      runner: runner(),
      unlimitedOcr: new UnlimitedOcrService({ fetch: vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch })
    })
    await expect(reachable.listEngines(undefined, 'http://127.0.0.1:3000')).resolves.toContainEqual(expect.objectContaining({
      id: 'unlimited-ocr-local',
      state: 'available'
    }))
  })

  it('falls back to MinerU for an invalid optional OCR URL but rejects explicit Unlimited-OCR selection', async () => {
    const { root } = await fixture()
    const bridge = runner()
    const service = new DocumentEngineService({ runner: bridge })

    await expect(service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      unlimitedOcrServerUrl: 'not a URL',
      idempotencyKey: 'invalid-ocr-accurate'
    })).resolves.toMatchObject({
      engine: 'mineru-local',
      route: { requestedMode: 'accurate', selectedEngine: 'mineru-local' }
    })
    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual(['mineru-local'])

    await expect(service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'fast',
      preferredEngine: 'unlimited-ocr-local',
      idempotencyKey: 'missing-ocr-preferred'
    })).rejects.toMatchObject({
      code: 'document_engine_unavailable',
      message: 'The local Unlimited-OCR server is not configured.'
    })
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

  it('applies one total deadline even when a custom engine ignores cancellation', async () => {
    const { root } = await fixture()
    let engineSignal: AbortSignal | undefined
    const service = new DocumentEngineService({
      parseTimeoutMs: 30,
      runner: async (input) => {
        engineSignal = input.signal
        return new Promise<DocumentSidecarResponse>(() => undefined)
      }
    })
    let safetyTimer: ReturnType<typeof setTimeout> | undefined
    const safety = new Promise<never>((_, reject) => {
      safetyTimer = setTimeout(() => reject(new Error('test safety timeout')), 500)
    })

    try {
      await expect(Promise.race([
        service.parse({
          parseId: 'deadline-parse',
          workspaceRoot: root,
          relativePath: 'source.pdf',
          mode: 'fast',
          idempotencyKey: 'deadline-parse'
        }),
        safety
      ])).rejects.toMatchObject({ code: 'document_parse_timeout' })
    } finally {
      clearTimeout(safetyTimer)
    }
    expect(engineSignal?.aborted).toBe(true)
    expect(service.cancel('deadline-parse')).toBe(false)
  })

  it('does not write the current cache when an engine resolves after the deadline', async () => {
    const { root } = await fixture()
    const outputDirectory = join(root, '.workwise', 'cache', 'late-engine-result')
    const service = new DocumentEngineService({
      parseTimeoutMs: 20,
      runner: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return runner()(input)
      }
    })

    await expect(service.parse({
      parseId: 'late-engine-result',
      workspaceRoot: root,
      relativePath: 'source.pdf',
      outputDirectory: relative(root, outputDirectory),
      mode: 'fast',
      idempotencyKey: 'late-engine-result'
    })).rejects.toMatchObject({ code: 'document_parse_timeout' })

    await new Promise((resolve) => setTimeout(resolve, 100))
    await expect(readFile(join(outputDirectory, 'workwise-result.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('redacts URLs plus macOS and Windows paths, including spaces', () => {
    const message = [
      'failed at /Users/test/Private Documents/client secret.pdf',
      'and C:\\Users\\test\\Private Documents\\token.json',
      'via https://ocr.example.test/jobs/1?token=secret'
    ].join(' ')

    const sanitized = sanitizeDocumentDiagnostic(message)

    expect(sanitized).not.toContain('client secret.pdf')
    expect(sanitized).not.toContain('token.json')
    expect(sanitized).not.toContain('ocr.example.test')
    expect(sanitized).toContain('[path]')
    expect(sanitized).toContain('[url]')
  })

  it('keeps the lightweight result when accurate MinerU parsing fails', async () => {
    const { root } = await fixture()
    const bridge = vi.fn<DocumentEngineRunner>(async (input) => {
      if (input.engine === 'mineru-local') throw new Error('/Users/test/private/model failed')
      return runner('fallback')(input)
    })
    const service = new DocumentEngineService({ runner: bridge })
    const result = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      idempotencyKey: 'fallback'
    })
    expect(result.engine).toBe('markitdown')
    expect(result.degradedFrom).toBe('mineru-local')
    expect(result.quality).toMatchObject({ status: 'degraded', reasons: ['engine_fallback'] })
    expect(result.warnings.join(' ')).toContain('[path]')
    const cached = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      parseId: 'fallback-cached',
      idempotencyKey: 'fallback'
    })
    expect(cached).toMatchObject({ cacheHit: false, degradedFrom: 'mineru-local' })
    expect(cached.warnings.join(' ')).toContain('[path]')
    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual([
      'mineru-local',
      'markitdown',
      'mineru-local',
      'markitdown'
    ])
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
    expect(result.sourceStructure).toEqual({ pageCount: 1 })
    expect(result.route).toEqual({ requestedMode: 'fast', selectedEngine: 'markitdown' })
  })

  it('preserves worksheet names and slide counts from validated Office packages', async () => {
    const spreadsheet = await officeFixture('.xlsx', {
      '[Content_Types].xml': '<Types/>',
      'xl/workbook.xml': '<workbook><sheets><sheet name="投标&amp;报价"/><sheet name="风险清单"/></sheets></workbook>'
    })
    const spreadsheetResult = await new DocumentEngineService({ runner: runner('# 投标&报价\n\n内容') }).parse({
      workspaceRoot: spreadsheet.root, relativePath: 'source.xlsx', mode: 'fast', idempotencyKey: 'xlsx-structure'
    })
    expect(spreadsheetResult.sourceStructure).toEqual({ worksheets: ['投标&报价', '风险清单'] })

    const presentation = await officeFixture('.pptx', {
      '[Content_Types].xml': '<Types/>',
      'ppt/presentation.xml': '<presentation/>',
      'ppt/slides/slide1.xml': '<slide/>',
      'ppt/slides/slide2.xml': '<slide/>'
    })
    const presentationResult = await new DocumentEngineService({ runner: runner('<!-- Slide number: 1 -->\n内容') }).parse({
      workspaceRoot: presentation.root, relativePath: 'source.pptx', mode: 'fast', idempotencyKey: 'pptx-structure'
    })
    expect(presentationResult.sourceStructure).toEqual({ slideCount: 2 })
  })

  it('keeps low-quality auto parsing on MarkItDown and recommends an explicit high-accuracy retry', async () => {
    const { root } = await fixture()
    const bridge = runner('tiny')
    const service = new DocumentEngineService({ runner: bridge })
    const automatic = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'auto',
      idempotencyKey: 'auto-route'
    })
    expect(automatic).toMatchObject({
      engine: 'markitdown',
      quality: { status: 'degraded', reasons: ['low_text_density'] },
      route: { requestedMode: 'auto', selectedEngine: 'markitdown' }
    })
    expect(automatic.warnings.join(' ')).toContain('choose high-accuracy parsing')
    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual(['markitdown'])

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

  it('prefers configured Unlimited-OCR and falls back to MinerU without losing diagnostics', async () => {
    const { root } = await fixture()
    const accurateBridge = runner('unlimited result')
    const accurateService = new DocumentEngineService({ runner: accurateBridge })
    const accurate = await accurateService.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      unlimitedOcrServerUrl: 'http://127.0.0.1:3000',
      idempotencyKey: 'unlimited-accurate'
    })
    expect(accurate).toMatchObject({
      engine: 'unlimited-ocr-local',
      quality: { status: 'enhanced' }
    })
    expect(accurateBridge.mock.calls.map(([input]) => input.engine)).toEqual(['unlimited-ocr-local'])

    const fallbackBridge = vi.fn<DocumentEngineRunner>(async (input) => {
      if (input.engine === 'unlimited-ocr-local') throw new Error('/private/model unavailable')
      return runner(input.engine === 'markitdown' ? 'tiny' : 'mineru result')(input)
    })
    const fallbackService = new DocumentEngineService({ runner: fallbackBridge })
    const fallback = await fallbackService.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      unlimitedOcrServerUrl: 'http://127.0.0.1:3000',
      outputDirectory: '.workwise/cache/unlimited-fallback',
      idempotencyKey: 'unlimited-fallback'
    })
    expect(fallback.engine).toBe('mineru-local')
    expect(fallback.quality.status).toBe('enhanced')
    expect(fallback.route).toEqual({
      requestedMode: 'accurate',
      selectedEngine: 'mineru-local',
      fallbackFrom: 'unlimited-ocr-local'
    })
    expect(fallback.degradedFrom).toBeUndefined()
    expect(fallback.warnings.join(' ')).toContain('Unlimited-OCR failed: [path]')
    expect(fallbackBridge.mock.calls.map(([input]) => input.engine)).toEqual([
      'unlimited-ocr-local',
      'mineru-local'
    ])
  })

  it('returns a degraded MarkItDown result when every high-accuracy engine fails', async () => {
    const { root } = await fixture()
    const bridge = vi.fn<DocumentEngineRunner>(async (input) => {
      if (input.engine === 'unlimited-ocr-local') throw new Error('/private/unlimited unavailable')
      if (input.engine === 'mineru-local') throw new Error('/private/mineru unavailable')
      return runner('usable fallback')(input)
    })
    const service = new DocumentEngineService({ runner: bridge })

    const result = await service.parse({
      workspaceRoot: root,
      relativePath: 'source.pdf',
      mode: 'accurate',
      unlimitedOcrServerUrl: 'http://127.0.0.1:3000',
      idempotencyKey: 'all-accurate-engines-failed'
    })

    expect(result).toMatchObject({
      engine: 'markitdown',
      degradedFrom: 'mineru-local',
      quality: { status: 'degraded', reasons: ['engine_fallback'] },
      route: {
        requestedMode: 'accurate',
        selectedEngine: 'markitdown',
        fallbackFrom: 'mineru-local'
      }
    })
    expect(result.warnings.join(' ')).toContain('Unlimited-OCR failed: [path]')
    expect(result.warnings.join(' ')).toContain('MinerU failed: [path]')
    expect(bridge.mock.calls.map(([input]) => input.engine)).toEqual([
      'unlimited-ocr-local',
      'mineru-local',
      'markitdown'
    ])
  })
})

async function officeFixture(extension: '.xlsx' | '.pptx', files: Record<string, string>): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-office-structure-'))
  roots.push(root)
  const path = join(root, `source${extension}`)
  const archive = new JSZip()
  Object.entries(files).forEach(([name, contents]) => archive.file(name, contents))
  await writeFile(path, await archive.generateAsync({ type: 'nodebuffer' }))
  return { root, path }
}

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
