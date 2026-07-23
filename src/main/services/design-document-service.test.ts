import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESIGN_DOCUMENT_LIMITS,
  createDesignDocument,
  createDesignElement,
  validateDesignDocumentResourceLimits
} from '../../shared/design-document'
import {
  listDesignDocuments,
  loadDesignDocument,
  readDesignAsset,
  readSafeDesignImageSource,
  saveDesignDocument,
  storeDesignImageAsset
} from './design-document-service'

const tempRoots: string[] = []
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

async function temporaryWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-design-document-'))
  tempRoots.push(root)
  return root
}

describe('Design document persistence', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('atomically saves, indexes, and restores a workspace Design document', async () => {
    const root = await temporaryWorkspace()
    const document = createDesignDocument({ name: 'Report canvas' })
    document.pages[0].elements.push(createDesignElement('rect'))
    document.appliedCommands = [{
      idempotencyKey: 'turn-1-command-1',
      revision: 0,
      appliedOperations: 1
    }]

    const saved = await saveDesignDocument({
      workspaceRoot: root,
      document,
      activePageId: document.pages[0].id,
      expectedRevision: null
    })
    expect(saved.ok).toBe(true)
    expect(saved.revision).toBe(document.revision)

    const loaded = await loadDesignDocument(root)
    expect(loaded.ok).toBe(true)
    expect(loaded.document?.name).toBe('Report canvas')
    expect(loaded.document?.pages[0].elements).toHaveLength(1)
    expect(loaded.document?.appliedCommands).toEqual(document.appliedCommands)
    expect(loaded.activePageId).toBe(document.pages[0].id)
  })

  it('lists and reopens previously saved Design documents without relying on the active index', async () => {
    const root = await temporaryWorkspace()
    const first = createDesignDocument({ name: 'First board' })
    const second = createDesignDocument({ name: 'Second board' })
    expect((await saveDesignDocument({
      workspaceRoot: root,
      document: first,
      activePageId: first.pages[0].id,
      expectedRevision: null
    })).ok).toBe(true)
    expect((await saveDesignDocument({
      workspaceRoot: root,
      document: second,
      activePageId: second.pages[0].id,
      expectedRevision: null
    })).ok).toBe(true)
    await writeFile(
      join(root, '.workwise', 'design', 'doc_corrupt.workwise-design.json'),
      '{not-json'
    )

    const listed = await listDesignDocuments(root)
    expect(listed).toMatchObject({
      ok: true,
      activeDocumentId: second.id,
      corruptDocumentIds: ['doc_corrupt']
    })
    expect(listed.documents.map((document) => document.id)).toEqual(
      expect.arrayContaining([first.id, second.id])
    )
    const reopened = await loadDesignDocument(root, first.id)
    expect(reopened).toMatchObject({
      ok: true,
      document: { id: first.id, name: 'First board' }
    })
  })

  it('reloads a multi-megabyte document after a successful bounded save', async () => {
    const root = await temporaryWorkspace()
    const document = createDesignDocument({ name: 'Large but safe' })
    document.pages[0].elements = Array.from({ length: 20 }, (_, index) =>
      createDesignElement('text', {
        id: `el_large_${index}`,
        text: '文'.repeat(60_000),
        zIndex: index
      })
    )

    const saved = await saveDesignDocument({
      workspaceRoot: root,
      document,
      activePageId: document.pages[0].id,
      expectedRevision: null
    })
    expect(saved.ok).toBe(true)

    const loaded = await loadDesignDocument(root, document.id)
    expect(loaded.ok).toBe(true)
    expect(loaded.document?.pages[0].elements).toHaveLength(20)
    expect(loaded.document?.pages[0].elements[19].text).toHaveLength(60_000)
  })

  it('rejects a document when pretty-printed persistence would exceed 8 MiB', async () => {
    const root = await temporaryWorkspace()
    const document = createDesignDocument({ name: 'Pretty overflow' })
    document.pages[0].elements = Array.from(
      { length: DESIGN_DOCUMENT_LIMITS.elementsPerPage },
      (_, index) =>
        createDesignElement('text', {
          id: `el_${index}`,
          text: '',
          zIndex: index
        })
    )

    let textLength = 1_000
    for (;;) {
      const text = 'x'.repeat(textLength)
      for (const element of document.pages[0].elements) element.text = text
      const compact = Buffer.byteLength(JSON.stringify(document), 'utf8')
      const pretty = Buffer.byteLength(`${JSON.stringify(document, null, 2)}\n`, 'utf8')
      if (compact <= DESIGN_DOCUMENT_LIMITS.fileBytes && pretty > DESIGN_DOCUMENT_LIMITS.fileBytes) {
        break
      }
      textLength += 25
      if (compact > DESIGN_DOCUMENT_LIMITS.fileBytes) {
        throw new Error('The test fixture could not straddle compact and persisted size limits.')
      }
    }
    expect(validateDesignDocumentResourceLimits(document).ok).toBe(true)

    const result = await saveDesignDocument({
      workspaceRoot: root,
      document,
      activePageId: document.pages[0].id,
      expectedRevision: null
    })
    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_document',
      message: expect.stringContaining('8 MiB')
    })
  })

  it('rejects a stale renderer instead of overwriting newer data', async () => {
    const root = await temporaryWorkspace()
    const document = createDesignDocument()
    const first = await saveDesignDocument({
      workspaceRoot: root,
      document,
      activePageId: document.pages[0].id,
      expectedRevision: null
    })
    expect(first.ok).toBe(true)
    if (!first.ok || !first.document) return

    const changed = {
      ...first.document,
      revision: first.document.revision + 1,
      name: 'Changed'
    }
    const second = await saveDesignDocument({
      workspaceRoot: root,
      document: changed,
      activePageId: changed.pages[0].id,
      expectedRevision: first.document.revision
    })
    expect(second.ok).toBe(true)

    const stale = await saveDesignDocument({
      workspaceRoot: root,
      document: { ...first.document, name: 'Stale' },
      activePageId: first.document.pages[0].id,
      expectedRevision: first.document.revision
    })
    expect(stale).toMatchObject({
      ok: false,
      code: 'stale_request',
      currentRevision: second.revision
    })
    expect((await loadDesignDocument(root)).document?.name).toBe('Changed')
  })

  it('does not replace a corrupt document with an empty document', async () => {
    const root = await temporaryWorkspace()
    const document = createDesignDocument()
    const designDirectory = join(root, '.workwise', 'design')
    await mkdir(designDirectory, { recursive: true })
    const documentPath = join(designDirectory, `${document.id}.workwise-design.json`)
    await writeFile(documentPath, '{ broken')

    const result = await saveDesignDocument({
      workspaceRoot: root,
      document,
      activePageId: document.pages[0].id,
      expectedRevision: null
    })
    expect(result.ok).toBe(false)
    expect(await readFile(documentPath, 'utf8')).toBe('{ broken')
  })

  it('stores and reads a signature-checked image asset inside the workspace', async () => {
    const root = await temporaryWorkspace()
    const document = createDesignDocument()
    const stored = await storeDesignImageAsset({
      workspaceRoot: root,
      documentId: document.id,
      originalFilename: '封面.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      bytes: ONE_PIXEL_PNG
    })
    const read = await readDesignAsset(root, document.id, stored.asset)
    expect(read.ok).toBe(true)
    expect(read.dataUrl).toBe(stored.dataUrl)
  })

  it('rejects a symbolic-link image source', async () => {
    const root = await temporaryWorkspace()
    const target = join(root, 'image.png')
    const link = join(root, 'linked.png')
    await writeFile(target, ONE_PIXEL_PNG)
    await symlink(target, link)
    await expect(readSafeDesignImageSource(link)).rejects.toThrow(/regular file/)
  })
})
