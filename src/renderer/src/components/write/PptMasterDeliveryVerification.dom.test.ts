// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PptMasterDeliveryVerification } from './PptMasterDeliveryVerification'
import { useChatStore } from '../../store/chat-store'

let container: HTMLDivElement
let root: Root
let verifyMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  container = globalThis.document.createElement('div')
  globalThis.document.body.append(container)
  root = createRoot(container)
  verifyMock = vi.fn(async () => ({
    ok: true,
    projectDir: '/root/projects/deck',
    verifiedAt: 'now',
    file: { path: '/root/projects/deck/deck.pptx', size: 66356, modifiedAt: 'now' },
    slideCount: 12,
    notesCount: 12,
    expectedSlides: 12,
    expectedNotes: 12,
    issues: []
  }))
  Object.defineProperty(globalThis.window, 'workwise', {
    configurable: true,
    value: { verifyPptMasterDeliverable: verifyMock } as unknown as typeof window.workwise
  })
  useChatStore.setState({
    blocks: [
      {
        kind: 'assistant',
        id: 'b1',
        text: '✅ PPT 已生成：projects/deck/deck.pptx，slideCount=12，notesCount=12，完整交付。',
        role: 'assistant',
        createdAt: Date.now()
      }
    ] as never
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(globalThis.window, 'workwise')
})

describe('PptMasterDeliveryVerification', () => {
  it('verifies the agent delivery claim and shows the system result', async () => {
    await act(async () => {
      root.render(createElement(PptMasterDeliveryVerification, { workspaceRoot: '/root' }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })
    expect(verifyMock).toHaveBeenCalledWith({
      workspaceRoot: '/root',
      projectDir: '/root/projects/deck'
    })
    expect(container.textContent).toContain('System verified')
    expect(container.textContent).toContain('12')
  })

  it('triggers on 已交付/文件路径 phrasings used by real agents', async () => {
    useChatStore.setState({
      blocks: [
        {
          kind: 'assistant',
          id: 'b2',
          text: '✅ 紧凑版 v3 已交付：文件路径 projects/deck/exports/deck_v3.pptx',
          role: 'assistant',
          createdAt: Date.now()
        }
      ] as never
    })
    await act(async () => {
      root.render(createElement(PptMasterDeliveryVerification, { workspaceRoot: '/root' }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })
    expect(verifyMock).toHaveBeenCalledWith({
      workspaceRoot: '/root',
      projectDir: '/root/projects/deck'
    })
  })
})
