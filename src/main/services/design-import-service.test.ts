import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import {
  inspectDesignSvgFidelity,
  PPTX_IMPORT_LIMITS,
  preflightPptxForDesignImport,
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

async function writePptx(
  root: string,
  configure?: (zip: JSZip) => void,
  compression: 'STORE' | 'DEFLATE' = 'DEFLATE'
): Promise<string> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types />')
  zip.file('ppt/presentation.xml', '<p:presentation />')
  zip.file('ppt/slides/slide1.xml', '<p:sld />')
  configure?.(zip)
  const path = join(root, 'source.pptx')
  await writeFile(path, await zip.generateAsync({ type: 'nodebuffer', compression }))
  return path
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Design PPTX ZIP preflight', () => {
  it('accepts a bounded PowerPoint archive at the minimum required structure', async () => {
    const { root } = await createImportRoot()
    const path = await writePptx(root)

    await expect(preflightPptxForDesignImport(path)).resolves.toMatchObject({
      slideCount: 1
    })
  })

  it('rejects a source one byte above the 200 MiB hard limit before reading ZIP data', async () => {
    const { root } = await createImportRoot()
    const path = join(root, 'oversized.pptx')
    await writeFile(path, Buffer.alloc(0))
    await truncate(path, PPTX_IMPORT_LIMITS.sourceBytes + 1)

    await expect(preflightPptxForDesignImport(path)).rejects.toThrow('200 MiB')
  })

  it('rejects an OOXML part one byte above the per-XML limit', async () => {
    const { root } = await createImportRoot()
    const path = await writePptx(
      root,
      (zip) => {
        zip.file(
          'ppt/notesSlides/notesSlide1.xml',
          Buffer.alloc(PPTX_IMPORT_LIMITS.xmlBytes + 1, 0x20)
        )
      },
      'STORE'
    )

    await expect(preflightPptxForDesignImport(path)).rejects.toThrow('16 MiB XML')
  })

  it('rejects a highly compressed entry before Python or the sidecar is called', async () => {
    const { root } = await createImportRoot()
    const path = await writePptx(root, (zip) => {
      zip.file('ppt/media/bomb.bin', Buffer.alloc(2 * 1024 * 1024, 0x41))
    })

    await expect(preflightPptxForDesignImport(path)).rejects.toThrow('compression ratio')
  })

  it('accepts the slide-count boundary and rejects one page above it', async () => {
    const { root } = await createImportRoot()
    const boundary = await writePptx(root, (zip) => {
      for (let slide = 2; slide <= PPTX_IMPORT_LIMITS.slides; slide += 1) {
        zip.file(`ppt/slides/slide${slide}.xml`, '<p:sld />')
      }
    })
    await expect(preflightPptxForDesignImport(boundary)).resolves.toMatchObject({
      slideCount: PPTX_IMPORT_LIMITS.slides
    })

    const aboveRoot = await mkdtemp(join(tmpdir(), 'workwise-design-import-test-'))
    roots.push(aboveRoot)
    const above = await writePptx(aboveRoot, (zip) => {
      for (let slide = 2; slide <= PPTX_IMPORT_LIMITS.slides + 1; slide += 1) {
        zip.file(`ppt/slides/slide${slide}.xml`, '<p:sld />')
      }
    })
    await expect(preflightPptxForDesignImport(above)).rejects.toThrow('500 slides')
  })

  it('rejects an archive with more than 4096 central-directory entries', async () => {
    const { root } = await createImportRoot()
    const path = await writePptx(root, (zip) => {
      for (let index = 0; index < PPTX_IMPORT_LIMITS.entries; index += 1) {
        zip.file(`ppt/customXml/item-${index}.bin`, Buffer.from([index & 0xff]))
      }
    })

    await expect(preflightPptxForDesignImport(path)).rejects.toThrow('4096 entries')
  })

  it('rejects case-insensitive duplicate ZIP entry paths', async () => {
    const { root } = await createImportRoot()
    const path = await writePptx(root, (zip) => {
      zip.file('PPT/SLIDES/SLIDE1.XML', '<duplicate />')
    })

    await expect(preflightPptxForDesignImport(path)).rejects.toThrow('duplicate entry paths')
  })
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
