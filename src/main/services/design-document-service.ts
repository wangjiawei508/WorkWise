import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  normalizeDesignDocument,
  type DesignAsset,
  type DesignDocumentV1
} from '../../shared/design-document'
import type {
  DesignAssetReadResult,
  DesignDocumentLoadResult,
  DesignDocumentSavePayload,
  DesignDocumentSaveResult
} from '../../shared/design-workspace'
import {
  canonicalizeContainmentRoot,
  recheckContainedParent,
  resolveContainedPath,
  UnsafePathError
} from './canonical-containment'
import { atomicWriteFile, readRecoveredFile, runSerialized } from './durable-file'

const DESIGN_DIRECTORY = '.workwise/design'
const DESIGN_INDEX_FILE = 'index.json'
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const SAFE_DOCUMENT_ID = /^doc_[A-Za-z0-9_-]{1,120}$/
const SAFE_ASSET_ID = /^asset_[A-Za-z0-9_-]{1,120}$/
const SAFE_ASSET_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/

type DesignIndexV1 = {
  schema: 'workwise.design.index'
  version: 1
  activeDocumentId: string
  activePageByDocument: Record<string, string>
  updatedAt: number
}

export type DesignImageAssetWriteInput = {
  workspaceRoot: string
  documentId: string
  originalFilename: string
  mimeType: string
  width: number
  height: number
  bytes: Uint8Array
}

function assertDocumentId(documentId: string): void {
  if (!SAFE_DOCUMENT_ID.test(documentId)) throw new UnsafePathError('Invalid Design document id.')
}

function documentRelativePath(documentId: string): string {
  assertDocumentId(documentId)
  return `${DESIGN_DIRECTORY}/${documentId}.workwise-design.json`
}

function indexRelativePath(): string {
  return `${DESIGN_DIRECTORY}/${DESIGN_INDEX_FILE}`
}

function assetRelativePath(documentId: string, filename: string): string {
  assertDocumentId(documentId)
  if (!SAFE_ASSET_FILENAME.test(filename)) throw new UnsafePathError('Invalid Design asset filename.')
  return `${DESIGN_DIRECTORY}/assets/${documentId}/${filename}`
}

async function readBoundedJson(path: string): Promise<unknown> {
  const info = await stat(path)
  if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Design document is not a valid bounded file.')
  }
  const raw = await readRecoveredFile(path)
  return JSON.parse(raw)
}

function normalizeIndex(input: unknown): DesignIndexV1 | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<DesignIndexV1>
  if (
    raw.schema !== 'workwise.design.index' ||
    raw.version !== 1 ||
    typeof raw.activeDocumentId !== 'string' ||
    !SAFE_DOCUMENT_ID.test(raw.activeDocumentId) ||
    !raw.activePageByDocument ||
    typeof raw.activePageByDocument !== 'object'
  ) {
    return null
  }
  const activePageByDocument: Record<string, string> = {}
  for (const [documentId, pageId] of Object.entries(raw.activePageByDocument)) {
    if (
      SAFE_DOCUMENT_ID.test(documentId) &&
      typeof pageId === 'string' &&
      pageId.length > 0 &&
      pageId.length <= 160
    ) {
      activePageByDocument[documentId] = pageId
    }
  }
  return {
    schema: 'workwise.design.index',
    version: 1,
    activeDocumentId: raw.activeDocumentId,
    activePageByDocument,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
  }
}

