import { beforeEach, describe, expect, it } from 'vitest'
import { createDesignElement } from '@shared/design-document'
import type { DesignCanvasCommandV1 } from '@shared/design-workspace'
import { useDesignWorkspaceStore } from './design-workspace-store'

function resetStore(): void {
  useDesignWorkspaceStore.getState().closeDocument()
  useDesignWorkspaceStore.getState().createNewDocument({ name: 'Canvas' })
}

function elements() {
  return useDesignWorkspaceStore.getState().getActivePage()?.elements ?? []
}

describe('Design structural groups', () => {
  beforeEach(resetStore)

  it('groups elements, derives bounds, and moves descendants with one undo step', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 10, y: 20, w: 30, h: 40 }))
    store.addElement(createDesignElement('ellipse', { x: 80, y: 90, w: 20, h: 10 }))
    const childIds = elements().map((element) => element.id)
    store.selectElement(childIds[0])
    store.addToSelection(childIds[1])
    store.groupSelectedElements()

    const group = elements().find((element) => element.type === 'group')
    expect(group).toMatchObject({ x: 10, y: 20, w: 90, h: 80, childIds })
    if (!group) return
    const undoCount = useDesignWorkspaceStore.getState().history.undoStack.length
    store.updateElement(group.id, { x: 30, y: 50 })
    expect(elements().find((element) => element.id === childIds[0])).toMatchObject({ x: 30, y: 50 })
    expect(elements().find((element) => element.id === childIds[1])).toMatchObject({ x: 100, y: 120 })
    expect(useDesignWorkspaceStore.getState().history.undoStack.length).toBe(undoCount + 1)
  })

  it('duplicates and deletes a group without retaining cross-copy child references', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 10, y: 10 }))
    store.addElement(createDesignElement('ellipse', { x: 40, y: 40 }))
    const childIds = elements().map((element) => element.id)
    store.selectElement(childIds[0])
    store.addToSelection(childIds[1])
    store.groupSelectedElements()
    const sourceGroup = elements().find((element) => element.type === 'group')!
    store.duplicateSelectedElements()
    const groups = elements().filter((element) => element.type === 'group')
    expect(groups).toHaveLength(2)
    expect(groups[1].childIds).not.toEqual(sourceGroup.childIds)
    expect(groups[1].childIds?.every((id) => elements().some((element) => element.id === id))).toBe(true)

    store.removeSelectedElements()
    expect(elements()).toHaveLength(3)
    expect(elements().find((element) => element.id === sourceGroup.id)).toBeTruthy()
  })

  it('rotates descendants around the group center instead of only changing their angles', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect', { x: 0, y: 0, w: 20, h: 20 }))
    store.addElement(createDesignElement('rect', { x: 80, y: 0, w: 20, h: 20 }))
    const childIds = elements().map((element) => element.id)
    store.selectElement(childIds[0])
    store.addToSelection(childIds[1])
    store.groupSelectedElements()
    const group = elements().find((element) => element.type === 'group')!

    store.updateElement(group.id, { rotation: 90 })

    expect(elements().find((element) => element.id === childIds[0])).toMatchObject({
      x: 40,
      y: -40,
      rotation: 90
    })
    expect(elements().find((element) => element.id === childIds[1])).toMatchObject({
      x: 40,
      y: 40,
      rotation: 90
    })
  })

  it('rewrites group child ids when a page is duplicated', () => {
    const store = useDesignWorkspaceStore.getState()
    store.addElement(createDesignElement('rect'))
    store.addElement(createDesignElement('ellipse'))
    const ids = elements().map((element) => element.id)
    store.selectElement(ids[0])
    store.addToSelection(ids[1])
    store.groupSelectedElements()
    const sourcePage = store.getActivePage()!
    store.duplicatePage(sourcePage.id)
    const duplicate = useDesignWorkspaceStore.getState().getActivePage()!
    const duplicateGroup = duplicate.elements.find((element) => element.type === 'group')!
    expect(duplicateGroup.childIds?.every((id) => duplicate.elements.some((element) => element.id === id))).toBe(true)
    expect(duplicateGroup.childIds?.some((id) => sourcePage.elements.some((element) => element.id === id))).toBe(false)
  })
})

describe('Design active-canvas commands', () => {
  beforeEach(resetStore)

  it('applies an idempotent command as one history entry', () => {
    const store = useDesignWorkspaceStore.getState()
    const document = store.document!
    const page = store.getActivePage()!
    const element = createDesignElement('rect', { id: 'el_agent_added' })
    const command: DesignCanvasCommandV1 = {
      schema: 'workwise.design.command',
      version: 1,
      idempotencyKey: 'command-1',
      workspaceRoot: '/workspace',
      documentId: document.id,
      pageId: page.id,
      expectedRevision: document.revision,
      operations: [{ kind: 'add', element }]
    }
    const first = store.applyCanvasCommand(command, '/workspace')
    expect(first.ok).toBe(true)
    expect(elements().some((item) => item.id === element.id)).toBe(true)
    expect(useDesignWorkspaceStore.getState().history.undoStack).toHaveLength(1)

    const second = useDesignWorkspaceStore.getState().applyCanvasCommand(command, '/workspace')
    expect(second).toMatchObject({
      ok: true,
      revision: first.revision,
      appliedOperations: first.appliedOperations
    })
    expect(elements().filter((item) => item.id === element.id)).toHaveLength(1)
    expect(useDesignWorkspaceStore.getState().history.undoStack).toHaveLength(1)

    const persisted = structuredClone(useDesignWorkspaceStore.getState().document!)
    useDesignWorkspaceStore.getState().loadDocument(persisted, {
      activePageId: page.id,
      persistedRevision: persisted.revision
    })
    const replayedAfterReload = useDesignWorkspaceStore
      .getState()
      .applyCanvasCommand(command, '/workspace')
    expect(replayedAfterReload).toMatchObject({
      ok: true,
      revision: first.revision,
      appliedOperations: first.appliedOperations
    })
    expect(elements().filter((item) => item.id === element.id)).toHaveLength(1)
  })

  it('rejects stale commands without mutating the canvas', () => {
    const store = useDesignWorkspaceStore.getState()
    const document = store.document!
    const page = store.getActivePage()!
    const result = store.applyCanvasCommand({
      schema: 'workwise.design.command',
      version: 1,
      idempotencyKey: 'stale',
      workspaceRoot: '/workspace',
      documentId: document.id,
      pageId: page.id,
      expectedRevision: document.revision + 1,
      operations: [{ kind: 'add', element: createDesignElement('rect') }]
    }, '/workspace')
    expect(result).toMatchObject({ ok: false, code: 'stale_request' })
    expect(elements()).toHaveLength(0)
  })

  it('does not acknowledge an idempotency key from a different document', () => {
    const store = useDesignWorkspaceStore.getState()
    const document = store.document!
    const page = store.getActivePage()!
    const command: DesignCanvasCommandV1 = {
      schema: 'workwise.design.command',
      version: 1,
      idempotencyKey: 'cross-document-key',
      workspaceRoot: '/workspace',
      documentId: document.id,
      pageId: page.id,
      expectedRevision: document.revision,
      operations: [{
        kind: 'add',
        element: createDesignElement('rect', { id: 'agent-cross-document' })
      }]
    }
    expect(store.applyCanvasCommand(command, '/workspace').ok).toBe(true)

    expect(useDesignWorkspaceStore.getState().applyCanvasCommand({
      ...command,
      documentId: 'doc_different'
    }, '/workspace')).toMatchObject({
      ok: false,
      code: 'document_unavailable'
    })
  })
})
