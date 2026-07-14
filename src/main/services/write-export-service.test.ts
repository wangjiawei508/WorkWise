import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/tmp/workwise-test-app'
  },
  BrowserWindow: class BrowserWindow {},
  clipboard: {
    write: vi.fn()
  },
  dialog: {
    showSaveDialog: vi.fn()
  }
}))

import {
  buildWriteClipboardHtmlFragment,
  buildWriteExportFileName,
  buildWriteExportHtmlDocument,
  copyWriteDocumentAsRichText,
  resolveBundledMarkdownConverter
} from './write-export-service'
import { buildDocxFromMarkdown } from './write-docx-service'
import { clipboard } from 'electron'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lJYfWQAAAABJRU5ErkJggg==',
  'base64'
)

describe('write-export-service helpers', () => {
  let workspaceRoot = ''

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'ds-gui-write-export-'))
    vi.mocked(clipboard.write).mockReset()
  })

  it('builds export file names with the requested extension', () => {
    expect(buildWriteExportFileName('/tmp/draft.md', 'html')).toBe('draft.html')
    expect(buildWriteExportFileName('/tmp/draft.md', 'pdf')).toBe('draft.pdf')
    expect(buildWriteExportFileName('/tmp/draft.md', 'doc')).toBe('draft.doc')
    expect(buildWriteExportFileName('/tmp/draft.md', 'docx')).toBe('draft.docx')
  })

  it('renders markdown exports with resolved links and inlined local images', async () => {
    const sourcePath = join(workspaceRoot, 'draft.md')
    const imagePath = join(workspaceRoot, 'cover.png')
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const html = await buildWriteExportHtmlDocument({
      sourcePath,
      content: '# Heading\n\n![Cover](./cover.png)\n\n[Notes](./notes.md)'
    })

    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('src="data:image/png;base64,')
    expect(html).toContain(`href="${pathToFileURL(join(workspaceRoot, 'notes.md')).href}"`)
    expect(html).toContain('<html lang="zh-CN">')
  })

  it('renders clipboard html fragments for markdown content', async () => {
    const sourcePath = join(workspaceRoot, 'draft.md')
    const html = await buildWriteClipboardHtmlFragment({
      sourcePath,
      content: '# Heading\n\n**Bold**\n\n- [x] Done\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n[Notes](./notes.md)'
    })

    expect(html).toContain('<article class="markdown-body">')
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<table>')
    expect(html).toContain(`href="${pathToFileURL(join(workspaceRoot, 'notes.md')).href}"`)
  })

  it('renders clipboard html fragments for plain text content', async () => {
    const sourcePath = join(workspaceRoot, 'draft.txt')
    const html = await buildWriteClipboardHtmlFragment({
      sourcePath,
      content: 'plain text\nline two'
    })

    expect(html).toContain('<article class="markdown-body">')
    expect(html).toContain('<pre class="plain-text">plain text\nline two</pre>')
  })

  it('writes html and plain text to the clipboard', async () => {
    const sourcePath = join(workspaceRoot, 'draft.md')
    const imagePath = join(workspaceRoot, 'cover.png')
    await writeFile(sourcePath, '# Heading\n\n![Cover](./cover.png)')
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const result = await copyWriteDocumentAsRichText({
      path: sourcePath,
      workspaceRoot,
      content: '# Heading\n\n![Cover](./cover.png)'
    })

    expect(result.ok).toBe(true)
    expect(clipboard.write).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('<article class="markdown-body">'),
        text: '# Heading\n\n![Cover](./cover.png)'
      })
    )
    expect(clipboard.write).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('src="data:image/png;base64,')
      })
    )
  })

  it('generates a real docx from markdown with tables and local images', async () => {
    const sourcePath = join(workspaceRoot, 'draft.md')
    const imagePath = join(workspaceRoot, 'cover.png')
    await writeFile(imagePath, TINY_PNG)

    const docx = await buildDocxFromMarkdown({
      sourcePath,
      content: [
        '# 标题',
        '',
        '正文包含 **加粗**、`code` 和 [链接](https://example.com)。',
        '',
        '- 项目一',
        '- 项目二',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '![封面](./cover.png)',
        '',
        '```ts',
        'export const ok = true',
        '```'
      ].join('\n')
    })

    const zip = await JSZip.loadAsync(docx)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).toContain('标题')
    expect(documentXml).toContain('加粗')
    expect(documentXml).toContain('export')
    expect(documentXml).toContain('const')
    expect(documentXml).toContain('ok = ')
    expect(documentXml).toContain('true')
    expect(documentXml).toContain('<w:tbl>')
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(true)
  })

  it('discovers bundled platform converters from WORKWISE_CONVERTER_ROOT', async () => {
    const previous = process.env.WORKWISE_CONVERTER_ROOT
    const converterRoot = join(workspaceRoot, 'converters')
    const platformDir = process.platform === 'win32'
      ? 'win32-x64'
      : process.platform === 'darwin' && process.arch === 'arm64'
        ? 'darwin-arm64'
        : `${process.platform}-${process.arch}`
    const pandocName = process.platform === 'win32' ? 'pandoc.exe' : 'pandoc'
    const md2docxName = process.platform === 'win32' ? 'md2docx.exe' : 'md2docx.bin'
    await mkdir(join(converterRoot, platformDir), { recursive: true })
    await writeFile(join(converterRoot, platformDir, pandocName), '')
    await writeFile(join(converterRoot, platformDir, md2docxName), '')
    process.env.WORKWISE_CONVERTER_ROOT = converterRoot

    try {
      expect(resolveBundledMarkdownConverter()).toEqual({
        pandocPath: join(converterRoot, platformDir, pandocName),
        md2docxPath: join(converterRoot, platformDir, md2docxName)
      })
    } finally {
      if (previous === undefined) {
        delete process.env.WORKWISE_CONVERTER_ROOT
      } else {
        process.env.WORKWISE_CONVERTER_ROOT = previous
      }
    }
  })
})