async function readIndex(workspaceRoot: string): Promise<DesignIndexV1 | null> {
  const indexPath = await resolveContainedPath({
    root: workspaceRoot,
    target: indexRelativePath(),
    mustExist: false,
    expect: 'file',
    rejectFinalLink: true
  })
  try {
    return normalizeIndex(await readBoundedJson(indexPath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function loadDesignDocument(
  workspaceRootInput: string,
  requestedDocumentId?: string
): Promise<DesignDocumentLoadResult> {
  try {
    const workspaceRoot = await canonicalizeContainmentRoot(workspaceRootInput)
    let index: DesignIndexV1 | null = null
    let documentId = requestedDocumentId
    if (!documentId) {
      try {
        index = await readIndex(workspaceRoot)
      } catch (error) {
        return {
          ok: false,
          code: 'corrupt',
          message: error instanceof Error ? error.message : String(error)
        }
      }
      documentId = index?.activeDocumentId
    }
    if (!documentId) return { ok: false, code: 'not_found', message: 'No saved Design document.' }
    assertDocumentId(documentId)

    const documentPath = await resolveContainedPath({
      root: workspaceRoot,
      target: documentRelativePath(documentId),
      mustExist: false,
      expect: 'file',
      rejectFinalLink: true
    })
    let raw: unknown
    try {
      raw = await readBoundedJson(documentPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, code: 'not_found', message: 'Saved Design document was not found.' }
      }
      return {
        ok: false,
        code: 'corrupt',
        message: error instanceof Error ? error.message : String(error)
      }
    }
    const document = normalizeDesignDocument(raw as Partial<DesignDocumentV1>)
    if (!document || document.id !== documentId) {
      return { ok: false, code: 'corrupt', message: 'Saved Design document is invalid.' }
    }
    if (!index) {
      try {
        index = await readIndex(workspaceRoot)
      } catch {
        index = null
      }
    }
    const indexedPageId = index?.activePageByDocument[document.id]
    const activePageId = document.pages.some((page) => page.id === indexedPageId)
      ? indexedPageId
      : document.pages[0]?.id
    return {
      ok: true,
      document,
      activePageId,
      revision: document.revision
    }
  } catch (error) {
    return {
      ok: false,
      code: error instanceof UnsafePathError ? 'unsafe_path' : 'read_failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function saveDesignDocument(
  payload: DesignDocumentSavePayload
): Promise<DesignDocumentSaveResult> {
  try {
    const workspaceRoot = await canonicalizeContainmentRoot(payload.workspaceRoot)
    const normalized = normalizeDesignDocument(payload.document)
    if (
      !normalized ||
      normalized.id !== payload.document.id ||
      !normalized.pages.some((page) => page.id === payload.activePageId)
    ) {
      return { ok: false, code: 'invalid_document', message: 'Design document is invalid.' }
    }
    assertDocumentId(normalized.id)

    return runSerialized(`design-workspace:${workspaceRoot}`, async () => {
      const documentPath = await resolveContainedPath({
        root: workspaceRoot,
        target: documentRelativePath(normalized.id),
        mustExist: false,
        expect: 'file',
        rejectFinalLink: true
      })
      let current: DesignDocumentV1 | null = null
      try {
        const raw = await readBoundedJson(documentPath)
        current = normalizeDesignDocument(raw as Partial<DesignDocumentV1>)
        if (!current || current.id !== normalized.id) {
          return { ok: false, code: 'invalid_document', message: 'Existing Design document is corrupt.' }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          return {
            ok: false,
            code: 'write_failed',
            message: error instanceof Error ? error.message : String(error)
          }
        }
      }

      const currentRevision = current?.revision ?? null
      if (payload.expectedRevision !== currentRevision) {
        return {
          ok: false,
          code: 'stale_request',
          currentRevision: currentRevision ?? undefined,
          message: 'Design document changed in another window.'
        }
      }

      const nextRevision = current
        ? Math.max(normalized.revision, current.revision + 1)
        : Math.max(0, normalized.revision)
      const savedDocument: DesignDocumentV1 = {
        ...normalized,
        revision: nextRevision,
        updatedAt: Date.now()
      }
      const index: DesignIndexV1 = {
        schema: 'workwise.design.index',
        version: 1,
        activeDocumentId: savedDocument.id,
        activePageByDocument: {
          ...((await readIndex(workspaceRoot).catch(() => null))?.activePageByDocument ?? {}),
          [savedDocument.id]: payload.activePageId
        },
        updatedAt: Date.now()
      }
      await atomicWriteFile(documentPath, `${JSON.stringify(savedDocument, null, 2)}\n`, {
        beforeReplace: () => recheckContainedParent(workspaceRoot, documentPath)
      })
      const indexPath = await resolveContainedPath({
        root: workspaceRoot,
        target: indexRelativePath(),
        mustExist: false,
        expect: 'file',
        rejectFinalLink: true
      })
      await atomicWriteFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, {
        beforeReplace: () => recheckContainedParent(workspaceRoot, indexPath)
      })
      return { ok: true, document: savedDocument, revision: savedDocument.revision }
    })
  } catch (error) {
    return {
      ok: false,
      code: error instanceof UnsafePathError ? 'unsafe_path' : 'write_failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

function extensionForMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    default: return null
  }
}

function signatureMatches(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  }
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/gif') {
    const header = Buffer.from(bytes.subarray(0, 6)).toString('ascii')
    return header === 'GIF87a' || header === 'GIF89a'
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 &&
      Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
      Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  }
  return false
}

export async function readSafeDesignImageSource(sourcePath: string): Promise<Uint8Array> {
  const linkInfo = await lstat(sourcePath)
  if (linkInfo.isSymbolicLink() || !linkInfo.isFile() || linkInfo.size <= 0 || linkInfo.size > MAX_IMAGE_BYTES) {
    throw new Error('Selected image must be a regular file no larger than 12 MiB.')
  }
  const canonical = await realpath(sourcePath)
  const canonicalInfo = await stat(canonical)
  if (!canonicalInfo.isFile() || canonicalInfo.size !== linkInfo.size) {
    throw new Error('Selected image changed while it was being read.')
  }
  return readFile(canonical)
}

export async function storeDesignImageAsset(
  input: DesignImageAssetWriteInput
): Promise<{ asset: DesignAsset; dataUrl: string }> {
  const workspaceRoot = await canonicalizeContainmentRoot(input.workspaceRoot)
  assertDocumentId(input.documentId)
  const extension = extensionForMimeType(input.mimeType)
  if (
    !extension ||
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) ||
    input.width <= 0 ||
    input.height <= 0 ||
    input.width > 32_768 ||
    input.height > 32_768 ||
    input.bytes.byteLength <= 0 ||
    input.bytes.byteLength > MAX_IMAGE_BYTES ||
    !signatureMatches(input.bytes, input.mimeType)
  ) {
    throw new Error('Selected image is invalid or unsupported.')
  }
  const assetId = `asset_${randomUUID().replaceAll('-', '')}`
  if (!SAFE_ASSET_ID.test(assetId)) throw new Error('Could not create Design asset id.')
  const originalStem = input.originalFilename
    .slice(0, -extname(input.originalFilename).length || undefined)
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const filename = `${originalStem || 'image'}-${assetId.slice(-12)}.${extension}`
  const assetPath = await resolveContainedPath({
    root: workspaceRoot,
    target: assetRelativePath(input.documentId, filename),
    mustExist: false,
    expect: 'file',
    rejectFinalLink: true
  })
  await atomicWriteFile(assetPath, input.bytes, {
    beforeReplace: () => recheckContainedParent(workspaceRoot, assetPath)
  })
  const asset: DesignAsset = {
    id: assetId,
    filename,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    byteSize: input.bytes.byteLength
  }
  return {
    asset,
    dataUrl: `data:${asset.mimeType};base64,${Buffer.from(input.bytes).toString('base64')}`
  }
}

export async function readDesignAsset(
  workspaceRootInput: string,
  documentId: string,
  asset: DesignAsset
): Promise<DesignAssetReadResult> {
  try {
    const workspaceRoot = await canonicalizeContainmentRoot(workspaceRootInput)
    if (
      !SAFE_ASSET_ID.test(asset.id) ||
      !SAFE_ASSET_FILENAME.test(asset.filename) ||
      extensionForMimeType(asset.mimeType) === null ||
      !Number.isSafeInteger(asset.byteSize) ||
      asset.byteSize <= 0 ||
      asset.byteSize > MAX_IMAGE_BYTES
    ) {
      throw new Error('Design asset metadata is invalid.')
    }
    const assetPath = await resolveContainedPath({
      root: workspaceRoot,
      target: assetRelativePath(documentId, asset.filename),
      mustExist: true,
      expect: 'file',
      rejectFinalLink: true
    })
    const info = await stat(assetPath)
    if (info.size !== asset.byteSize || info.size > MAX_IMAGE_BYTES) {
      throw new Error('Design asset size does not match its metadata.')
    }
    const bytes = await readFile(assetPath)
    if (!signatureMatches(bytes, asset.mimeType)) throw new Error('Design asset signature is invalid.')
    return {
      ok: true,
      dataUrl: `data:${asset.mimeType};base64,${Buffer.from(bytes).toString('base64')}`
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
