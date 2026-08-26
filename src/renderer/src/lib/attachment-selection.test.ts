import { describe, expect, it } from 'vitest'
import {
  MAX_COMPOSER_ATTACHMENTS,
  selectFilesForAvailableAttachmentSlots
} from './attachment-selection'

describe('composer attachment selection', () => {
  it('accepts no more than eight attachments in total', () => {
    const files = Array.from({ length: 10 }, (_, index) => `file-${index}`)

    expect(selectFilesForAvailableAttachmentSlots(files, 0)).toHaveLength(MAX_COMPOSER_ATTACHMENTS)
    expect(selectFilesForAvailableAttachmentSlots(files, 7)).toEqual(['file-0'])
    expect(selectFilesForAvailableAttachmentSlots(files, 8)).toEqual([])
    expect(selectFilesForAvailableAttachmentSlots(files, 12)).toEqual([])
  })
})
