import type { AppRoute } from '../store/chat-store-types'

export type WorkbenchComposerScope = 'code' | 'write' | 'detached'

export type WorkbenchComposerDrafts = Record<WorkbenchComposerScope, string>

export function createWorkbenchComposerDrafts(): WorkbenchComposerDrafts {
  return {
    code: '',
    write: '',
    detached: ''
  }
}

export function workbenchComposerScope(route: AppRoute): WorkbenchComposerScope {
  if (route === 'chat') return 'code'
  if (route === 'write') return 'write'
  return 'detached'
}

export function setWorkbenchComposerDraft(
  drafts: WorkbenchComposerDrafts,
  scope: WorkbenchComposerScope,
  value: string
): WorkbenchComposerDrafts {
  if (drafts[scope] === value) return drafts
  return { ...drafts, [scope]: value }
}
