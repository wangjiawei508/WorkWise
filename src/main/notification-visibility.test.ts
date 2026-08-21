import { describe, expect, it } from 'vitest'
import { isActiveThreadActuallyVisible } from './notification-visibility'

function target(overrides: Partial<{
  destroyed: boolean
  visible: boolean
  minimized: boolean
  focused: boolean
}> = {}) {
  return {
    isDestroyed: () => overrides.destroyed ?? false,
    isVisible: () => overrides.visible ?? true,
    isMinimized: () => overrides.minimized ?? false,
    isFocused: () => overrides.focused ?? true
  }
}

describe('notification visibility', () => {
  it('suppresses only when the selected conversation is actually being viewed', () => {
    expect(isActiveThreadActuallyVisible(target(), true)).toBe(true)
    expect(isActiveThreadActuallyVisible(target({ visible: false }), true)).toBe(false)
    expect(isActiveThreadActuallyVisible(target({ minimized: true }), true)).toBe(false)
    expect(isActiveThreadActuallyVisible(target({ focused: false }), true)).toBe(false)
    expect(isActiveThreadActuallyVisible(target(), false)).toBe(false)
  })
})
