import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'
import { useChatStore } from './store/chat-store'

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useChatStore.setState({ initialSetupOpen: false, initialSetupMode: 'required' })
  })

  it('keeps the macOS app shell on the same full-height flex chain as desktop titlebar platforms', () => {
    vi.stubGlobal('window', {
      workwise: { platform: 'darwin' }
    })

    const html = renderToStaticMarkup(createElement(AppShell))

    expect(html).toContain('ds-app-frame flex h-full min-h-0 flex-col bg-transparent')
    expect(html).toContain('flex min-h-0 flex-1 flex-col')
    expect(html).not.toContain('ds-windows-titlebar')
  })

  it('does not render the first-run setup as an automatic startup modal', () => {
    vi.stubGlobal('window', {
      workwise: { platform: 'darwin' }
    })
    useChatStore.setState({ initialSetupOpen: true, initialSetupMode: 'required' })

    const html = renderToStaticMarkup(createElement(AppShell))

    expect(html).not.toContain('role="dialog"')
  })
})
