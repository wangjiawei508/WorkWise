// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import type { WindowAppearanceV1 } from '@shared/window-appearance'
import {
  applyWindowAppearanceAttributes,
  installWindowAppearanceBridge
} from './window-appearance'

const vibrancy: WindowAppearanceV1 = {
  schema: 'workwise.window-appearance',
  version: 1,
  material: 'vibrancy',
  transparencyEnabled: true,
  reason: 'supported'
}

describe('renderer window appearance bridge', () => {
  it('maps appearance state to stable root data attributes', () => {
    const root = document.createElement('html')
    applyWindowAppearanceAttributes(vibrancy, root)
    expect(root.dataset.windowMaterial).toBe('vibrancy')
    expect(root.dataset.windowTransparency).toBe('enabled')
    expect(root.dataset.windowAppearanceReason).toBe('supported')
  })

  it('applies live accessibility fallback changes and returns the unsubscribe callback', () => {
    const root = document.createElement('html')
    const unsubscribe = vi.fn()
    let listener: ((appearance: WindowAppearanceV1) => void) | undefined
    const dispose = installWindowAppearanceBridge({
      windowAppearance: vibrancy,
      onWindowAppearanceChanged: (handler) => {
        listener = handler
        return unsubscribe
      }
    }, root)

    listener?.({
      ...vibrancy,
      material: 'solid',
      transparencyEnabled: false,
      reason: 'reduced-transparency'
    })
    expect(root.dataset.windowMaterial).toBe('solid')
    expect(root.dataset.windowTransparency).toBe('disabled')
    expect(root.dataset.windowAppearanceReason).toBe('reduced-transparency')

    dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
