import { describe, expect, it } from 'vitest'
import { resolveComposerTextareaLayout } from './use-composer-draft'

describe('resolveComposerTextareaLayout', () => {
  it('keeps the shared composer at its configured practical minimum', () => {
    expect(resolveComposerTextareaLayout(28, 104, 240)).toEqual({
      height: 104,
      overflowY: 'hidden'
    })
  })

  it('grows with multi-line writing instructions', () => {
    expect(resolveComposerTextareaLayout(168, 104, 240)).toEqual({
      height: 168,
      overflowY: 'hidden'
    })
  })

  it('uses internal scrolling beyond the bounded maximum', () => {
    expect(resolveComposerTextareaLayout(420, 104, 240)).toEqual({
      height: 240,
      overflowY: 'auto'
    })
  })
})
