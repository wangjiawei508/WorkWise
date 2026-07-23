import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDesignDocument, createDesignElement } from '../../shared/design-document'
import {
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
    expect(loaded.activePageId).toBe(document.pages[0].id)
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
