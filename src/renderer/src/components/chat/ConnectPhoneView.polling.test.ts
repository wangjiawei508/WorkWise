// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkWiseApi } from '@shared/workwise-api'
import i18n from '../../i18n'
import { ConnectPhoneView } from './ConnectPhoneView'

describe('ConnectPhoneView install polling', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, 'workwise')
  })

  it('polls immediately and again when the window regains focus', async () => {
    const pollClawImInstall = vi.fn(async () => ({ done: false as const }))
    Object.defineProperty(window, 'workwise', {
      configurable: true,
      value: {
        startClawImInstallQr: vi.fn(async () => ({
          ok: true as const,
          url: 'https://open.feishu.cn/page/launcher?user_code=TEST-CODE',
          deviceCode: 'device-code',
          userCode: 'TEST-CODE',
          interval: 30,
          expireIn: 300
        })),
        pollClawImInstall
      } satisfies Partial<WorkWiseApi>
    })

    await act(async () => {
      root.render(createElement(ConnectPhoneView, {
        channels: [],
        onAddProvider: async () => undefined,
        leftSidebarCollapsed: false,
        onToggleSidebar: () => undefined
      }))
    })

    const generateButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Generate authorization QR'))
    expect(generateButton).toBeDefined()

    await act(async () => {
      generateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pollClawImInstall).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(pollClawImInstall).toHaveBeenCalledTimes(2)
  })
})
