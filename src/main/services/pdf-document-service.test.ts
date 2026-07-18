import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzePdfDocument, normalizePdfError } from './pdf-document-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PDF document safety', () => {
  it('returns a stable password-required error without retrying', () => {
    const error = Object.assign(new Error('password details'), { name: 'PasswordException' })
    expect(normalizePdfError(error)).toMatchObject({ code: 'password_required' })
  })

  it('rejects damaged PDFs with an explicit document error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-damaged-pdf-'))
    roots.push(root)
    const path = join(root, 'damaged.pdf')
    await writeFile(path, '%PDF-1.7\nnot-a-valid-document')
    await expect(analyzePdfDocument(path)).rejects.toMatchObject({ code: 'invalid_document' })
  })

  it('honors cancellation before reading the file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-cancelled-pdf-'))
    roots.push(root)
    const path = join(root, 'document.pdf')
    await writeFile(path, '%PDF-1.7\n%%EOF')
    const controller = new AbortController()
    controller.abort()
    await expect(analyzePdfDocument(path, controller.signal)).rejects.toMatchObject({
      code: 'document_parse_cancelled'
    })
  })
})
