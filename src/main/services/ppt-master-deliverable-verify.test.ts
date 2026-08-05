import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { verifyPptMasterDeliverable } from './ppt-master-deliverable-verify'

function makePptx(slideCount: number, notesCount: number): Promise<Buffer> {
  const zip = new JSZip()
  for (let index = 1; index <= slideCount; index += 1) {
    zip.file(`ppt/slides/slide${index}.xml`, '<p:sld xmlns:p="x"/>')
  }
  for (let index = 1; index <= notesCount; index += 1) {
    zip.file(`ppt/notesSlides/notesSlide${index}.xml`, '<p:notes xmlns:p="x"/>')
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('verifyPptMasterDeliverable', () => {
  let workspace: string
  let projectDir: string

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'ww-verify-'))
    projectDir = join(workspace, 'projects', 'deck')
    await mkdir(join(projectDir, 'svg_output'), { recursive: true })
    await mkdir(join(projectDir, 'notes'), { recursive: true })
    await mkdir(join(projectDir, 'confirm_ui'), { recursive: true })
    await writeFile(join(projectDir, 'design_spec.md'), '# design spec', 'utf8')
    await writeFile(join(projectDir, 'spec_lock.md'), '# spec lock', 'utf8')
    await writeFile(
      join(projectDir, 'confirm_ui', 'result.json'),
      JSON.stringify({ proactive_speaker_notes: true }),
      'utf8'
    )
    await writeFile(join(projectDir, 'svg_output', 'slide_01.svg'), '<svg/>', 'utf8')
    await writeFile(join(projectDir, 'svg_output', 'slide_02.svg'), '<svg/>', 'utf8')
    await writeFile(join(projectDir, 'notes', 'slide_01.md'), '# note with enough content for verification', 'utf8')
    await writeFile(join(projectDir, 'notes', 'slide_02.md'), '# note with enough content for verification', 'utf8')
  })

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true })
  })

  it('passes a complete delivery with matching slides and notes', async () => {
    await writeFile(join(projectDir, 'deck.pptx'), await makePptx(2, 2))
    const result = await verifyPptMasterDeliverable({ workspaceRoot: workspace, projectDir })
    expect(result.ok).toBe(true)
    expect(result.slideCount).toBe(2)
    expect(result.notesCount).toBe(2)
    expect(result.file?.path).toContain('deck.pptx')
    expect(result.issues).toEqual([])
  })

  it('finds deliverables inside the exports subdirectory (PPT Master convention)', async () => {
    await mkdir(join(projectDir, 'exports'), { recursive: true })
    await writeFile(join(projectDir, 'exports', 'deck_v5.pptx'), await makePptx(2, 2))
    const result = await verifyPptMasterDeliverable({ workspaceRoot: workspace, projectDir })
    expect(result.ok).toBe(true)
    expect(result.file?.path).toContain('exports')
    expect(result.slideCount).toBe(2)
    expect(result.notesCount).toBe(2)
    expect(result.issues).toEqual([])
  })

  it('reports missing notes and missing pptx as issues', async () => {
    await rm(join(projectDir, 'notes', 'slide_02.md'))
    const result = await verifyPptMasterDeliverable({ workspaceRoot: workspace, projectDir })
    expect(result.ok).toBe(false)
    expect(result.issues.join(' ')).toContain('缺少演讲备注')
    expect(result.issues.join(' ')).toContain('没有 .pptx')
  })

  it('rejects project dirs that escape the workspace', async () => {
    await expect(
      verifyPptMasterDeliverable({ workspaceRoot: workspace, projectDir: '/tmp' })
    ).rejects.toThrow('escapes')
  })
})
