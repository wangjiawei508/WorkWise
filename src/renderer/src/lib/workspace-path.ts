function normalizePathForMatch(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

// 品牌升级后默认目录在 ~/.kun 下;老版本/迁移失败的机器上仍可能出现
// ~/.deepseekgui 形式,这里对两套路径都要认,并归一到同一个身份键,
// 避免同一个默认工作区在侧栏里出现两份。
function isDefaultWorkspacePath(normalized: string): boolean {
  return (
    normalized === '~/.kun/default_workspace'
    || normalized.endsWith('/.kun/default_workspace')
    || normalized === '~/.deepseekgui/default_workspace'
    || normalized.endsWith('/.deepseekgui/default_workspace')
  )
}

export function workspaceRootIdentityKey(path?: string): string {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return ''
  const normalized = normalizePathForMatch(trimmed)
  if (isDefaultWorkspacePath(normalized)) {
    return '~/.kun/default_workspace'
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
  return normalized.includes('/.kun/claw/') || normalized.includes('/.deepseekgui/claw/')
}

export function isInternalDeepSeekGuiWorkspace(path?: string): boolean {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return false
  const normalized = normalizePathForMatch(trimmed)
  return (
    normalized === '~/.kun/write_workspace'
    || normalized.endsWith('/.kun/write_workspace')
    || normalized === '~/.deepseekgui/write_workspace'
    || normalized.endsWith('/.deepseekgui/write_workspace')
  )
}

export function normalizeWorkspaceRoot(path?: string): string {
  const trimmed = path?.trim() ?? ''
  if (!trimmed) return ''
  if (isInternalTemporaryWorkspace(trimmed)) return ''
  return trimmed
}
