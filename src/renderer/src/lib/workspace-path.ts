function normalizePathForMatch(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

// WorkWise uses ~/.workwise. Older paths remain read-only identity aliases
// during the 0.3.x compatibility window.
// 避免同一个默认工作区在侧栏里出现两份。
function isDefaultWorkspacePath(normalized: string): boolean {
  return normalized === '~/.workwise/default_workspace'
    || normalized.endsWith('/.workwise/default_workspace')
    || isLegacyDefaultWorkspacePath(normalized)
}

export function workspaceRootIdentityKey(path?: string): string {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return ''
  const normalized = normalizePathForMatch(trimmed)
  if (isDefaultWorkspacePath(normalized)) {
    return '~/.workwise/default_workspace'
  }
  return normalized
}

export function isInternalTemporaryWorkspace(path?: string): boolean {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return false
  const normalized = normalizePathForMatch(trimmed)
  return (
    /\/deepseek-tui-updates\/tmp(?:\/|$)/.test(normalized)
    || normalized === '/tmp'
    || normalized.startsWith('/tmp/')
    || normalized === '/private/tmp'
    || normalized.startsWith('/private/tmp/')
    || /^\/var\/folders\/[^/]+\/[^/]+\/t(?:\/|$)/.test(normalized)
    || /^\/private\/var\/folders\/[^/]+\/[^/]+\/t(?:\/|$)/.test(normalized)
    || /\/appdata\/local\/temp(?:\/|$)/.test(normalized)
  )
}

export function isClawWorkspacePath(path?: string): boolean {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return false
  const normalized = normalizePathForMatch(trimmed)
  return normalized.includes('/.workwise/claw/') || isLegacyClawWorkspacePath(normalized)
}

export function isInternalWriteWorkspace(path?: string): boolean {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return false
  const normalized = normalizePathForMatch(trimmed)
  return normalized === '~/.workwise/write_workspace'
    || normalized.endsWith('/.workwise/write_workspace')
    || isLegacyWriteWorkspacePath(normalized)
}

export function normalizeWorkspaceRoot(path?: string): string {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return ''
  if (isInternalTemporaryWorkspace(trimmed)) return ''
  return trimmed
}
import {
  isLegacyClawWorkspacePath,
  isLegacyDefaultWorkspacePath,
  isLegacyWriteWorkspacePath
} from './legacy-workspace-paths'
