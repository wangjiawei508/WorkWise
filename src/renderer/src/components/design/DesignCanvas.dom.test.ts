// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDesignElement } from '@shared/design-document'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'
import { DesignCanvas } from './DesignCanvas'

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

function canvasSvg(): SVGSVGElement {
  const svg = container.querySelector('svg')
  if (!(svg instanceof SVGSVGElement)) throw new Error('Design canvas SVG was not rendered.')
  return svg
}

function firstElementGroup(): SVGGElement {
  const group = canvasSvg().querySelector(':scope > g')
  if (!(group instanceof SVGGElement)) throw new Error('Design element group was not rendered.')
  return group
}

beforeEach(async () => {
  resetDesignStore()
  const store = useDesignWorkspaceStore.getState()
  store.createNewDocument()
  // A locked element remains selectable but does not enter the drag path,
  // keeping this regression focused on the real mousedown/click bubble chain.
  store.addElement(createDesignElement('rect', {
    x: 80,
    y: 60,
    w: 240,
    h: 120,
    locked: true,
    zIndex: 0
  }))
  store.clearSelection()

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesignCanvas))
  })
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  resetDesignStore()
})

describe('DesignCanvas selection DOM events', () => {
  it('keeps an element selected after its bubbling click completes', async () => {
    const group = firstElementGroup()
    const elementId = useDesignWorkspaceStore.getState().getActivePage()!.elements[0].id

    await act(async () => {
      group.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([elementId])

    await act(async () => {
      firstElementGroup().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      firstElementGroup().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([elementId])
  })

  it('clears the selection when the SVG background itself is clicked', async () => {
    const elementId = useDesignWorkspaceStore.getState().getActivePage()!.elements[0].id
    useDesignWorkspaceStore.getState().selectElement(elementId)

    await act(async () => {
      canvasSvg().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useDesignWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('renders only the fidelity reference image in fidelity mode', async () => {
    const store = useDesignWorkspaceStore.getState()
    const pageId = store.getActivePage()!.id
    store.loadDocument(
      {
        ...store.document!,
        pages: store.document!.pages.map((page) => page.id === pageId
          ? {
              ...page,
              fidelityImageAssetId: 'asset_fidelity',
              displayMode: 'fidelity'
            }
          : page)
      },
      { activePageId: pageId, persistedRevision: store.document!.revision }
    )
    useDesignWorkspaceStore.getState().setAssetDataUrl('asset_fidelity', 'data:image/png;base64,AAAA')
    await act(async () => {
      root.render(createElement(DesignCanvas))
    })

    const svg = canvasSvg()
    const image = svg.querySelector('image')
    expect(image).toBeInstanceOf(SVGImageElement)
    expect(svg.querySelector(':scope > g')).toBeNull()
  })
})
