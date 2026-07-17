import { describe, expect, it } from 'vitest'
import {
  generatedFileActionFailureMessage,
  generatedFilePreviewCacheKey
} from './message-timeline-bubbles'

describe('generated file actions', () => {
  it('isolates preview cache entries by thread and trusted workspace', () => {
    const file = { relativePath: 'images/result.png', mimeType: 'image/png' }

    const first = generatedFilePreviewCacheKey(file, '/workspace/a', 'thread-a')
    const otherWorkspace = generatedFilePreviewCacheKey(file, '/workspace/b', 'thread-a')
    const otherThread = generatedFilePreviewCacheKey(file, '/workspace/a', 'thread-b')

    expect(first).not.toBe(otherWorkspace)
    expect(first).not.toBe(otherThread)
  })

  it('keeps concrete action errors and supplies a fallback when needed', () => {
    expect(generatedFileActionFailureMessage({ ok: false, message: 'unsafe_path' }, 'fallback'))
      .toBe('unsafe_path')
    expect(generatedFileActionFailureMessage({ ok: false }, 'fallback')).toBe('fallback')
    expect(generatedFileActionFailureMessage({ ok: true }, 'fallback')).toBeNull()
  })
})
