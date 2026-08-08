import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import type {
  WindowAppearanceReasonV1,
  WindowAppearanceV1,
  WindowMaterialV1
} from '../shared/window-appearance'

export type WindowAppearanceEnvironment = {
  platform: NodeJS.Platform
  windowsBuild?: number
  prefersReducedTransparency?: boolean
  highContrast?: boolean
  gpuDisabled?: boolean
  remoteSession?: boolean
  forcedSolid?: boolean
}

function solidAppearance(reason: WindowAppearanceReasonV1): WindowAppearanceV1 {
  return {
    schema: 'workwise.window-appearance',
    version: 1,
    material: 'solid',
    transparencyEnabled: false,
    reason
  }
}

function materialAppearance(material: WindowMaterialV1): WindowAppearanceV1 {
  return {
    schema: 'workwise.window-appearance',
    version: 1,
    material,
    transparencyEnabled: true,
    reason: 'supported'
  }
}

export function parseWindowsBuild(release: string): number {
  const build = Number.parseInt(release.split('.')[2] ?? '', 10)
  return Number.isFinite(build) ? build : 0
}

export function isRemoteDesktopSession(env: NodeJS.ProcessEnv): boolean {
  const sessionName = env.SESSIONNAME?.trim() ?? ''
  return (
    env.WORKWISE_REMOTE_SESSION === '1' ||
    /^RDP-/i.test(sessionName) ||
    Boolean(env.SSH_CONNECTION || env.SSH_TTY || env.CHROME_REMOTE_DESKTOP_SESSION)
  )
}

export function resolveWindowAppearance(
  environment: WindowAppearanceEnvironment
): WindowAppearanceV1 {
  if (environment.forcedSolid) return solidAppearance('disabled-by-environment')
  if (environment.highContrast) return solidAppearance('high-contrast')
  if (environment.prefersReducedTransparency) return solidAppearance('reduced-transparency')
  if (environment.remoteSession) return solidAppearance('remote-session')
  if (environment.gpuDisabled) return solidAppearance('gpu-disabled')

  if (environment.platform === 'darwin') return materialAppearance('vibrancy')
  if (environment.platform === 'win32') {
    return (environment.windowsBuild ?? 0) >= 22_621
      ? materialAppearance('mica')
      : solidAppearance('unsupported-windows-version')
  }
  return solidAppearance('unsupported-platform')
}

export function windowMaterialOptions(
  appearance: WindowAppearanceV1,
  dark: boolean
): Pick<
  BrowserWindowConstructorOptions,
  'backgroundColor' | 'backgroundMaterial' | 'vibrancy' | 'visualEffectState'
> {
  const backgroundColor = appearance.transparencyEnabled
    ? '#00000000'
    : dark ? '#101010' : '#f5f7fa'

  if (appearance.material === 'vibrancy') {
    return {
      backgroundColor,
      vibrancy: 'under-window',
      visualEffectState: 'followWindow'
    }
  }
  if (appearance.material === 'mica' || appearance.material === 'acrylic') {
    return {
      backgroundColor,
      backgroundMaterial: appearance.material
    }
  }
  return { backgroundColor }
}

export function applyWindowMaterial(
  window: BrowserWindow,
  platform: NodeJS.Platform,
  appearance: WindowAppearanceV1,
  dark: boolean
): void {
  if (platform === 'darwin') {
    window.setVibrancy(appearance.material === 'vibrancy' ? 'under-window' : null)
  } else if (platform === 'win32') {
    const material = appearance.material === 'mica' || appearance.material === 'acrylic'
      ? appearance.material
      : 'none'
    window.setBackgroundMaterial(material)
  }
  window.setBackgroundColor(
    appearance.transparencyEnabled ? '#00000000' : dark ? '#101010' : '#f5f7fa'
  )
}
