import { useSddDraftStore } from './sdd-draft-store'

type SddDraftDiskSnapshot = {
  path?: string
  content?: string
  size?: number
  truncated?: boolean
  message?: string
}

function normalizePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '')
}

function snapshotMatchesActiveDraft(path: string): boolean {
  const draft = useSddDraftStore.getState().activeDraft
  if (!draft) return false
  const normalized = normalizePath(path)
  const relativePath = normalizePath(draft.relativePath)
  const candidates = [
    draft.absolutePath,
    draft.relativePath,
    `${draft.workspaceRoot}/${draft.relativePath}`
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizePath)
  return candidates.includes(normalized) || normalized.endsWith(`/${relativePath}`)
}

export async function syncActiveSddDraftFromDisk(snapshot: SddDraftDiskSnapshot): Promise<boolean> {
  const state = useSddDraftStore.getState()
  const draft = state.activeDraft
  if (!draft) return false
  if (state.saveStatus === 'dirty' || state.saveStatus === 'saving') return false
  if (snapshot.path && !snapshotMatchesActiveDraft(snapshot.path)) return false

  if (snapshot.message) {
    useSddDraftStore.getState().setSaveStatus('error', snapshot.message)
    return false
  }

  let content = snapshot.content
  if (typeof content !== 'string') {
    const result = await window.workwise.readWorkspaceFile({
      workspaceRoot: draft.workspaceRoot,
      path: draft.relativePath
    })
    if (!result.ok) {
      useSddDraftStore.getState().setSaveStatus('error', result.message)
      return false
    }
    content = result.content
  }

  const latest = useSddDraftStore.getState()
  if (latest.activeDraft?.id !== draft.id) return false
  if (latest.saveStatus === 'dirty' || latest.saveStatus === 'saving') return false

  latest.markSaved(content)
  return true
}

export async function saveActiveSddDraftToDisk(): Promise<boolean> {
  const snapshot = useSddDraftStore.getState()
  const draft = snapshot.activeDraft
  if (!draft) return true
  if (snapshot.saveStatus === 'saved' && snapshot.content === snapshot.lastSavedContent) return true

  useSddDraftStore.getState().setSaveStatus('saving')
  try {
    const result = await window.workwise.writeWorkspaceFile({
      workspaceRoot: draft.workspaceRoot,
      path: draft.relativePath,
      content: snapshot.content
    })
    if (!result.ok) {
      useSddDraftStore.getState().setSaveStatus('error', result.message)
      return false
    }
    const latest = useSddDraftStore.getState()
    if (latest.activeDraft?.id === draft.id) {
      latest.markSaved(snapshot.content)
    }
    return true
  } catch (error) {
    useSddDraftStore.getState().setSaveStatus(
      'error',
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}
