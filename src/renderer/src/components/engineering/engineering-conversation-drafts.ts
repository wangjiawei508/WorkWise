import { create } from 'zustand'
import type { AttachmentReference } from '../../agent/types'

export type EngineeringConversationDraft = {
  input: string
  attachments: AttachmentReference[]
  uploading: boolean
  error: string | null
  viewContext?: { networkId: string; adjustmentId?: string; section: string }
}
export const EMPTY_ENGINEERING_DRAFT: EngineeringConversationDraft = { input: '', attachments: [], uploading: false, error: null }

// Session-local drafts survive panel unmounts without writing attachment data
// to localStorage or mixing it with the Code/Write composer.
export const useEngineeringConversationDrafts = create<{
  drafts: Record<string, EngineeringConversationDraft>
  update: (scope: string, update: (draft: EngineeringConversationDraft) => EngineeringConversationDraft) => void
}>((set) => ({
  drafts: {},
  update: (scope, update) => set((state) => ({ drafts: { ...state.drafts, [scope]: update(state.drafts[scope] ?? EMPTY_ENGINEERING_DRAFT) } }))
}))
