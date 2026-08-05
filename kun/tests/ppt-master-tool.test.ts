import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
      bytes: expect.any(Number)
    })
    const specLock = await readFile(join(projectDir, 'spec_lock.md'), 'utf8')
    expect(specLock).toContain('ppt-master-schema: spec-lock/v1')
    expect(specLock).toContain('viewBox: 0 0 1280 720')
    expect(specLock).toContain('format: ppt169')
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
