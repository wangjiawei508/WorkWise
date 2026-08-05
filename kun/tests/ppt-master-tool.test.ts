import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { LocalToolHost } from '../src/adapters/tool/local-tool-host.js'
import { createPptMasterLocalTool } from '../src/adapters/tool/builtin-ppt-tool.js'
import type { ToolHostContext } from '../src/ports/tool-host.js'

const SLIDE_SVG = (index: number): string => `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <rect x="0" y="0" width="1280" height="720" fill="#FFFFFF"/>
  <text x="80" y="120" font-size="48" fill="#111827">Slide ${index}</text>
</svg>`

function buildContext(workspace: string): ToolHostContext {
  return {
    threadId: 'thr_ppt',
    turnId: 'turn_ppt',
    workspace,
    approvalPolicy: 'on-request',
    abortSignal: new AbortController().signal,
    awaitApproval: async () => 'allow'
  }
}

describe('ppt_master built-in tool', () => {
  let workspace: string

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'kun-ppt-tool-'))
  })

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true })
  })

  it('writes spec_lock.md and converts svg_output slides through the sidecar', async () => {
    const projectDir = join(workspace, 'deck')
    const svgDir = join(projectDir, 'svg_output')
    await mkdir(svgDir, { recursive: true })
    await writeFile(join(svgDir, 'slide_01.svg'), SLIDE_SVG(1), 'utf8')
    await writeFile(join(svgDir, 'slide_02.svg'), SLIDE_SVG(2), 'utf8')
    await mkdir(join(projectDir, 'notes'), { recursive: true })
    await writeFile(join(projectDir, 'notes', 'slide_01.md'), '# note 1', 'utf8')
    await writeFile(join(projectDir, 'notes', 'slide_02.md'), '# note 2', 'utf8')
    await writeFile(join(projectDir, 'design_spec.md'), '# design spec', 'utf8')
    await writeFile(join(projectDir, 'spec_lock.md'), '# spec lock', 'utf8')
    const outputPath = join(workspace, 'deck.pptx')

    const tool = createPptMasterLocalTool({
      operations: {
        spawnSidecar: async ({ request, workspaceRoot }) => {
          expect(request.operation).toBe('ppt-master-export-pptx')
          expect(workspaceRoot).toBe(projectDir)
          await writeFile(outputPath, 'PK\x03\x04fake-pptx', 'utf8')
          return { ok: true, outputPath }
        }
      }
    })
    const host = new LocalToolHost({ tools: [tool] })
    const result = await host.execute(
      { callId: 'call_ppt', toolName: 'ppt_master', arguments: { projectDir, outputPath } },
      buildContext(workspace)
    )

    expect(result.item.kind).toBe('tool_result')
    if (result.item.kind !== 'tool_result') throw new Error('expected tool_result')
    expect(result.item.isError).not.toBe(true)
    expect(result.item.output).toMatchObject({
      outputPath,
      slideCount: 2,
      notesCount: 0,
      bytes: expect.any(Number)
    })
    const specLock = await readFile(join(projectDir, 'spec_lock.md'), 'utf8')
    expect(specLock).toContain('# spec lock')
  })

  it('reports the number of embedded speaker note slides', async () => {
    const projectDir = join(workspace, 'deck-notes')
    const svgDir = join(projectDir, 'svg_output')
    await mkdir(svgDir, { recursive: true })
    await writeFile(join(svgDir, 'slide_01.svg'), SLIDE_SVG(1), 'utf8')
    await writeFile(join(svgDir, 'slide_02.svg'), SLIDE_SVG(2), 'utf8')
    await mkdir(join(projectDir, 'notes'), { recursive: true })
    await writeFile(join(projectDir, 'notes', 'slide_01.md'), '# note 1', 'utf8')
    await writeFile(join(projectDir, 'notes', 'slide_02.md'), '# note 2', 'utf8')
    await writeFile(join(projectDir, 'design_spec.md'), '# design spec', 'utf8')
    await writeFile(join(projectDir, 'spec_lock.md'), '# spec lock', 'utf8')
    await mkdir(join(projectDir, 'confirm_ui'), { recursive: true })
    await writeFile(
      join(projectDir, 'confirm_ui', 'result.json'),
      JSON.stringify({ proactive_speaker_notes: true }),
      'utf8'
    )
    const outputPath = join(workspace, 'deck-notes.pptx')

    const zip = new JSZip()
    zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="x"/>')
    zip.file('ppt/slides/slide2.xml', '<p:sld xmlns:p="x"/>')
    zip.file('ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="x"/>')
    zip.file('ppt/notesSlides/notesSlide2.xml', '<p:notes xmlns:p="x"/>')
    const bytes = await zip.generateAsync({ type: 'nodebuffer' })

    const tool = createPptMasterLocalTool({
      operations: {
        spawnSidecar: async ({ request }) => {
          expect(request.operation).toBe('ppt-master-export-pptx')
          await writeFile(outputPath, bytes)
          return { ok: true, outputPath }
        }
      }
    })
    const host = new LocalToolHost({ tools: [tool] })
    const result = await host.execute(
      { callId: 'call_ppt_notes', toolName: 'ppt_master', arguments: { projectDir, outputPath } },
      buildContext(workspace)
    )
    expect(result.item.kind).toBe('tool_result')
    if (result.item.kind !== 'tool_result') throw new Error('expected tool_result')
    expect(result.item.output).toMatchObject({
      slideCount: 2,
      notesCount: 2
    })
  })

  it('rejects export when the production gates are incomplete (missing notes)', async () => {
    const projectDir = join(workspace, 'deck-no-notes')
    const svgDir = join(projectDir, 'svg_output')
    await mkdir(svgDir, { recursive: true })
    await writeFile(join(svgDir, 'slide_01.svg'), SLIDE_SVG(1), 'utf8')
    await writeFile(join(projectDir, 'design_spec.md'), '# design spec', 'utf8')
    await writeFile(join(projectDir, 'spec_lock.md'), '# spec lock', 'utf8')
    const outputPath = join(workspace, 'deck-no-notes.pptx')
    const tool = createPptMasterLocalTool({
      operations: {
        spawnSidecar: async ({ request }) => {
          expect(request.operation).toBe('ppt-master-export-pptx')
          await writeFile(outputPath, 'PK\x03\x04fake-pptx')
          return { ok: true, outputPath }
        }
      }
    })
    const host = new LocalToolHost({ tools: [tool] })
    const result = await host.execute(
      { callId: 'call_ppt_no_notes', toolName: 'ppt_master', arguments: { projectDir, outputPath } },
      buildContext(workspace)
    )
    expect(result.item.kind).toBe('tool_result')
    if (result.item.kind !== 'tool_result') throw new Error('expected tool_result')
    expect(result.item.isError).toBe(true)
    expect(result.item.output).toMatchObject({
      code: 'tool_execution_failed',
      error: expect.stringContaining('missing speaker notes')
    })
  })

  it('refuses to overwrite an existing output file so each delivery is fresh', async () => {
    const projectDir = join(workspace, 'deck-overwrite')
    const svgDir = join(projectDir, 'svg_output')
    await mkdir(svgDir, { recursive: true })
    await writeFile(join(svgDir, 'slide_01.svg'), SLIDE_SVG(1), 'utf8')
    await mkdir(join(projectDir, 'notes'), { recursive: true })
    await writeFile(join(projectDir, 'notes', 'slide_01.md'), '# note', 'utf8')
    await writeFile(join(projectDir, 'design_spec.md'), '# design spec', 'utf8')
    await writeFile(join(projectDir, 'spec_lock.md'), '# spec lock', 'utf8')
    const outputPath = join(workspace, 'existing.pptx')
    await writeFile(outputPath, 'old content')

    const tool = createPptMasterLocalTool()
    const host = new LocalToolHost({ tools: [tool] })
    const result = await host.execute(
      { callId: 'call_ppt_overwrite', toolName: 'ppt_master', arguments: { projectDir, outputPath } },
      buildContext(workspace)
    )
    expect(result.item.kind).toBe('tool_result')
    if (result.item.kind !== 'tool_result') throw new Error('expected tool_result')
    expect(result.item.isError).toBe(true)
    expect(result.item.output).toMatchObject({
      code: 'tool_execution_failed',
      error: expect.stringContaining('output_file_exists')
    })
  })

  it('rejects output paths that escape the workspace', async () => {
    const projectDir = join(workspace, 'deck')
    const svgDir = join(projectDir, 'svg_output')
    await mkdir(svgDir, { recursive: true })
    await writeFile(join(svgDir, 'slide_01.svg'), SLIDE_SVG(1), 'utf8')
    const tool = createPptMasterLocalTool()
    const host = new LocalToolHost({ tools: [tool] })
    const result = await host.execute(
      {
        callId: 'call_ppt_escape',
        toolName: 'ppt_master',
        arguments: { projectDir, outputPath: join(tmpdir(), 'outside.pptx') }
      },
      buildContext(workspace)
    )
    expect(result.item.kind).toBe('tool_result')
    if (result.item.kind !== 'tool_result') throw new Error('expected tool_result')
    expect(result.item.isError).toBe(true)
  })
})
