import { z } from 'zod'

export const AttachmentEvidenceSource = z.object({
  kind: z.literal('configured-endpoint'),
  analyzer: z.string().min(1).max(120),
  configFingerprint: z.string().regex(/^[0-9a-f]{64}$/)
}).strict()

export const AttachmentEvidence = z.object({
  version: z.literal(1),
  attachmentId: z.string().min(1),
  summary: z.string().max(8_000),
  ocr: z.string().max(64_000),
  layout: z.array(z.object({
    type: z.string().min(1).max(64),
    text: z.string().max(4_000).optional(),
    boundingBox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional()
  }).strict()).max(500),
  semantics: z.array(z.string().max(2_000)).max(100),
  visual: z.string().max(16_000),
  uncertainty: z.array(z.string().max(2_000)).max(100),
  source: AttachmentEvidenceSource,
  status: z.literal('ready')
}).strict()
export type AttachmentEvidence = z.infer<typeof AttachmentEvidence>

export type VisionEvidenceInput = {
  attachmentId: string
  name: string
  mimeType: string
  data: Buffer
  signal: AbortSignal
}

export interface VisionEvidencePort {
  analyze(input: VisionEvidenceInput): Promise<AttachmentEvidence>
}
