import { describe, expect, it } from 'vitest'
import { migrateLegacyLocalStorageKeys } from './legacy-local-storage-migration'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(seed))
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, value)
    }
  }
}

describe('legacy localStorage migration', () => {
  it('copies all legacy keys to WorkWise keys without deleting old values', () => {
    const storage = memoryStorage({
      'deepseekgui.plan.registry.v1': '{"plans":{}}',
      'kun.turnModelLabel': '{"thread|item":"deepseek-chat"}'
    })

    expect(migrateLegacyLocalStorageKeys(storage)).toBe(2)
    expect(storage.getItem('workwise.plan.registry.v1')).toBe('{"plans":{}}')
    expect(storage.getItem('workwise.turnModelLabel')).toBe('{"thread|item":"deepseek-chat"}')
    expect(storage.getItem('deepseekgui.plan.registry.v1')).toBe('{"plans":{}}')
  })

  it('does not overwrite existing WorkWise keys', () => {
    const storage = memoryStorage({
      'deepseekgui.plan.registry.v1': 'legacy',
      'workwise.plan.registry.v1': 'current'
    })

    expect(migrateLegacyLocalStorageKeys(storage)).toBe(0)
    expect(storage.getItem('workwise.plan.registry.v1')).toBe('current')
    expect(storage.getItem('deepseekgui.plan.registry.v1')).toBe('legacy')
  })
})
