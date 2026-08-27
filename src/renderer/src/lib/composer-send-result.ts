export type ComposerDraftClearActions = {
  clearInput: () => void
  clearAttachments: () => void
  clearFileReferences: () => void
}

export function clearComposerDraftAfterSuccessfulSend(
  sent: boolean,
  actions: ComposerDraftClearActions
): boolean {
  if (!sent) return false
  actions.clearInput()
  actions.clearAttachments()
  actions.clearFileReferences()
  return true
}
