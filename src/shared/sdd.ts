export const SDD_RELATIVE_DIR = '.kunsdd'
export const SDD_DRAFT_RELATIVE_DIR = `${SDD_RELATIVE_DIR}/draft`
export const SDD_IMAGE_RELATIVE_DIR = `${SDD_RELATIVE_DIR}/img`
export const SDD_DRAFT_FILE_NAME = 'requirement.md'
export const SDD_TRACE_FILE_NAME = 'trace.json'

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeSddRelativePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

export function buildSddDraftRelativePath(id: string): string {
  return `${SDD_DRAFT_RELATIVE_DIR}/${id}/${SDD_DRAFT_FILE_NAME}`
}

export function isSddDraftRelativePath(value: string): boolean {
  const normalized = normalizeSddRelativePath(value)
  const parts = normalized.split('/')
  return (
    parts.length === 4 &&
    parts[0] === '.kunsdd' &&
    parts[1] === 'draft' &&
    UUID_LIKE.test(parts[2] ?? '') &&
    parts[3] === SDD_DRAFT_FILE_NAME
  )
}

/** Extract the draft folder (uuid) from a draft-relative path, or null. */
export function sddDraftFolderFromRelativePath(value: string): string | null {
  const normalized = normalizeSddRelativePath(value)
  const parts = normalized.split('/')
  if (parts.length !== 4 || parts[0] !== '.kunsdd' || parts[1] !== 'draft') return null
  return UUID_LIKE.test(parts[2] ?? '') ? parts[2] : null
}

/** Sidecar trace file for a draft (`.kunsdd/draft/<uuid>/trace.json`). */
export function sddDraftTraceRelativePath(draftRelativePath: string): string | null {
  const folder = sddDraftFolderFromRelativePath(draftRelativePath)
  return folder ? `${SDD_DRAFT_RELATIVE_DIR}/${folder}/${SDD_TRACE_FILE_NAME}` : null
}

/**
 * Map an SDD-generated plan path (`.kunsdd/plan/sdd-<uuid>[-n].md`) back to
 * its requirement draft path, or null for non-SDD plans.
 */
export function sddDraftRelativePathForPlanPath(planRelativePath: string): string | null {
  const normalized = normalizeSddRelativePath(planRelativePath)
  const match = /^\.kunsdd\/plan\/sdd-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-\d+)?\.md$/i.exec(
    normalized
  )
  if (!match) return null
  return buildSddDraftRelativePath(match[1].toLowerCase())
}

export function isSddImageRelativePath(value: string): boolean {
  const normalized = normalizeSddRelativePath(value)
  if (!normalized.startsWith(`${SDD_IMAGE_RELATIVE_DIR}/`)) return false
  const rest = normalized.slice(SDD_IMAGE_RELATIVE_DIR.length + 1)
  return Boolean(rest) && !rest.split('/').some((part) => !part || part === '.' || part === '..')
}
