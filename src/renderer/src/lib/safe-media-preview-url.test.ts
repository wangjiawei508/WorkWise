import { describe, expect, it } from 'vitest'
import { safeMediaPreviewUrl } from './safe-media-preview-url'

describe('safe media preview URLs', () => {
  it('accepts renderer-owned data and blob previews', () => {
    expect(safeMediaPreviewUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(safeMediaPreviewUrl('blob:file:///workwise-preview')).toBe('blob:file:///workwise-preview')
  })

  it('rejects local-file and remote URLs from tool metadata', () => {
    expect(safeMediaPreviewUrl('file:///Users/example/.ssh/id_rsa')).toBeUndefined()
    expect(safeMediaPreviewUrl('https://example.com/tracker.png')).toBeUndefined()
    expect(safeMediaPreviewUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined()
  })
})
