import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { _internals } from './design-export-runner.js'

const temporaryRoots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-design-runner-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function minimalPowerPoint(input?: { externalImage?: boolean }): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file(
    '_rels/.rels',
    '<Relationships><Relationship Id="rId1" Type="officeDocument" Target="ppt/presentation.xml"/></Relationships>'
  )
  zip.file(
    'ppt/presentation.xml',
    '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>'
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'
  )
  zip.file(
    'ppt/slides/slide1.xml',
    input?.externalImage
      ? '<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><a:blip r:link="rIdImage"/></p:sld>'
      : '<p:sld xmlns:p="p"/>'
  )
  if (input?.externalImage) {
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/image.png" TargetMode="External"/></Relationships>'
    )
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('design export SVG security', () => {
  it('derives one PPT Master 4.0 flat contract from the SVG canvas', () => {
    const canvas = _internals.resolveSvgCanvas([
      {
        path: '/workspace/slide.svg',
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"/>'
      }
    ])
    expect(canvas).toMatchObject({ viewBox: '0 0 1280 720', format: 'ppt169' })
    expect(_internals.createFlatPptMasterSpecLock(canvas))
      .toContain('## pptx_structure\n- mode: flat')
  })

  it('rejects mixed SVG canvases before PPT Master export', () => {
    expect(() => _internals.resolveSvgCanvas([
      {
        path: '/workspace/slide-1.svg',
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"/>'
      },
      {
        path: '/workspace/slide-2.svg',
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720"/>'
      }
    ])).toThrow(/same canvas/)
  })

  it('rejects external SVG image references', async () => {
    const root = await tempRoot()
    const source = join(root, 'slide.svg')
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/photo.png"/></svg>'
    )

    await expect(_internals.collectSvgSources(source, join(root, 'deck.pptx'), root))
      .rejects.toThrow(/external resource reference/)
  })

  it('rejects SVG image references that escape the workspace', async () => {
    const root = await tempRoot()
    const workspace = join(root, 'workspace')
    const source = join(workspace, 'slides', 'slide.svg')
    await writeFile(join(root, 'outside.png'), 'outside')
    await mkdir(join(workspace, 'slides'), { recursive: true })
    await writeFile(
      source,
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="../../outside.png"/></svg>'
    )

    await expect(_internals.collectSvgSources(source, join(workspace, 'deck.pptx'), workspace))
      .rejects.toThrow(/escapes the workspace root/)
  })

  it.runIf(process.platform !== 'win32')('rejects symbolic-link SVG sources', async () => {
    const root = await tempRoot()
    const realSource = join(root, 'real.svg')
    const linkedSource = join(root, 'linked.svg')
    await writeFile(realSource, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await symlink(realSource, linkedSource)

    await expect(_internals.collectSvgSources(linkedSource, join(root, 'deck.pptx'), root))
      .rejects.toThrow(/regular file or directory/)
  })
})

describe('design export PowerPoint commit', () => {
  it('preserves the previous target when a fake ZIP is rejected', async () => {
    const root = await tempRoot()
    const candidate = join(root, 'candidate.pptx')
    const target = join(root, 'deck.pptx')
    await writeFile(candidate, Buffer.concat([Buffer.from('PK'), Buffer.alloc(256, 0x41)]))
    await writeFile(target, 'previous deck')

    await expect(_internals.validateAndCommitPowerPoint(candidate, target, 1))
      .rejects.toThrow(/Invalid OOXML archive/)
    await expect(readFile(target, 'utf8')).resolves.toBe('previous deck')
  })

  it('rejects an external PowerPoint image relationship without replacing the target', async () => {
    const root = await tempRoot()
    const candidate = join(root, 'candidate.pptx')
    const target = join(root, 'deck.pptx')
    await writeFile(candidate, await minimalPowerPoint({ externalImage: true }))
    await writeFile(target, 'previous deck')

    await expect(_internals.validateAndCommitPowerPoint(candidate, target, 1))
      .rejects.toThrow(/external media relationship/)
    await expect(readFile(target, 'utf8')).resolves.toBe('previous deck')
  })
})
