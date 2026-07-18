import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { DocumentEngineService } from './document-engine-service'
import { sanitizeSvg, WorkspacePreviewService } from './workspace-preview-service'

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

  it('returns bounded image and PDF descriptors', async () => {
    const workspace = await root()
    await writeFile(join(workspace, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await writeFile(join(workspace, 'document.pdf'), minimalPdf('Searchable PDF'))
    const service = new WorkspacePreviewService(new DocumentEngineService({ runner: async () => ({ ok: false }) }))
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'pixel.png', idempotencyKey: 'image' }))
      .resolves.toMatchObject({ kind: 'image', mediaType: 'image/png' })
    await expect(service.preview({ workspaceRoot: workspace, relativePath: 'document.pdf', idempotencyKey: 'pdf' }))
      .resolves.toMatchObject({
        kind: 'pdf',
        pageCount: 1,
        searchable: true,
        pageTexts: [{ page: 1, text: 'Searchable PDF' }]
      })
  })

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
