import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentEngineService } from './document-engine-service'
import {
  normalizeSpreadsheetPreviewMarkdown,
  sanitizeSvg,
  WorkspacePreviewService
} from './workspace-preview-service'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'workwise-preview-'))
  roots.push(value)
  return value
}

describe('WorkspacePreviewService', () => {
  it('sanitizes active SVG content', () => {
    const sanitized = sanitizeSvg('<svg onload="x"><script>x()</script><a href="https://bad">ok</a><rect /></svg>')
    expect(sanitized).not.toMatch(/script|onload|https:/)
  })

  it('compacts sparse spreadsheet Markdown and removes parser NaN placeholders', () => {
    const source = [
      '## Sheet 1',
      '| 项目 | Unnamed: 1 | Unnamed: 2 | 状态 |',
      '| --- | --- | --- | --- |',
      '| 任务引擎 | NaN | NaN | 通过 |',
      '| NaN | NaN | NaN | NaN |'
    ].join('\n')

    const result = normalizeSpreadsheetPreviewMarkdown(source)

    expect(result.compacted).toBe(true)
    expect(result.markdown).toContain('任务引擎 · 通过')
    expect(result.markdown).not.toMatch(/NaN|Unnamed:/)
  })

  it('keeps compact regular spreadsheet tables as tables', () => {
    const source = [
      '| 项目 | 状态 |',
      '| --- | --- |',
      '| PPTX | 通过 |'
    ].join('\n')

    const result = normalizeSpreadsheetPreviewMarkdown(source)

    expect(result.compacted).toBe(false)
    expect(result.markdown).toBe(source)
  })

  it('returns bounded image and PDF descriptors', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Searchable PDF'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async (input) => {
      const output = join(input.outputDirectory, 'document.md')
      await mkdir(input.outputDirectory, { recursive: true })
      await writeFile(output, '# Parsed')
      return {
        ok: true,
        engine: 'markitdown',
        engineVersion: 'fixture',
        sourceSha256: 'hash',
        markdownPath: relative(input.workspaceRoot, output),
        references: [{ page: 1, kind: 'text' }],
        warnings: ['Parser detected a cross-page table.'],
        durationMs: 1
      }
    } }))
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'pixel.png', idempotencyKey: 'image' }))
      .resolves.toMatchObject({ kind: 'image', mediaType: 'image/png' })
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'document.pdf', idempotencyKey: 'pdf' }))
      .resolves.toMatchObject({
        kind: 'pdf',
        pageCount: 1,
        searchable: true,
        pageTexts: [{ page: 1, text: 'Searchable PDF' }],
        document: {
          engine: 'markitdown',
          route: { requestedMode: 'fast', selectedEngine: 'markitdown' },
          references: [{ page: 1, kind: 'text' }]
        },
        warnings: expect.arrayContaining(['Parser detected a cross-page table.'])
      })
  }, 15_000)

  it('keeps the PDF.js preview available when parsing metadata cannot be produced', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('PDF.js remains available'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async () => ({ ok: false }) }))

    const preview = await service.preview({ workspaceRoot: workspace, relativePath: 'document.pdf', idempotencyKey: 'pdf-fallback' })
    expect(preview).toMatchObject({
        kind: 'pdf',
        pageTexts: [{ page: 1, text: 'PDF.js remains available' }],
        documentError: { code: 'document_parse_failed' },
        warnings: expect.arrayContaining([
          'Document parsing failed (document_parse_failed): Document parser returned an invalid response. PDF.js reading and search remain available.'
        ])
      })
    if (preview.kind === 'pdf') expect(preview.document).toBeUndefined()
  }, 15_000)

  it('preserves bounded retry reasons when accurate parsing fails', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'scan.pdf'), minimalPdf('PDF.js remains available'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async () => ({ ok: false }) }))

    const preview = await service.preview({
      workspaceRoot: workspace,
      relativePath: 'scan.pdf',
      parsingMode: 'accurate',
      retryReasons: ['scanned_document', 'weak_text_layer'],
      idempotencyKey: 'pdf-accurate-fallback'
    })

    expect(preview).toMatchObject({
      kind: 'pdf',
      retryReasons: ['scanned_document', 'weak_text_layer'],
      documentError: { code: 'document_parse_failed' }
    })
  }, 15_000)

  it('merges retry reasons into a successful accurate route', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'scan.pdf'), minimalPdf('Accurate preview'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async (input) => {
      const output = join(input.outputDirectory, 'document.md')
      await mkdir(input.outputDirectory, { recursive: true })
      await writeFile(output, '# Accurate')
      return {
        ok: true,
        engine: input.engine,
        engineVersion: 'fixture',
        sourceSha256: 'hash',
        markdownPath: relative(input.workspaceRoot, output),
        durationMs: 1
      }
    } }))

    const preview = await service.preview({
      workspaceRoot: workspace,
      relativePath: 'scan.pdf',
      parsingMode: 'accurate',
      retryReasons: ['scanned_document'],
      unlimitedOcrServerUrl: 'http://127.0.0.1:3000',
      idempotencyKey: 'pdf-accurate-reason'
    })

    expect(preview).toMatchObject({
      kind: 'pdf',
      retryReasons: ['scanned_document'],
      document: { route: { switchReason: ['scanned_document'] } }
    })
  }, 15_000)

  it('preserves a structured and redacted parser failure while keeping PDF.js available', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('PDF.js remains available'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async () => ({
      ok: false,
      message: 'OCR failed at /Users/test/Private Documents/secret.pdf via https://ocr.example.test/jobs/1?token=secret'
    }) }))

    const preview = await service.preview({ workspaceRoot: workspace, relativePath: 'document.pdf', idempotencyKey: 'pdf-error' })

    expect(preview).toMatchObject({
      kind: 'pdf',
      documentError: {
        code: 'document_parse_failed',
        message: expect.stringContaining('[path]')
      }
    })
    if (preview.kind === 'pdf') {
      expect(preview.documentError?.message).not.toContain('secret.pdf')
      expect(preview.documentError?.message).not.toContain('ocr.example.test')
      expect(preview.warnings.join(' ')).toContain('document_parse_failed')
    }
  }, 15_000)

  it('forwards the selected accurate PDF route and configured local OCR address', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Accurate preview'))
    let received: { parseId: string; engine: string; unlimitedOcrServerUrl?: string } | undefined
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async (input) => {
      received = { parseId: input.parseId, engine: input.engine, unlimitedOcrServerUrl: input.unlimitedOcrServerUrl }
      const output = join(input.outputDirectory, 'document.md')
      await mkdir(input.outputDirectory, { recursive: true })
      await writeFile(output, '# Accurate')
      return {
        ok: true,
        engine: input.engine,
        engineVersion: 'fixture',
        sourceSha256: 'hash',
        markdownPath: relative(input.workspaceRoot, output),
        durationMs: 1
      }
    } }))

    await service.preview({
      workspaceRoot: workspace,
      relativePath: 'document.pdf',
      parsingMode: 'accurate',
      unlimitedOcrServerUrl: 'http://127.0.0.1:3000',
      idempotencyKey: 'pdf-accurate'
    })

    expect(received).toEqual({ parseId: 'pdf-accurate', engine: 'unlimited-ocr-local', unlimitedOcrServerUrl: 'http://127.0.0.1:3000' })
  }, 15_000)

  it('exposes PDF parse quality reasons on the preview route metadata', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Sparse'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async (input) => {
      const output = join(input.outputDirectory, 'document.md')
      await mkdir(input.outputDirectory, { recursive: true })
      await writeFile(output, 'tiny')
      return {
        ok: true,
        engine: 'markitdown',
        engineVersion: 'fixture',
        sourceSha256: 'hash',
        markdownPath: relative(input.workspaceRoot, output),
        durationMs: 1
      }
    } }))

    const preview = await service.preview({
      workspaceRoot: workspace,
      relativePath: 'document.pdf',
      parsingMode: 'auto',
      idempotencyKey: 'pdf-route-reason'
    })

    expect(preview).toMatchObject({
      kind: 'pdf',
      document: {
        route: {
          requestedMode: 'auto',
          selectedEngine: 'markitdown',
          switchReason: expect.arrayContaining(['low_text_density'])
        }
      }
    })
  }, 15_000)

  it('preserves parsed title-to-page mappings in the PDF preview result', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Mapped title content'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async (input) => {
      const output = join(input.outputDirectory, 'document.md')
      await mkdir(input.outputDirectory, { recursive: true })
      await writeFile(output, '# Mapped title\n\nBody')
      return {
        ok: true,
        engine: 'markitdown',
        engineVersion: 'fixture',
        sourceSha256: 'hash',
        markdownPath: relative(input.workspaceRoot, output),
        headings: [{ level: 1, text: 'Mapped title' }],
        durationMs: 1
      }
    } }))

    const preview = await service.preview({
      workspaceRoot: workspace,
      relativePath: 'document.pdf',
      idempotencyKey: 'pdf-heading-provenance'
    })

    expect(preview).toMatchObject({
      kind: 'pdf',
      document: {
        headings: [{ level: 1, text: 'Mapped title', page: 1 }]
      }
    })
  }, 15_000)

  it('uses the preview idempotency key as the cancellable document parse id', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Cancellable preview'))
    let started!: () => void
    const didStart = new Promise<void>((resolve) => { started = resolve })
    const documents = new DocumentEngineService({ runner: async (input) => new Promise((resolve, reject) => {
      started()
      input.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      void resolve
    }) })
    const service = new WorkspacePreviewService(documents)
    const pending = service.preview({ workspaceRoot: workspace, relativePath: 'document.pdf', idempotencyKey: 'preview-cancel' })
    await didStart

    expect(documents.cancel('preview-cancel')).toBe(true)
    await expect(pending).rejects.toMatchObject({ code: 'document_parse_cancelled' })
  }, 15_000)

  it('cancels during PDF.js pre-analysis without starting the document engine', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Cancellable analysis'))
    let started!: () => void
    const didStart = new Promise<void>((resolve) => { started = resolve })
    const parser = vi.fn(async () => ({ ok: false }))
    const documents = new DocumentEngineService({ runner: parser })
    const service = new WorkspacePreviewService(documents, async (_path, signal) => {
      started()
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), {
          code: 'document_parse_cancelled'
        })), { once: true })
      })
    })
    const pending = service.preview({
      workspaceRoot: workspace,
      relativePath: 'document.pdf',
      idempotencyKey: 'preview-analysis-cancel'
    })
    await didStart

    expect(service.cancel('preview-analysis-cancel')).toBe(true)
    await expect(pending).rejects.toMatchObject({ code: 'document_parse_cancelled' })
    expect(parser).not.toHaveBeenCalled()
  }, 15_000)

  it('rejects an OOXML file that only changed its extension', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'fake.pptx'), 'not a zip')
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async () => ({ ok: false }) }))
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'fake.pptx', idempotencyKey: 'fake' }))
      .rejects.toThrow(/OOXML/)
  })

  it('rejects OOXML traversal before invoking MarkItDown', async () => {
    const workspace = await root()
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('ppt/presentation.xml', '<p:presentation/>')
    zip.file('ppt/slides/slide1.xml', '<p:sld/>')
    zip.file('../outside.xml', '<outside/>')
    await writeFile(join(workspace, 'unsafe.pptx'), await zip.generateAsync({ type: 'nodebuffer' }))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async () => {
      throw new Error('parser must not run')
    } }))
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'unsafe.pptx', idempotencyKey: 'unsafe' }))
      .rejects.toMatchObject({ code: 'unsafe_file' })
  })

  it('reads PPTX slide count before using the document parser', async () => {
    const workspace = await root()
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('ppt/presentation.xml', '<p:presentation/>')
    zip.file('ppt/slides/slide1.xml', '<p:sld/>')
    zip.file('ppt/slides/slide2.xml', '<p:sld/>')
    await writeFile(join(workspace, 'deck.pptx'), await zip.generateAsync({ type: 'nodebuffer' }))
    const documents = new DocumentEngineService({
      runner: async (input) => {
        const output = join(input.outputDirectory, 'document.md')
        await mkdir(input.outputDirectory, { recursive: true })
        await writeFile(output, '# Deck')
        return {
          ok: true,
          engine: 'markitdown',
          engineVersion: 'fixture',
          sourceSha256: 'hash',
          markdownPath: relative(input.workspaceRoot, output),
          durationMs: 1
        }
      }
    })
    const service = new WorkspacePreviewService(documents)
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'deck.pptx', idempotencyKey: 'deck' }))
      .resolves.toMatchObject({ kind: 'office', format: 'pptx', pageCount: 2, markdown: '# Deck' })
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
