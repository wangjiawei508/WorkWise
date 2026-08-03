import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentEngineService } from './document-engine-service'
import { ChatAttachmentImportService } from './chat-attachment-import-service'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function serviceWithFile(name: string, contents: string | Buffer, parse?: DocumentEngineService['parse']) {
  const root = await mkdtemp(join(tmpdir(), 'workwise-chat-attachment-'))
  roots.push(root)
  const sourcePath = join(root, name)
  await writeFile(sourcePath, contents)
  const service = new ChatAttachmentImportService({
    managedRoot: join(root, 'managed'),
    ...(parse ? { documentEngine: { parse } as DocumentEngineService } : {})
  })
  return { service, sourcePath }
}

describe('ChatAttachmentImportService parse states', () => {
  it('rejects empty text and corrupt PDF signatures with explicit errors', async () => {
    const empty = await serviceWithFile('empty.txt', '   \n')
    const stagedText = await empty.service.stage({ sourcePath: empty.sourcePath })
    await expect(empty.service.parse(stagedText)).rejects.toThrow('no usable text')

    const corrupt = await serviceWithFile('damaged.pdf', 'not a pdf')
    await expect(corrupt.service.stage({ sourcePath: corrupt.sourcePath })).rejects.toThrow('PDF signature is invalid')

    const spoofed = await serviceWithFile('spoofed.pdf', '%PDF-1.7\n%%EOF')
    await expect(spoofed.service.stage({ sourcePath: spoofed.sourcePath, declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).rejects.toThrow('MIME type does not match')
  })

  it('surfaces password errors and preserves degraded OCR/parser metadata', async () => {
    const encrypted = await serviceWithFile('encrypted.pdf', '%PDF-1.7\n%%EOF', vi.fn(async () => {
      throw Object.assign(new Error('Password-protected PDF requires a password before it can be read.'), { code: 'password_required' })
    }))
    const stagedEncrypted = await encrypted.service.stage({ sourcePath: encrypted.sourcePath })
    await expect(encrypted.service.parse(stagedEncrypted)).rejects.toMatchObject({ code: 'password_required' })

    const degraded = await serviceWithFile('scan.pdf', '%PDF-1.7\n%%EOF', vi.fn(async () => ({
      id: 'parse', engine: 'markitdown' as const, engineVersion: 'fixture', sourceSha256: 'hash',
      markdown: '# 招标文件\n\n扫描正文', headings: [{ level: 1, text: '招标文件', page: 2 }],
      tables: [{ markdown: '| 条款 | 值 |', page: 3 }], media: [], references: [],
      sourceStructure: { pageCount: 120 }, warnings: ['OCR is not installed'],
      quality: { status: 'degraded' as const, reasons: ['scanned_or_sparse_pages'] },
      route: { requestedMode: 'auto' as const, selectedEngine: 'markitdown' as const }, cacheHit: false, durationMs: 1
    })))
    const stagedScan = await degraded.service.stage({ sourcePath: degraded.sourcePath })
    await expect(degraded.service.parse(stagedScan)).resolves.toMatchObject({
      state: 'degraded', warnings: ['OCR is not installed'], degradationReasons: ['scanned_or_sparse_pages'],
      sourceStructure: { pageCount: 120, headings: 1, tables: 1 }
    })
  })
})
