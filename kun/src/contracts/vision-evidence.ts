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
    attachmentId: sanitizeAttachmentEvidenceText(evidence.attachmentId),
    summary: sanitizeAttachmentEvidenceText(evidence.summary),
    ocr: sanitizeAttachmentEvidenceText(evidence.ocr),
    layout: evidence.layout.map((item) => ({
      ...item,
      type: sanitizeAttachmentEvidenceText(item.type),
      ...(item.text !== undefined ? { text: sanitizeAttachmentEvidenceText(item.text) } : {})
    })),
    semantics: evidence.semantics.map(sanitizeAttachmentEvidenceText),
    visual: sanitizeAttachmentEvidenceText(evidence.visual),
    uncertainty: evidence.uncertainty.map(sanitizeAttachmentEvidenceText),
    source: {
      ...evidence.source,
      analyzer: sanitizeAttachmentEvidenceText(evidence.source.analyzer)
    }
  }
}

export function sanitizeAttachmentEvidenceText(value: string): string {
  return value
    .replace(
      /data:[^\s"'<>]+(?:[ \t]*\r?\n[ \t]*[A-Za-z0-9+/_=-]+)*/gi,
      '[data-url]'
    )
    .replace(
      /(?:https?|ftp|file):\/\/[^\s"'<>]+(?:[ \t]*\r?\n[ \t]*[A-Za-z0-9%._~!$&'()*+,;=:@/?+-]+)*/gi,
      redactUrlCandidate
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

function redactUrlCandidate(candidate: string): string {
  const lines = candidate.split(/(\r?\n[ \t]*)/)
  let consumed = lines[0]?.length ?? 0
  let consumingCredential = false
  for (let index = 1; index + 1 < lines.length; index += 2) {
    const continuation = lines[index + 1] ?? ''
    if (!consumingCredential && !urlHasCredentialAssignment(lines[0] ?? '')) break
    if (consumingCredential && !isEncodedCredentialContinuation(continuation)) {
      break
    }
    consumed += (lines[index]?.length ?? 0) + (lines[index + 1]?.length ?? 0)
    consumingCredential = true
  }
  return `[url]${candidate.slice(consumed)}`
}

function urlHasCredentialAssignment(value: string): boolean {
  return /[?&](?:x-amz-(?:signature|credential|security-token)|signature|sig|token|access_token|key)=/i.test(value)
}

function isEncodedCredentialContinuation(candidate: string): boolean {
  const compact = candidate.trim()
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)+\d*$/.test(compact)) return false
  if (/^[A-Fa-f0-9]{4,}$/.test(compact)) return true
  if (/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+$/.test(compact) && compact.length >= 16) return true
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) || compact.length < 4 || compact.length % 4 === 1) {
    return false
  }
  const encoding = /[-_]/.test(compact) ? 'base64url' : 'base64'
  const payload = compact.replace(/=+$/, '')
  const decoded = Buffer.from(compact, encoding)
  return decoded.length > 0 && decoded.toString(encoding).replace(/=+$/, '') === payload
}

function isEncodedData(candidate: string): boolean {
  const compact = candidate.replace(/\s/g, '')
  const payload = compact.replace(/=+$/, '')
  if (compact.length < 12 || compact.length % 4 === 1) return false
  if (compact.endsWith('=') || /[+/]/.test(payload)) return true
  if (!(/[A-Z]/.test(payload) && /[a-z]/.test(payload) && /\d/.test(payload))) return false
  const decoded = Buffer.from(compact, 'base64')
  if (decoded.length === 0 || decoded.toString('base64').replace(/=+$/, '') !== payload) return false
  const text = decoded.toString('utf8')
  if (Buffer.from(text, 'utf8').compare(decoded) !== 0) return false
  return /[^A-Za-z0-9]/.test(text) && [...text].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return character === '\n' || character === '\r' || character === '\t' || codePoint >= 0x20
  })
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
