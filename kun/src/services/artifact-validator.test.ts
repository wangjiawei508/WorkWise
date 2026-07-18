import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { validateArtifactFile } from './artifact-validator.js'

const temporaryRoots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-artifact-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function writeZip(path: string, files: Record<string, string>): Promise<void> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer' }))
}

describe('artifact validator', () => {
  it('rejects plain text renamed to pptx', async () => {
    const root = await tempRoot()
    const path = join(root, 'fake.pptx')
    await writeFile(path, '<html>not a deck</html>')

    await expect(validateArtifactFile(path, 'pptx')).resolves.toMatchObject({
      valid: false,
      format: 'pptx'
    })
  })

  it('validates the PowerPoint package and slide relationships', async () => {
    const root = await tempRoot()
    const path = join(root, 'deck.pptx')
    await writeZip(path, {
      '[Content_Types].xml': '<Types/>',
      '_rels/.rels': '<Relationships><Relationship Target="ppt/presentation.xml"/></Relationships>',
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Target="slides/slide1.xml"/></Relationships>',
      'ppt/slides/slide1.xml': '<p:sld/>',
      'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Target="../media/image1.png"/></Relationships>',
      'ppt/media/image1.png': 'image'
    })

    const result = await validateArtifactFile(path, 'pptx')
    expect(result.valid).toBe(true)
    expect(result.evidence).toContain('1 slide(s) verified')
    expect(result.sha256).toHaveLength(64)
  })

  it('rejects missing OOXML media relationships', async () => {
    const root = await tempRoot()
    const path = join(root, 'broken.pptx')
    await writeZip(path, {
      '[Content_Types].xml': '<Types/>',
      '_rels/.rels': '<Relationships><Relationship Target="ppt/presentation.xml"/></Relationships>',
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Target="slides/slide1.xml"/></Relationships>',
      'ppt/slides/slide1.xml': '<p:sld/>',
      'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Target="../media/missing.png"/></Relationships>'
    })

    await expect(validateArtifactFile(path, 'pptx')).resolves.toMatchObject({
      valid: false,
      message: expect.stringContaining('Broken or unsafe OOXML relationship')
    })
  })

  it('checks PDF structure instead of trusting the extension', async () => {
    const root = await tempRoot()
    const validPath = join(root, 'valid.pdf')
    const invalidPath = join(root, 'invalid.pdf')
    await writeFile(validPath, '%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n')
    await writeFile(invalidPath, 'not a PDF')

    await expect(validateArtifactFile(validPath, 'pdf')).resolves.toMatchObject({ valid: true })
    await expect(validateArtifactFile(invalidPath, 'pdf')).resolves.toMatchObject({ valid: false })
  })
})
