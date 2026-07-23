import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  inspectDesignSvgFidelity,
  readImportedDesignImage
} from './design-import-service'

const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const roots: string[] = []

async function createImportRoot(): Promise<{ root: string; svgDirectory: string }> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-design-import-test-'))
  const svgDirectory = join(root, 'svg')
  await mkdir(svgDirectory)
  roots.push(root)
  return { root, svgDirectory }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Design PPTX image import boundary', () => {
  it('accepts a supported embedded image and preserves its bytes', async () => {
    const { root, svgDirectory } = await createImportRoot()
    const dataUrl = `data:image/png;base64,${PNG_HEADER.toString('base64')}`

    const result = await readImportedDesignImage(dataUrl, svgDirectory, root)

    expect(result.mimeType).toBe('image/png')
    expect(Buffer.from(result.bytes)).toEqual(PNG_HEADER)
  })

  it('accepts a regular image below the import root', async () => {
    const { root, svgDirectory } = await createImportRoot()
    await writeFile(join(svgDirectory, 'picture.png'), PNG_HEADER)

    const result = await readImportedDesignImage('picture.png', svgDirectory, root)

    expect(result.filename).toBe('picture.png')
    expect(result.mimeType).toBe('image/png')
  })

  it.each([
    'https://example.com/image.png',
    'file:///tmp/image.png',
    '/tmp/image.png',
    '../../image.png'
  ])('rejects external or escaping image href %s', async (href) => {
    const { root, svgDirectory } = await createImportRoot()
    await expect(readImportedDesignImage(href, svgDirectory, root)).rejects.toThrow()
  })

  it('rejects a symlink even when its target is inside the import root', async () => {
    const { root, svgDirectory } = await createImportRoot()
    await writeFile(join(svgDirectory, 'target.png'), PNG_HEADER)
    await symlink(join(svgDirectory, 'target.png'), join(svgDirectory, 'linked.png'))

    await expect(
      readImportedDesignImage('linked.png', svgDirectory, root)
    ).rejects.toThrow('safe regular file')
  })

  it('rejects content whose signature does not match its file type', async () => {
    const { root, svgDirectory } = await createImportRoot()
    await writeFile(join(svgDirectory, 'fake.png'), Buffer.from('not an image'))

    await expect(
      readImportedDesignImage('fake.png', svgDirectory, root)
    ).rejects.toThrow('signature')
  })
})

describe('Design PPTX fidelity diagnostics', () => {
  it('reports filters, masks, flattened groups and complex transforms explicitly', () => {
    const warnings = inspectDesignSvgFidelity(
      '<svg><defs><filter id="f"><feBlur /></filter><mask id="m" /></defs>' +
      '<g transform="translate(10 10)"><rect mask="url(#m)" /></g></svg>',
      1
    )

    expect(warnings.map((warning) => warning.code)).toEqual([
      'unsupported_filter',
      'unsupported_mask',
      'flattened_group',
      'layout_approximation'
    ])
    expect(warnings.every((warning) => warning.pageId === 'page-2')).toBe(true)
  })
})
