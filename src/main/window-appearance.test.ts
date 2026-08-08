import { describe, expect, it } from 'vitest'
import {
  isRemoteDesktopSession,
  parseWindowsBuild,
  resolveWindowAppearance,
  windowMaterialOptions
} from './window-appearance'
import {
  parseWindowAppearanceArguments,
  windowAppearanceArguments
} from '../shared/window-appearance'

describe('window appearance', () => {
  it('uses native vibrancy on macOS and Mica on supported Windows builds', () => {
    expect(resolveWindowAppearance({ platform: 'darwin' })).toMatchObject({
      material: 'vibrancy',
      transparencyEnabled: true,
      reason: 'supported'
    })
    expect(resolveWindowAppearance({ platform: 'win32', windowsBuild: 22_621 })).toMatchObject({
      material: 'mica',
      transparencyEnabled: true,
      reason: 'supported'
    })
  })

  it('falls back to a solid surface on unsupported Windows and Linux', () => {
    expect(resolveWindowAppearance({ platform: 'win32', windowsBuild: 22_000 })).toMatchObject({
      material: 'solid',
      reason: 'unsupported-windows-version'
    })
    expect(resolveWindowAppearance({ platform: 'linux' })).toMatchObject({
      material: 'solid',
      reason: 'unsupported-platform'
    })
  })

  it.each([
    ['reduced-transparency', { prefersReducedTransparency: true }],
    ['high-contrast', { highContrast: true }],
    ['gpu-disabled', { gpuDisabled: true }],
    ['remote-session', { remoteSession: true }],
    ['disabled-by-environment', { forcedSolid: true }]
  ] as const)('uses a solid surface for %s', (reason, flags) => {
    expect(resolveWindowAppearance({ platform: 'darwin', ...flags })).toMatchObject({
      material: 'solid',
      transparencyEnabled: false,
      reason
    })
  })

  it('detects common remote desktop sessions without spawning a shell', () => {
    expect(isRemoteDesktopSession({ SESSIONNAME: 'RDP-Tcp#4' })).toBe(true)
    expect(isRemoteDesktopSession({ SSH_CONNECTION: '127.0.0.1 1 127.0.0.1 2' })).toBe(true)
    expect(isRemoteDesktopSession({})).toBe(false)
  })

  it('parses Windows build numbers and serializes renderer arguments', () => {
    expect(parseWindowsBuild('10.0.22631')).toBe(22_631)
    expect(parseWindowsBuild('unknown')).toBe(0)

    const appearance = resolveWindowAppearance({ platform: 'darwin' })
    expect(parseWindowAppearanceArguments(windowAppearanceArguments(appearance))).toEqual(appearance)
  })

  it('only requests transparent BrowserWindow backgrounds for native materials', () => {
    expect(windowMaterialOptions(resolveWindowAppearance({ platform: 'darwin' }), false)).toEqual({
      backgroundColor: '#00000000',
      vibrancy: 'under-window',
      visualEffectState: 'followWindow'
    })
    expect(windowMaterialOptions(resolveWindowAppearance({ platform: 'linux' }), true)).toEqual({
      backgroundColor: '#101010'
    })
  })
})
