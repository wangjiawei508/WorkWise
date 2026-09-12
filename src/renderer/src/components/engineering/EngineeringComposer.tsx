import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { getProvider } from '../../agent/registry'
import type { CoreRuntimeInfoJson } from '../../agent/runtime-contract'
import { prepareImageAttachmentUpload } from '../../lib/image-attachment-upload'
import { selectFilesForAvailableAttachmentSlots } from '../../lib/attachment-selection'
import { useChatStore } from '../../store/chat-store'
import { FloatingComposer } from '../chat/FloatingComposer'
import { composerReasoningEffortRequestValue, type ComposerReasoningEffort } from '../chat/FloatingComposerModelPicker'
import { EMPTY_ENGINEERING_DRAFT, useEngineeringConversationDrafts } from './engineering-conversation-drafts'
import { isSurveyInstrumentFile, SURVEY_FILE_ACCEPT } from './survey-file-selection'

export function EngineeringComposer({ workspaceRoot, projectId, ready, threadId, onSurveyFiles }: {
  workspaceRoot: string; projectId: string; ready: boolean; threadId: string | null; onSurveyFiles: (files: File[]) => void
}): ReactElement {
  const { t } = useTranslation('common')
  const scope = JSON.stringify([workspaceRoot, projectId])
  const draft = useEngineeringConversationDrafts((state) => state.drafts[scope] ?? EMPTY_ENGINEERING_DRAFT)
  const update = useEngineeringConversationDrafts((state) => state.update)
  const { busy, queuedMessages, composerModel, composerPickList, composerModelGroups, setComposerModel, sendMessage, interrupt, removeQueuedMessage } = useChatStore(useShallow((state) => ({
    busy: state.busy, queuedMessages: state.queuedMessages,
    composerModel: state.composerModel, composerPickList: state.composerPickList, composerModelGroups: state.composerModelGroups,
    setComposerModel: state.setComposerModel, sendMessage: state.sendMessage, interrupt: state.interrupt, removeQueuedMessage: state.removeQueuedMessage
  })))
  const [runtimeInfo, setRuntimeInfo] = useState<CoreRuntimeInfoJson | null>(null)
  const [effort, setEffort] = useState<ComposerReasoningEffort>('max')
  const isCurrentThread = (): boolean => {
    const state = useChatStore.getState()
    const thread = state.threads.find((item) => item.id === threadId)
    return state.route === 'engineering' && state.activeThreadId === threadId && thread?.domain === 'engineering' && thread.projectId === projectId && thread.workspace === workspaceRoot
  }
  useEffect(() => {
    let cancelled = false
    if (!ready) { setRuntimeInfo(null); return }
    void getProvider().getRuntimeInfo?.().then((info) => { if (!cancelled) setRuntimeInfo(info) }).catch(() => { if (!cancelled) setRuntimeInfo(null) })
    return () => { cancelled = true }
  }, [ready])

  const pickAttachments = async (files: File[]): Promise<void> => {
    const provider = getProvider()
    const capabilities = runtimeInfo?.capabilities.attachments
    const current = useEngineeringConversationDrafts.getState().drafts[scope] ?? EMPTY_ENGINEERING_DRAFT
    if (!ready || !threadId || !isCurrentThread() || !capabilities?.available || current.uploading) return
    const surveyFiles = files.filter(isSurveyInstrumentFile)
    if (surveyFiles.length) onSurveyFiles(surveyFiles)
    files = files.filter((file) => !isSurveyInstrumentFile(file))
    if (!files.length) return
    update(scope, (value) => ({ ...value, uploading: true, error: null }))
    try {
      const selected = selectFilesForAvailableAttachmentSlots(files, current.attachments.length)
      if (selected.reduce((sum, file) => sum + file.size, 0) > 500 * 1024 * 1024) throw new Error(t('engineeringAttachmentBatchLimit'))
      for (const file of selected) {
        if (file.size > 200 * 1024 * 1024) throw new Error(t('engineeringAttachmentSizeLimit', { name: file.name }))
        const id = `import_${crypto.randomUUID()}`
        const sourcePath = window.workwise.getPathForFile(file)
        update(scope, (value) => ({ ...value, attachments: [...value.attachments, { id, name: file.name, mimeType: file.type, byteSize: file.size, state: 'parsing', localSourcePath: sourcePath }] }))
        try {
          if (file.type.startsWith('image/')) {
            if (!provider.uploadAttachment) throw new Error(t('composerAttachmentUnavailable'))
            const prepared = await prepareImageAttachmentUpload(file, capabilities)
            const attachment = await provider.uploadAttachment({ name: file.name, ...prepared, threadId, workspace: workspaceRoot })
            update(scope, (value) => ({ ...value, attachments: value.attachments.map((item) => item.id === id ? { ...attachment, state: 'ready', previewUrl: `data:${prepared.mimeType};base64,${prepared.dataBase64}` } : item) }))
          } else {
            const result = await window.workwise.importChatAttachment({ importId: id, sourcePath, declaredMimeType: file.type || undefined, threadId, workspace: workspaceRoot })
            update(scope, (value) => ({ ...value, attachments: value.attachments.map((item) => item.id === id ? { ...result.attachment, managedPath: result.managedPath, localSourcePath: sourcePath } : item) }))
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          update(scope, (value) => ({ ...value, error: message, attachments: value.attachments.map((item) => item.id === id ? { ...item, state: 'failed', degradationReasons: [message] } : item) }))
        }
      }
    } catch (error) {
      update(scope, (value) => ({ ...value, error: error instanceof Error ? error.message : String(error) }))
    } finally { update(scope, (value) => ({ ...value, uploading: false })) }
  }

  const retryAttachment = async (id: string): Promise<void> => {
    const attachment = draft.attachments.find((item) => item.id === id)
    if (!threadId || !isCurrentThread() || !attachment?.localSourcePath || attachment.state !== 'failed') return
    update(scope, (value) => ({ ...value, error: null, attachments: value.attachments.map((item) => item.id === id ? { ...item, state: 'parsing' } : item) }))
    try {
      const result = await window.workwise.importChatAttachment({ importId: id, sourcePath: attachment.localSourcePath, declaredMimeType: attachment.mimeType || undefined, threadId, workspace: workspaceRoot })
      update(scope, (value) => ({ ...value, attachments: value.attachments.map((item) => item.id === id ? { ...result.attachment, managedPath: result.managedPath, localSourcePath: attachment.localSourcePath } : item) }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      update(scope, (value) => ({ ...value, error: message, attachments: value.attachments.map((item) => item.id === id ? { ...item, state: 'failed', degradationReasons: [message] } : item) }))
    }
  }

  const send = async (): Promise<void> => {
    if (!ready || !isCurrentThread() || draft.uploading) return
    if (draft.attachments.some((item) => item.state && !['ready', 'degraded'].includes(item.state))) {
      update(scope, (value) => ({ ...value, error: t('engineeringAttachmentNotReady') })); return
    }
    if (!draft.input.trim() && !draft.attachments.length) return
    const text = draft.input.trim() || t('engineeringAttachmentOnlyPrompt')
    const prompt = draft.viewContext ? `${text}\n\nCurrent Survey view (reference IDs only, not execution approval): ${JSON.stringify(draft.viewContext)}` : text
    const sent = await sendMessage(prompt, 'agent', {
      displayText: text,
      attachments: draft.attachments, attachmentIds: draft.attachments.map((item) => item.id),
      reasoningEffort: composerReasoningEffortRequestValue(effort)
    })
    if (sent) update(scope, (value) => ({ ...value, input: value.input === draft.input ? '' : value.input, attachments: value.attachments.filter((item) => !draft.attachments.some((sentItem) => sentItem.id === item.id)), error: null }))
  }

  return <FloatingComposer
    variant="compact" forceToolbarRow workspaceRootOverride={workspaceRoot}
    input={draft.input} setInput={(input) => update(scope, (value) => ({ ...value, input }))}
    mode="agent" setMode={() => undefined} busy={Boolean(threadId) && busy}
    runtimeReady={ready && Boolean(threadId)} hasActiveThread={Boolean(threadId)}
    composerModel={composerModel} composerPickList={composerPickList} composerModelGroups={composerModelGroups}
    composerReasoningEffort={effort} onComposerModelChange={setComposerModel} onComposerReasoningEffortChange={setEffort}
    queuedMessages={threadId ? queuedMessages : []} onRemoveQueuedMessage={removeQueuedMessage}
    attachments={draft.attachments} attachmentUploadEnabled={runtimeInfo?.capabilities.attachments.available === true}
    attachmentAccept={`${SURVEY_FILE_ACCEPT},.pdf,.docx,.pptx,.md,.markdown,image/png,image/jpeg,image/gif,image/webp`}
    isAdditionalAttachment={isSurveyInstrumentFile}
    attachmentUploadBusy={draft.uploading} attachmentUploadError={draft.error}
    onPickAttachments={(files) => void pickAttachments(files)}
    onRemoveAttachment={(id) => {
      const item = draft.attachments.find((attachment) => attachment.id === id)
      if (item?.state === 'parsing') void window.workwise.cancelChatAttachmentImport(id)
      update(scope, (value) => ({ ...value, attachments: value.attachments.filter((attachment) => attachment.id !== id) }))
    }}
    onRetryAttachment={(id) => void retryAttachment(id)}
    onSend={() => void send()} onInterrupt={(options) => { if (isCurrentThread()) void interrupt(options) }}
  />
}
