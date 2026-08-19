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

export function sanitizeAttachmentEvidence(input: AttachmentEvidence): AttachmentEvidence {
  const evidence = AttachmentEvidence.parse(input)
  return {
    ...evidence,
    attachmentId: sanitizeEvidenceText(evidence.attachmentId),
    summary: sanitizeEvidenceText(evidence.summary),
    ocr: sanitizeEvidenceText(evidence.ocr),
    layout: evidence.layout.map((item) => ({
      ...item,
      type: sanitizeEvidenceText(item.type),
      ...(item.text !== undefined ? { text: sanitizeEvidenceText(item.text) } : {})
    })),
    semantics: evidence.semantics.map(sanitizeEvidenceText),
    visual: sanitizeEvidenceText(evidence.visual),
    uncertainty: evidence.uncertainty.map(sanitizeEvidenceText),
    source: {
      ...evidence.source,
      analyzer: sanitizeEvidenceText(evidence.source.analyzer)
    }
  }
}

function sanitizeEvidenceText(value: string): string {
  return value
    .replace(
      /data:[^\s"'<>]+(?:[ \t]*\r?\n[ \t]*[A-Za-z0-9+/_=-]+)*/gi,
      '[data-url]'
    )
    .replace(
      /(?:https?|ftp|file):\/\/[^\s"'<>]+(?:[ \t]*\r?\n[ \t]*[A-Za-z0-9%._~!$&'()*+,;=:@/?+-]+)*/gi,
      '[url]'
    )
    .replace(
      /\b(?:x-amz-(?:signature|credential|security-token)|signature|sig|token|access_token|key)\s*=\s*(?:\r?\n[ \t]*)?[^\s&"'<>]+/gi,
      '[signed-url-parameter]'
    )
    .replace(/(^|[\s("'`])\/(?:Users|private|tmp|var|home|Applications|Volumes|opt|etc)(?:\/[^/\r\n"'<>|]+)+/g, '$1[absolute-path]')
    .replace(/\b[A-Za-z]:\\(?:[^\\\r\n"'<>|]+\\)*[^\\\r\n"'<>|]*/g, '[absolute-path]')
    .replace(/[A-Za-z0-9+/_-]{80,}={0,2}/g, '[encoded-data]')
    .replace(
      /(?<![A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4,}[ \t]*\r?\n[ \t]*)+[A-Za-z0-9+/]{4,}={0,2}(?![A-Za-z0-9+/=])/g,
      (candidate) => isEncodedData(candidate) ? '[encoded-data]' : candidate
    )
    .replace(
      /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{12,}={0,2}(?![A-Za-z0-9+/=])/g,
      (candidate) => isEncodedData(candidate) ? '[encoded-data]' : candidate
    )
}

function isEncodedData(candidate: string): boolean {
  const compact = candidate.replace(/\s/g, '')
  const payload = compact.replace(/=+$/, '')
  if (compact.length < 12 || compact.length % 4 === 1) return false
  return compact.endsWith('=') ||
    /[+/]/.test(payload) ||
    (/[A-Z]/.test(payload) && /[a-z]/.test(payload) && /\d/.test(payload))
}

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
