// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PptMasterConfirmPanel } from './PptMasterConfirmPanel'
import { useChatStore } from '../../store/chat-store'

const RECOMMENDATIONS = {
  mode: {
    id: 'agent',
    label: 'Agent 模式',
    candidates: [{ id: 'agent', label: 'Agent 模式', desc: '由 Agent 按方案执行' }]
  },
  visual_style: {
    id: 'pyramid',
    label: '金字塔',
    candidates: [
      { id: 'pyramid', label: '金字塔', desc: '学术技术蓝图风' },
      { id: 'swiss-minimal', label: '瑞士极简', desc: '网格化极简' }
    ]
  },
  canvas: 'ppt169',
  page_count: 12,
  audience: '工程管理层',
  communication_intent: '汇报',
  delivery_context: 'presenter-led',
  content_divergence: '补充',
  generation_mode: 'continuous',
  proactive_speaker_notes: true,
  proactive_custom_animations: false,
  image_usage: ['ai', 'web'],
  core_message: '项目阶段总结',
  audience_outcome: '批准下一步',
  artifact_afterlife: '归档'
}

let container: HTMLDivElement
let root: Root
let writeMock: ReturnType<typeof vi.fn>
let sendMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  container = globalThis.document.createElement('div')
  globalThis.document.body.append(container)
  root = createRoot(container)
  writeMock = vi.fn(async () => ({ ok: true, path: '/root/projects/a/confirm_ui/result.json', savedAt: 'now' }))
  sendMock = vi.fn(async () => true)
  useChatStore.setState({ sendMessage: sendMock as never })

  Object.defineProperty(globalThis.window, 'workwise', {
    configurable: true,
    value: {
      listWorkspaceDirectory: vi.fn(async ({ path }) => {
        if (!path || path === '/root') {
          return { ok: true, root: '/root', entries: [
            { name: 'projects', path: '/root/projects', type: 'directory', ext: '' }
          ] }
        }
        if (path === '/root/projects') {
          return { ok: true, root: path, entries: [
            { name: 'a', path: '/root/projects/a', type: 'directory', ext: '' }
          ] }
        }
        if (path === '/root/projects/a') {
          return { ok: true, root: path, entries: [
            { name: 'confirm_ui', path: '/root/projects/a/confirm_ui', type: 'directory', ext: '' }
          ] }
        }
        if (path === '/root/projects/a/confirm_ui') {
          return { ok: true, root: path, entries: [
            { name: 'recommendations.stage1.json', path: '/root/projects/a/confirm_ui/recommendations.stage1.json', type: 'file', ext: 'json' }
          ] }
        }
        return { ok: true, root: path, entries: [] }
      }),
      readWorkspaceFile: vi.fn(async () => ({
        ok: true,
        path: '/root/projects/a/confirm_ui/recommendations.stage1.json',
        content: JSON.stringify(RECOMMENDATIONS),
        size: JSON.stringify(RECOMMENDATIONS).length,
        truncated: false
      })),
      writeWorkspaceFile: writeMock
    } as unknown as typeof window.workwise
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(globalThis.window, 'workwise')
})

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

describe('PptMasterConfirmPanel', () => {
  it('renders the proposal, lets the user change a choice, and confirms back to the agent', async () => {
    await act(async () => {
      root.render(createElement(PptMasterConfirmPanel, { workspaceRoot: '/root' }))
    })
    await settle()
    await settle()

    expect(container.textContent).toContain('PPT Master Proposal Confirmation')
    expect(container.textContent).toContain('金字塔')
    expect(container.textContent).toContain('瑞士极简')

    const swissButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('瑞士极简'))
    expect(swissButton).toBeInstanceOf(HTMLButtonElement)
    await act(async () => {
      ;(swissButton as HTMLButtonElement).click()
    })

    const confirmButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Confirm & Continue'))
    expect(confirmButton).toBeInstanceOf(HTMLButtonElement)
    await act(async () => {
      ;(confirmButton as HTMLButtonElement).click()
    })
    await settle()

    expect(writeMock).toHaveBeenCalledTimes(1)
    const writePayload = writeMock.mock.calls[0][0] as {
      path: string
      workspaceRoot: string
      content: string
    }
    expect(writePayload.path).toContain('confirm_ui/result.json')
    const result = JSON.parse(writePayload.content) as Record<string, unknown>
    expect(result.stage).toBe('final')
    expect(result.status).toBe('confirmed')
    expect(result.visual_style).toMatchObject({ id: 'swiss-minimal', label: '瑞士极简' })
    expect(result.page_count).toBe(12)
    expect(result.core_message).toBe('项目阶段总结')

    expect(sendMock).toHaveBeenCalledTimes(1)
    const summary = sendMock.mock.calls[0][0] as string
    expect(summary).toContain('已确认 PPT Master 方案')
    expect(summary).toContain('视觉风格：瑞士极简')
    expect(summary).toContain('页数：12')
  })
})
