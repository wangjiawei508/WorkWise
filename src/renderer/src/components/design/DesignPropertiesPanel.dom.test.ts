// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDesignElement } from '@shared/design-document'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'
import { DesignPropertiesPanel } from './DesignPropertiesPanel'

let container: HTMLDivElement
let root: Root

function resetDesignStore(): void {
  useDesignWorkspaceStore.setState({
    document: null,
    activePageId: null,
    selectedElementIds: [],
    activeTool: 'select',
    history: {
      undoStack: [],
      redoStack: [],
      transientInProgress: false,
      transientCommitted: false
    },
    persistedRevision: null,
    saveState: 'idle',
    saveError: null,
    assetDataUrls: {},
    appliedCommandIds: []
  })
}

beforeEach(async () => {
  resetDesignStore()
  const store = useDesignWorkspaceStore.getState()
  store.createNewDocument()
  const text = createDesignElement('text', {
    x: 40,
    y: 40,
    w: 200,
    h: 40,
    text: 'Hello WorkWise',
    fontSize: 24,
    zIndex: 0
  })
  store.addElement(text)
  store.selectElement(text.id)

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesignPropertiesPanel))
  })
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  resetDesignStore()
})

describe('DesignPropertiesPanel', () => {
  it('renders the selected element and edits go back to the store without render recursion', async () => {
    const textarea = container.querySelector('textarea')
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement)
    expect(container.textContent).toContain('Hello WorkWise')

    const elementId = useDesignWorkspaceStore.getState().selectedElementIds[0]
    await act(async () => {
      if (textarea instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(textarea, 'Edited text')
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    const element = useDesignWorkspaceStore.getState().getActivePage()?.elements.find((e) => e.id === elementId)
    expect(element?.text).toBe('Edited text')
  })

  it('shows the empty hint when nothing is selected', async () => {
    useDesignWorkspaceStore.getState().clearSelection()
    await act(async () => {
      root.render(createElement(DesignPropertiesPanel))
    })
    expect(container.textContent).toContain('designPropertiesEmpty')
  })
})
