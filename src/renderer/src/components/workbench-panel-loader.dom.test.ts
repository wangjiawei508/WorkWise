// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchRegistry } from './workbench-registry'
import { WorkbenchPanelLoader } from './workbench-panel-loader'

let container: HTMLDivElement
let root: Root

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('WorkbenchPanelLoader', () => {
  it('isolates a failed panel and retries with a fresh lazy component', async () => {
    const registry = new WorkbenchRegistry<void, void>()
    const failingLoad = vi.fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValueOnce({ label: 'recovered' })
    registry.registerTab({
      id: 'failing', order: 1, single: true, dedupeKey: () => 'failing', availability: () => true,
      load: failingLoad, render: () => null, onOpen: () => undefined, onClose: () => undefined
    })
    registry.registerTab({
      id: 'healthy', order: 2, single: true, dedupeKey: () => 'healthy', availability: () => true,
      load: async () => ({ label: 'healthy' }), render: () => null, onOpen: () => undefined, onClose: () => undefined
    })

    await act(async () => {
      root.render(createElement('div', null,
        createElement(WorkbenchPanelLoader<{ label: string }>, {
          registry,
          panelId: 'failing',
          title: 'Panel failed',
          retryLabel: 'Retry',
          children: (module) => createElement('span', null, module.label)
        }),
        createElement(WorkbenchPanelLoader<{ label: string }>, {
          registry,
          panelId: 'healthy',
          title: 'Panel failed',
          retryLabel: 'Retry',
          children: (module) => createElement('span', null, module.label)
        })
      ))
    })
    await settle()

    expect(container.textContent).toContain('Panel failed')
    expect(container.textContent).toContain('healthy')

    const retry = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Retry')
    expect(retry).toBeInstanceOf(HTMLButtonElement)
    await act(async () => {
      ;(retry as HTMLButtonElement).click()
    })
    await settle()
    await settle()

    expect(container.textContent).toContain('recovered')
    expect(container.textContent).toContain('healthy')
    expect(container.textContent).not.toContain('Panel failed')
    expect(failingLoad).toHaveBeenCalledTimes(2)
  })

  it('loads and retries file viewers through the viewer cache boundary', async () => {
    const registry = new WorkbenchRegistry<void, void>()
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('viewer chunk unavailable'))
      .mockResolvedValueOnce({ label: 'viewer recovered' })
    registry.registerFileViewer({
      id: 'text', priority: 1, extensions: ['txt'], sniff: () => false,
      load, render: () => null
    })

    await act(async () => {
      root.render(createElement(WorkbenchPanelLoader<{ label: string }>, {
        registry,
        kind: 'viewer',
        panelId: 'text',
        title: 'Viewer failed',
        retryLabel: 'Retry viewer',
        children: (module) => createElement('span', null, module.label)
      }))
    })
    await settle()

    expect(container.textContent).toContain('Viewer failed')
    const retry = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Retry viewer')
    await act(async () => {
      ;(retry as HTMLButtonElement).click()
    })
    await settle()
    await settle()

    expect(container.textContent).toContain('viewer recovered')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
