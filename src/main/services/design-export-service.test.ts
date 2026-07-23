import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createDesignDocument, createDesignElement, createDesignPage } from '../../shared/design-document'
import {
  createFlatPptMasterSpecLock,
  validateAndCommitPowerPoint,
  validateDesignExportAssets,
  validatePowerPointCanvasSize
} from './design-export-service'

async function powerPointBytes(input?: {
  slideCount?: number
  imageTarget?: string
}): Promise<Buffer> {
  const slideCount = input?.slideCount ?? 1
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file(
    '_rels/.rels',
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  )
  const slideIds = Array.from({ length: slideCount }, (_, index) =>
    `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`
  ).join('')
  zip.file(
    'ppt/presentation.xml',
    `<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<Relationships>${Array.from({ length: slideCount }, (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
    ).join('')}</Relationships>`
  )
  for (let index = 0; index < slideCount; index += 1) {
    const slideNumber = index + 1
    zip.file(
      `ppt/slides/slide${slideNumber}.xml`,
      input?.imageTarget
        ? '<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><a:blip r:embed="rIdImage"/></p:sld>'
        : '<p:sld xmlns:p="p"/>'
    )
    if (input?.imageTarget) {
      zip.file(
        `ppt/slides/_rels/slide${slideNumber}.xml.rels`,
        `<Relationships><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${input.imageTarget}"/></Relationships>`
      )
    }
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('PPT Master 4.0 export contract', () => {
  it('creates an explicit flat release lock', () => {
    const lock = createFlatPptMasterSpecLock({
      width: 1280,
      height: 720,
      format: 'ppt169'
    })
    expect(lock).toContain('<!-- ppt-master-schema: spec-lock/v1 -->')
    expect(lock).toContain('- viewBox: 0 0 1280 720')
    expect(lock).toContain('- font_family: Arial')
    expect(lock).toContain('## pptx_structure\n- mode: flat')
  })
})

describe('validatePowerPointCanvasSize', () => {
  it('accepts a normal same-size slide deck', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages.push(createDesignPage({ format: 'ppt169' }))
    expect(validatePowerPointCanvasSize(document)).toBeNull()
  })

  it('rejects a canvas outside the PPT Master contract', () => {
    const document = createDesignDocument({
      format: 'custom',
      customSize: { width: 5_377, height: 720 }
    })
    expect(validatePowerPointCanvasSize(document)).toContain('96 and 5376')
  })

  it('rejects mixed slide sizes because a PPTX has one page size', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages.push(createDesignPage({ format: 'social-square' }))
    expect(validatePowerPointCanvasSize(document)).toContain('same canvas size')
  })
})

describe('validateDesignExportAssets', () => {
  it('rejects a visible image whose durable asset bytes are unavailable', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages[0].elements.push(createDesignElement('image', {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      imageAssetId: 'asset_missing',
      zIndex: 0
    }))
    expect(validateDesignExportAssets(document, {})).toContain('missing or invalid')
  })

  it('accepts a validated embedded image for PPTX serialization', () => {
    const document = createDesignDocument({ format: 'ppt169' })
    document.pages[0].elements.push(createDesignElement('image', {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      imageAssetId: 'asset_ok',
      zIndex: 0
    }))
    expect(validateDesignExportAssets(document, {
      asset_ok: 'data:image/png;base64,iVBORw0KGgo='
    })).toBeNull()
  })
})

describe('validateAndCommitPowerPoint', () => {
  it('rejects a fake PK file and preserves the previous target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-design-export-test-'))
    try {
      const candidate = join(root, 'candidate.pptx')
      const target = join(root, 'deck.pptx')
      const previous = Buffer.from('previous verified presentation')
      await writeFile(candidate, Buffer.concat([Buffer.from('PK'), Buffer.alloc(256, 0x41)]))
      await writeFile(target, previous)

      await expect(validateAndCommitPowerPoint(candidate, target, 1))
        .rejects.toThrow(/Invalid PowerPoint OOXML archive/)
      await expect(readFile(target)).resolves.toEqual(previous)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects broken slide media and preserves the previous target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-design-export-test-'))
    try {
      const candidate = join(root, 'candidate.pptx')
      const target = join(root, 'deck.pptx')
      await writeFile(candidate, await powerPointBytes({ imageTarget: '../media/missing.png' }))
      await writeFile(target, 'previous deck')

      await expect(validateAndCommitPowerPoint(candidate, target, 1))
        .rejects.toThrow(/Broken OOXML relationship/)
      await expect(readFile(target, 'utf8')).resolves.toBe('previous deck')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('atomically commits a valid package with the expected slide count', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-design-export-test-'))
    try {
      const candidate = join(root, 'candidate.pptx')
      const target = join(root, 'deck.pptx')
      const next = await powerPointBytes({ slideCount: 2 })
      await writeFile(candidate, next)
      await writeFile(target, 'previous deck')

      await expect(validateAndCommitPowerPoint(candidate, target, 2)).resolves.toBeUndefined()
      await expect(readFile(target)).resolves.toEqual(next)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
