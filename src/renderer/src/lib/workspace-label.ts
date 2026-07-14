import i18n from '../i18n'
import { isLegacyDefaultWorkspacePath } from './legacy-workspace-paths'

const DEFAULT_WORKSPACE_LABEL = 'default'

function normalizePathForMatch(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

// 新旧两代默认工作区路径都按 “default” 标签展示(老安装在迁移完成前
// 仍会持有 ~/.deepseekgui 形式的路径)。
function isDefaultWorkspacePath(path: string): boolean {
  const normalized = normalizePathForMatch(path)
  return normalized === '~/.workwise/default_workspace'
    || normalized.endsWith('/.workwise/default_workspace')
    || isLegacyDefaultWorkspacePath(normalized)
}

export function workspaceLabelFromPath(path: string): string {
  const p = path?.trim() ?? ''
  if (!p) return i18n.t('common:workingDirectory')
  if (isDefaultWorkspacePath(p)) return DEFAULT_WORKSPACE_LABEL
  const normalized = p.replace(/[/\\]+$/, '')
  const parts = normalized.split(/[/\\]/)
  const base = parts[parts.length - 1]
  return base || i18n.t('common:workingDirectory')
}
