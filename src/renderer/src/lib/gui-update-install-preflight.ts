import type { GuiUpdateInstallResult } from '@shared/gui-update'

type SaveHandler = () => boolean | Promise<boolean>

const saveHandlers = new Map<string, SaveHandler>()

export function registerGuiUpdateSaveHandler(id: string, handler: SaveHandler): () => void {
  saveHandlers.set(id, handler)
  return () => {
    if (saveHandlers.get(id) === handler) saveHandlers.delete(id)
  }
}

export async function flushGuiUpdateEditors(): Promise<{ ok: boolean; failed: string[] }> {
  const failed: string[] = []
  for (const [id, handler] of saveHandlers) {
    try {
      if (await handler() === false) failed.push(id)
    } catch {
      failed.push(id)
    }
  }
  return { ok: failed.length === 0, failed }
}

export async function preflightAndInstallGuiUpdate(): Promise<GuiUpdateInstallResult> {
  const currentVersion = await window.workwise.getAppVersion().catch(() => '')
  const saved = await flushGuiUpdateEditors()
  if (!saved.ok) {
    return {
      ok: false,
      currentVersion,
      code: 'install_failed',
      message: `无法保存正在编辑的内容：${saved.failed.join('、')}。应用仍保持打开，请处理后重试。`
    }
  }
  const preflight = await window.workwise.preflightGuiUpdateInstall()
  if (!preflight.ok) {
    return {
      ok: false,
      currentVersion,
      code: 'install_failed',
      message: preflight.message ?? '无法检查正在运行的任务，应用仍保持打开。'
    }
  }
  if (preflight.activeWork.length > 0) {
    const list = preflight.activeWork
      .map((item) => `• ${item.kind.toUpperCase()} · ${item.label} (${item.status})${item.recoverable ? '' : ' · 不可恢复'}`)
      .join('\n')
    const confirmed = window.confirm(
      `以下工作仍在运行。重启会先建立可恢复检查点并停止运行时；不可恢复节点会被中止。\n\n${list}\n\n是否继续“重启并更新”？`
    )
    if (!confirmed) {
      return { ok: false, currentVersion, code: 'install_failed', message: '已取消更新，应用和任务保持运行。' }
    }
  }
  return window.workwise.installGuiUpdate({ confirmActiveWork: preflight.activeWork.length > 0 })
}
