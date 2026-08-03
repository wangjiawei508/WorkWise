import { createHash } from 'node:crypto'
import type { AttachmentSectionProvenance, AttachmentSectionV1 } from '../contracts/attachments.js'
import { ATTACHMENT_LIMITS_V2 } from '../contracts/attachments.js'

export type StructuredTextBlock = {
  text: string
  provenance?: AttachmentSectionProvenance
}

export function chunkAttachmentText(input: {
  attachmentId: string
  blocks: StructuredTextBlock[]
  createdAt?: string
  targetTokens?: number
  overlapTokens?: number
}): AttachmentSectionV1[] {
  const target = Math.max(200, input.targetTokens ?? ATTACHMENT_LIMITS_V2.targetChunkTokens)
  const overlap = Math.max(0, Math.min(target - 1, input.overlapTokens ?? ATTACHMENT_LIMITS_V2.chunkOverlapTokens))
  const createdAt = input.createdAt ?? new Date().toISOString()
  const sections: AttachmentSectionV1[] = []
  for (const block of input.blocks) {
    const words = tokenize(block.text)
    if (!words.length) continue
    const stride = Math.max(1, target - overlap)
    for (let cursor = 0; cursor < words.length; cursor += stride) {
      const slice = words.slice(cursor, cursor + target)
      const text = slice.join(' ').trim()
      if (!text) continue
      const ordinal = sections.length
      sections.push({
        id: `sec_${createHash('sha256').update(`${input.attachmentId}\0${ordinal}\0${text}`).digest('hex').slice(0, 24)}`,
        attachmentId: input.attachmentId,
        ordinal,
        text,
        tokenEstimate: slice.length,
        provenance: block.provenance ?? {},
        createdAt
      })
      if (cursor + target >= words.length) break
    }
  }
  return sections
}

// CJK characters are useful retrieval units; Latin runs approximate model
// tokens at four characters each so chunks remain safely bounded.
function tokenize(text: string): string[] {
  return text.normalize('NFC').match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{1,4}/gu) ?? []
}
