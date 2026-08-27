import { describe, expect, it, vi } from 'vitest'
import { clearComposerDraftAfterSuccessfulSend } from './composer-send-result'

describe('composer send result', () => {
  it('preserves the draft and attachments when a send is rejected', () => {
    const actions = {
      clearInput: vi.fn(),
      clearAttachments: vi.fn(),
      clearFileReferences: vi.fn()
    }

    expect(clearComposerDraftAfterSuccessfulSend(false, actions)).toBe(false)
    expect(actions.clearInput).not.toHaveBeenCalled()
    expect(actions.clearAttachments).not.toHaveBeenCalled()
    expect(actions.clearFileReferences).not.toHaveBeenCalled()
  })

  it('clears every part of the composer after a successful send', () => {
    const actions = {
      clearInput: vi.fn(),
      clearAttachments: vi.fn(),
      clearFileReferences: vi.fn()
    }

    expect(clearComposerDraftAfterSuccessfulSend(true, actions)).toBe(true)
    expect(actions.clearInput).toHaveBeenCalledOnce()
    expect(actions.clearAttachments).toHaveBeenCalledOnce()
    expect(actions.clearFileReferences).toHaveBeenCalledOnce()
  })
})
