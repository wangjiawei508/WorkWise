import { afterEach, describe, expect, it } from 'vitest'
import {
  FOCUS_MODE_STORAGE_KEY,
  readFocusModePreference,
  writeFocusModePreference
} from './focus-mode'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function installStorage(): MemoryStorage {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  })
  return storage
}

function restoreLocalStorage(): void {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

afterEach(() => {
  restoreLocalStorage()
})

describe('Focus mode preference', () => {
  it('defaults to disabled when no preference exists', () => {
    installStorage()

    expect(readFocusModePreference()).toBe(false)
  })

  it('accepts legacy truthy spellings while reading the preference', () => {
    const storage = installStorage()

    for (const value of ['1', 'true', 'on']) {
      storage.setItem(FOCUS_MODE_STORAGE_KEY, value)
      expect(readFocusModePreference()).toBe(true)
    }
  })

  it('writes compact enabled and disabled values', () => {
    const storage = installStorage()

    writeFocusModePreference(true)
    expect(storage.getItem(FOCUS_MODE_STORAGE_KEY)).toBe('1')

    writeFocusModePreference(false)
    expect(storage.getItem(FOCUS_MODE_STORAGE_KEY)).toBe('0')
  })
})
