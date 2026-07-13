import { afterEach, describe, expect, it } from 'vitest'
import {
  IKUN_MODE_STORAGE_KEY,
  readIkunModePreference,
  writeIkunModePreference
} from './ikun-mode'

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

describe('iKun mode preference', () => {
  it('defaults to disabled when no preference exists', () => {
    installStorage()

    expect(readIkunModePreference()).toBe(false)
  })

  it('accepts legacy truthy spellings while reading the preference', () => {
    const storage = installStorage()

    for (const value of ['1', 'true', 'on']) {
      storage.setItem(IKUN_MODE_STORAGE_KEY, value)
      expect(readIkunModePreference()).toBe(true)
    }
  })

  it('writes compact enabled and disabled values', () => {
    const storage = installStorage()

    writeIkunModePreference(true)
    expect(storage.getItem(IKUN_MODE_STORAGE_KEY)).toBe('1')

    writeIkunModePreference(false)
    expect(storage.getItem(IKUN_MODE_STORAGE_KEY)).toBe('0')
  })
})
