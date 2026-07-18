import type {
  WorkspaceFileSaveAsPayload,
  WorkspaceFileSaveAsResult,
  WorkspaceFileTarget
} from '@shared/workspace-file'
import type { PathOpenResult } from '@shared/workwise-api'

function failure(message: string): PathOpenResult {
  return { ok: false, message }
}

export async function openGeneratedWorkspaceFile(
  target: WorkspaceFileTarget
): Promise<PathOpenResult> {
  if (typeof window === 'undefined' || typeof window.workwise?.openWorkspaceFile !== 'function') {
    return failure('File open bridge is unavailable.')
  }
  try {
    return await window.workwise.openWorkspaceFile(target)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function revealGeneratedWorkspaceFile(
  target: WorkspaceFileTarget
): Promise<PathOpenResult> {
  if (typeof window === 'undefined' || typeof window.workwise?.revealWorkspaceFile !== 'function') {
    return failure('File reveal bridge is unavailable.')
  }
  try {
    return await window.workwise.revealWorkspaceFile(target)
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}

export async function saveGeneratedWorkspaceFileAs(
  payload: WorkspaceFileSaveAsPayload
): Promise<WorkspaceFileSaveAsResult> {
  if (typeof window === 'undefined' || typeof window.workwise?.saveWorkspaceFileAs !== 'function') {
    return { ok: false, message: 'File save bridge is unavailable.' }
  }
  try {
    return await window.workwise.saveWorkspaceFileAs(payload)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
