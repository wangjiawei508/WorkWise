// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { FloatingComposer } from '../chat/FloatingComposer'
import { EngineeringComposer } from './EngineeringComposer'
import { useChatStore } from '../../store/chat-store'
import { useEngineeringConversationDrafts } from './engineering-conversation-drafts'

let composer: ComponentProps<typeof FloatingComposer>
vi.mock('../chat/FloatingComposer', () => ({ FloatingComposer: (props: ComponentProps<typeof FloatingComposer>) => { composer = props; return createElement('textarea', { value: props.input, onChange: (event: { target: { value: string } }) => props.setInput(event.target.value) }) } }))
vi.mock('../../agent/registry', () => ({ getProvider: () => ({ getRuntimeInfo: async () => ({ capabilities: { attachments: { available: true } } }) }) }))

let root: Root
let container: HTMLDivElement
const sendMessage = vi.fn(async () => true)
const interrupt = vi.fn()
const importChatAttachment = vi.fn()
const onSurveyFiles = vi.fn()
const workspaceRoot = '/survey-workspace'

async function render(projectId = 'project-a', threadId = 'thread-a'): Promise<void> {
  await act(async () => { root.render(createElement(EngineeringComposer, { workspaceRoot, projectId, threadId, ready: true, onSurveyFiles })) })
}
function select(projectId: string, threadId: string): void {
  useChatStore.setState({ route: 'engineering', activeThreadId: threadId, threads: [{ id: threadId, domain: 'engineering', projectId, workspace: workspaceRoot }] as never, busy: false, queuedMessages: [], sendMessage, interrupt })
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, { workwise: { getPathForFile: (file: File) => `/source/${file.name}`, importChatAttachment, cancelChatAttachmentImport: vi.fn() } })
  useEngineeringConversationDrafts.setState({ drafts: {} })
  select('project-a', 'thread-a')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('Survey composer continuity', () => {
  it('sends a normal question through the shared chat action and clears only its own draft', async () => {
    await render()
    await act(async () => composer.setInput('Explain the residuals'))
    await act(async () => composer.onSend())
    expect(sendMessage).toHaveBeenCalledWith('Explain the residuals', 'agent', expect.objectContaining({ attachmentIds: [] }))
    expect(composer.input).toBe('')
  })

  it('restores project drafts after switching and after panel remount', async () => {
    await render()
    await act(async () => composer.setInput('Project A question'))
    await act(async () => select('project-b', 'thread-b'))
    await render('project-b', 'thread-b')
    expect(composer.input).toBe('')
    await act(async () => composer.setInput('Project B question'))
    await act(async () => root.render(null))
    await act(async () => select('project-a', 'thread-a'))
    await render()
    expect(composer.input).toBe('Project A question')
  })

  it('carries selected result IDs into a follow-up while keeping the visible message concise', async () => {
    const scope = JSON.stringify([workspaceRoot, 'project-a'])
    useEngineeringConversationDrafts.getState().update(scope, (draft) => ({ ...draft, input: 'Explain this result', viewContext: { networkId: 'network-1', adjustmentId: 'adjustment-1', networkRevision: 3, sourceSha256: 'source-hash', sourceRecordId: 'record-19', observationId: 'obs-19', section: 'result' } }))
    await render()
    await act(async () => composer.onSend())
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('"adjustmentId":"adjustment-1"'), 'agent', expect.objectContaining({ displayText: 'Explain this result' }))
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('"sourceRecordId":"record-19"'), 'agent', expect.any(Object))
    expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('"networkRevision":3'), 'agent', expect.any(Object))
  })

  it('routes professional files to preflight without parsing them as documents or losing the question', async () => {
    await render()
    await act(async () => composer.setInput('Review this network'))
    const files = [new File(['original records'], 'observations.in2')]
    await act(async () => composer.onPickAttachments?.(files))
    expect(onSurveyFiles).toHaveBeenCalledWith(files)
    expect(importChatAttachment).not.toHaveBeenCalled()
    expect(composer.input).toBe('Review this network')
    expect(composer.attachmentAccept).toContain('.in2')
    expect(composer.isAdditionalAttachment?.(files[0]!)).toBe(true)
  })

  it('keeps the standard document pipeline and blocks sends until attachments are ready', async () => {
    let resolveImport!: (result: unknown) => void
    importChatAttachment.mockImplementationOnce(() => new Promise((resolve) => { resolveImport = resolve }))
    await render()
    await act(async () => composer.onPickAttachments?.([new File(['document'], 'report.pdf', { type: 'application/pdf' })]))
    expect(composer.attachmentUploadBusy).toBe(true)
    await act(async () => composer.onSend())
    expect(sendMessage).not.toHaveBeenCalled()
    await act(async () => resolveImport({ attachment: { id: 'attachment-pdf', name: 'report.pdf', state: 'ready' }, managedPath: '/managed/report.pdf' }))
    expect(composer.attachmentUploadBusy).toBe(false)
    await act(async () => composer.onSend())
    expect(sendMessage).toHaveBeenCalledWith(expect.any(String), 'agent', expect.objectContaining({ attachmentIds: ['attachment-pdf'] }))
  })

  it('guards send and stop against another active thread', async () => {
    await render()
    await act(async () => composer.setInput('Do not send to Code'))
    await act(async () => useChatStore.setState({ route: 'chat', activeThreadId: 'code-thread' }))
    await act(async () => { composer.onSend(); composer.onInterrupt() })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(interrupt).not.toHaveBeenCalled()
    await act(async () => select('project-a', 'thread-a'))
    await act(async () => composer.onInterrupt())
    expect(interrupt).toHaveBeenCalledOnce()
  })
})
