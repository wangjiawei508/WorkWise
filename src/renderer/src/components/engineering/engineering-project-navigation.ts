import { browserStorage, type BrowserStorageLike } from '../../lib/browser-storage'

const PENDING_ENGINEERING_PROJECT_KEY = 'workwise.engineering.pendingProject.v1'
const ACTIVE_ENGINEERING_PROJECT_KEY = 'workwise.engineering.activeProject.v1'

export function requestEngineeringProjectOpen(
  projectId: string,
  storage: BrowserStorageLike | null = browserStorage()
): void {
  const normalized = projectId.trim()
  if (!normalized || !storage) return
  try {
    storage.setItem(PENDING_ENGINEERING_PROJECT_KEY, normalized)
  } catch {
    /* The active Engineering view can still receive the browser event. */
  }
}

export function consumeRequestedEngineeringProject(
  storage: BrowserStorageLike | null = browserStorage()
): string {
  if (!storage) return ''
  try {
    const projectId = storage.getItem(PENDING_ENGINEERING_PROJECT_KEY)?.trim() ?? ''
    if (projectId) {
      storage.removeItem?.(PENDING_ENGINEERING_PROJECT_KEY)
      setActiveEngineeringProject(projectId, storage)
    }
    return projectId
  } catch {
    return ''
  }
}

export function dispatchEngineeringProjectOpen(projectId: string): void {
  requestEngineeringProjectOpen(projectId)
  setActiveEngineeringProject(projectId)
  window.dispatchEvent(new CustomEvent('workwise:engineering-open-project'))
}

export function activeEngineeringProjectId(
  storage: BrowserStorageLike | null = browserStorage()
): string {
  if (!storage) return ''
  try {
    return storage.getItem(ACTIVE_ENGINEERING_PROJECT_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function setActiveEngineeringProject(
  projectId: string,
  storage: BrowserStorageLike | null = browserStorage()
): void {
  const normalized = projectId.trim()
  if (!storage) return
  try {
    if (normalized) storage.setItem(ACTIVE_ENGINEERING_PROJECT_KEY, normalized)
    else storage.removeItem?.(ACTIVE_ENGINEERING_PROJECT_KEY)
  } catch {
    /* Project selection remains active for the current rendered view. */
  }
}

export function dispatchEngineeringProjectCreate(): void {
  window.dispatchEvent(new CustomEvent('workwise:engineering-create-project'))
}

export function dispatchEngineeringAiOpen(): void {
  window.dispatchEvent(new CustomEvent('workwise:engineering-open-ai'))
}
