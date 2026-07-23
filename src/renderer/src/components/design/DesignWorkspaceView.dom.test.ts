// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesignDocument } from '@shared/design-document'
import i18n from '../../i18n'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'
import { DesignWorkspaceView } from './DesignWorkspaceView'

let container: HTMLDivElement
let root: Root

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim() === text)
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button was not rendered: ${text}`)
  }
  return button
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  const document = createDesignDocument({ name: 'QA board' })
  const openWorkspaceFile = vi.fn(async () => ({ ok: true as const }))
  const revealWorkspaceFile = vi.fn(async () => ({ ok: true as const }))
  const saveWorkspaceFileAs = vi.fn(async () => ({
    ok: true as const,
    path: '/tmp/QA board copy.pptx'
  }))
  Object.defineProperty(window, 'workwise', {
    configurable: true,
    value: {
      listDesignDocuments: vi.fn(async () => ({
        ok: true as const,
        documents: [{
          id: document.id,
          name: document.name,
          revision: document.revision,
          pageCount: document.pages.length,
          updatedAt: document.updatedAt
        }],
        activeDocumentId: document.id,
        corruptDocumentIds: []
      })),
      loadDesignDocument: vi.fn(async () => ({
        ok: true as const,
        document,
        activePageId: document.pages[0].id,
        revision: document.revision
      })),
      saveDesignDocument: vi.fn(async () => ({
        ok: true as const,
        document,
        revision: document.revision
      })),
      exportDesignToPptx: vi.fn(async () => ({
        ok: true as const,
        path: '/tmp/QA board.pptx'
      })),
      openWorkspaceFile,
      revealWorkspaceFile,
      saveWorkspaceFileAs
    }
  })

  container = globalThis.document.createElement('div')
  globalThis.document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesignWorkspaceView, {
      leftSidebarCollapsed: false,
      onToggleLeftSidebar: vi.fn(),
      onOpenWrite: vi.fn(),
      workspaceRoot: '/tmp/workwise-design-qa'
    }))
  })
  await settle()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  Reflect.deleteProperty(window, 'workwise')
  useDesignWorkspaceStore.getState().closeDocument()
  vi.restoreAllMocks()
})

describe('DesignWorkspaceView export delivery', () => {
  it('renders working open, save-as, and reveal actions after a PPTX export', async () => {
    await act(async () => {
      buttonWithText('Export PPTX').click()
    })
    await settle()

    expect(container.textContent).toContain('QA board.pptx')

    await act(async () => {
      buttonWithText('Open').click()
    })
    await settle()
    await act(async () => {
      buttonWithText('Save as').click()
    })
    await settle()
    await act(async () => {
      buttonWithText('Show in folder').click()
    })
    await settle()

    expect(window.workwise.openWorkspaceFile).toHaveBeenCalledWith({
      path: '/tmp/QA board.pptx'
    })
    expect(window.workwise.saveWorkspaceFileAs).toHaveBeenCalledWith({
      sourcePath: '/tmp/QA board.pptx',
      suggestedName: 'QA board.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    })
    expect(window.workwise.revealWorkspaceFile).toHaveBeenCalledWith({
      path: '/tmp/QA board.pptx'
    })
  })
})
