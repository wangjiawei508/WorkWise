import { describe, expect, it } from 'vitest'
import type { BrowserStorageLike } from '../lib/browser-storage'
import {
  designAssistantThreadIdForDocument,
  isDesignAssistantThreadId,
  markDesignAssistantThread,
  readDesignThreadRegistry
} from './design-thread-registry'

function memoryStorage(): BrowserStorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}

describe('Design assistant thread registry', () => {
  it('keeps a stable document-scoped thread outside Code', () => {
    const storage = memoryStorage()
    const registry = markDesignAssistantThread('design-1', 'thread-design-1', '/workspace', storage)
    expect(designAssistantThreadIdForDocument('design-1', registry)).toBe('thread-design-1')
    expect(isDesignAssistantThreadId('thread-design-1', readDesignThreadRegistry(storage))).toBe(true)
    expect(isDesignAssistantThreadId('thread-code', registry)).toBe(false)
  })
})
