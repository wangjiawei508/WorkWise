import type { WindowAppearanceV1 } from '@shared/window-appearance'

type WindowAppearanceBridge = {
  windowAppearance?: WindowAppearanceV1
  onWindowAppearanceChanged?: (handler: (appearance: WindowAppearanceV1) => void) => () => void
}

export function applyWindowAppearanceAttributes(
  appearance: WindowAppearanceV1,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.windowMaterial = appearance.material
  root.dataset.windowTransparency = appearance.transparencyEnabled ? 'enabled' : 'disabled'
  root.dataset.windowAppearanceReason = appearance.reason
}

export function installWindowAppearanceBridge(
  bridge: WindowAppearanceBridge | undefined,
  root: HTMLElement = document.documentElement
): () => void {
  if (!bridge?.windowAppearance) return () => undefined
  applyWindowAppearanceAttributes(bridge.windowAppearance, root)
  return bridge.onWindowAppearanceChanged?.((appearance) => {
    applyWindowAppearanceAttributes(appearance, root)
  }) ?? (() => undefined)
}
