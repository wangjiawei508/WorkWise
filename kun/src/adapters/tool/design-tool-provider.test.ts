import { describe, expect, it } from 'vitest'
import type { ToolHostContext } from '../../ports/tool-host.js'
import { CapabilityRegistry } from './capability-registry.js'
import { buildDesignToolProviders } from './design-tool-provider.js'

function context(withDesign = true): ToolHostContext {
  return {
    threadId: 'thread',
    turnId: 'turn',
    workspace: '/tmp/workwise-design',
    threadMode: 'agent',
    approvalPolicy: 'auto',
    sandboxMode: 'workspace-write',
    ...(withDesign
      ? {
          guiDesign: {
            workspaceRoot: '/tmp/workwise-design',
            documentId: 'design_1',
            pageId: 'page_1',
            expectedRevision: 7
          }
        }
      : {}),
    abortSignal: new AbortController().signal,
    awaitApproval: async () => 'allow'
  }
}

describe('Design canvas tool provider', () => {
  it('advertises the safe canvas command bridge for an explicit Design turn', () => {
    const registry = new CapabilityRegistry(buildDesignToolProviders().providers)
    expect(registry.listTools(context()).map((tool) => tool.name)).toContain(
      'design_apply_canvas_commands'
    )
  })

  it('does not advertise the canvas command bridge to an ordinary agent turn', () => {
    const registry = new CapabilityRegistry(buildDesignToolProviders().providers)
    expect(registry.listTools(context(false)).map((tool) => tool.name)).not.toContain(
      'design_apply_canvas_commands'
    )
  })

  it('returns a renderer-scoped command instead of writing a disconnected SVG file', async () => {
    const registry = new CapabilityRegistry(buildDesignToolProviders().providers)
    const { tool } = registry.resolveTool('design_apply_canvas_commands', context(), 'design')
    const result = await tool.execute(
      {
        document_id: 'design_1',
        page_id: 'page_1',
        expected_revision: 7,
        idempotency_key: 'turn-1-command-1',
        operations: [
          {
            kind: 'add',
            element: {
              type: 'text',
              x: 120,
              y: 80,
              w: 480,
              h: 90,
              text: '阶段 E',
              font_size: 42,
              fill: '1E3A5F'
            }
          }
        ]
      },
      context()
    )

    expect(result.isError).not.toBe(true)
    expect(result.output).toMatchObject({
      ok: true,
      status: 'pending_canvas_apply',
      message: expect.stringContaining('Queued 1 Design canvas operation'),
      designCanvasCommand: {
        schema: 'workwise.design.command',
        version: 1,
        workspaceRoot: '/tmp/workwise-design',
        documentId: 'design_1',
        pageId: 'page_1',
        expectedRevision: 7,
        operations: [
          {
            kind: 'add',
            element: {
              type: 'text',
              x: 120,
              y: 80,
              w: 480,
              h: 90,
              text: '阶段 E',
              fontSize: 42,
              fill: '1E3A5F'
            }
          }
        ]
      }
    })
  })

  it('rejects canvas arguments that no longer match the granted Design context', async () => {
    const registry = new CapabilityRegistry(buildDesignToolProviders().providers)
    const { tool } = registry.resolveTool('design_apply_canvas_commands', context(), 'design')
    const result = await tool.execute(
      {
        document_id: 'other_design',
        page_id: 'page_1',
        expected_revision: 7,
        idempotency_key: 'turn-1-command-stale',
        operations: [{ kind: 'remove', element_ids: ['element_1'] }]
      },
      context()
    )
    expect(result).toMatchObject({
      isError: true,
      output: {
        error: expect.stringContaining('stale_request')
      }
    })
  })

  it('rejects unsafe element input before the renderer sees it', async () => {
    const registry = new CapabilityRegistry(buildDesignToolProviders().providers)
    const { tool } = registry.resolveTool('design_apply_canvas_commands', context(), 'design')
    const result = await tool.execute(
      {
        document_id: 'design_1',
        page_id: 'page_1',
        expected_revision: 7,
        idempotency_key: 'turn-1-command-2',
        operations: [
          {
            kind: 'add',
            element: {
              type: 'image',
              x: 0,
              y: 0,
              w: 100,
              h: 100
            }
          }
        ]
      },
      context()
    )
    expect(result).toMatchObject({
      isError: true,
      output: {
        error: expect.stringContaining('add.element.type')
      }
    })
  })
})
