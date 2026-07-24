import { describe, expect, it } from 'vitest'
import type { DesignElement } from '@shared/design-document'
import type { DesignCanvasCommandV1 } from '@shared/design-workspace'
import { selectActiveCanvasCommandForLatestRequest } from './design-command-consumer'

function command(
  idempotencyKey: string,
  documentId: string,
  pageId = 'page-active'
): DesignCanvasCommandV1 {
  const element: DesignElement = {
    id: `element-${idempotencyKey}`,
    type: 'rect',
    name: 'Shape',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    rotation: 0,
    zIndex: 0
  }
  return {
    schema: 'workwise.design.command',
    version: 1,
    idempotencyKey,
    workspaceRoot: '/workspace',
    documentId,
    pageId,
    expectedRevision: 0,
    operations: [{ kind: 'add', element }]
  }
}

describe('Design canvas command consumer', () => {
  const target = {
    workspaceRoot: '/workspace',
    documentId: 'document-active',
    pageId: 'page-active'
  }

  it('selects the first command scoped to the visible Design document', () => {
    const result = selectActiveCanvasCommandForLatestRequest([
      command('other', 'document-other'),
      command('active', 'document-active')
    ], target)
    expect(result.command?.idempotencyKey).toBe('active')
    expect(result.ignoredCommandIds).toEqual(['other'])
  })

  it('keeps one atomic command per user request and ignores model retries', () => {
    const result = selectActiveCanvasCommandForLatestRequest([
      command('first', 'document-active'),
      command('retry', 'document-active')
    ], target)
    expect(result.command?.idempotencyKey).toBe('first')
    expect(result.ignoredCommandIds).toEqual(['retry'])
  })

  it('ignores a request with no command for the visible canvas', () => {
    const result = selectActiveCanvasCommandForLatestRequest([
      command('other', 'document-other')
    ], target)
    expect(result.command).toBeNull()
    expect(result.ignoredCommandIds).toEqual(['other'])
  })
})
