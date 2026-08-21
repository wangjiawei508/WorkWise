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
  return redactFramedUrls(value)
    .replace(
      /\b(?:x-amz-(?:signature|credential|security-token)|signature|sig|token|access_token|key)\s*=\s*(?:\r?\n[ \t]*)?[^\s&"'<>]+/gi,
      '[signed-url-parameter]'
    )
    .replace(/(^|[\s("'`])\/(?:Users|private|tmp|var|home|Applications|Volumes|opt|etc)(?:\/[^/\r\n"'<>|]+)+/g, '$1[absolute-path]')
    .replace(/\b[A-Za-z]:\\(?:[^\\\r\n"'<>|]+\\)*[^\\\r\n"'<>|]*/g, '[absolute-path]')
    .replace(/[A-Za-z0-9+/_-]{80,}={0,2}/g, '[encoded-data]')
    .replace(
      /(?<![A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4,}[ \t]*\r?\n[ \t]*)+[A-Za-z0-9+/]{4,}={0,2}(?![A-Za-z0-9+/=])/g,
      (candidate) => isLineWrappedEncodedData(candidate) ? '[encoded-data]' : candidate
    )
    .replace(
      /(?<![A-Za-z0-9+/])(?:[A-Za-z0-9+/]{12,}={0,2}|[A-Za-z0-9+/]{2,}={1,2})(?![A-Za-z0-9+/=])/g,
      (candidate) => isEncodedData(candidate) ? '[encoded-data]' : candidate
    )
}

function redactFramedUrls(value: string): string {
  const pattern = /(?<![A-Za-z0-9_])data:[^\s"'<>]+|(?:https?|ftp|file):\/\/[^\s"'<>]+/gi
  let output = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    const candidate = match[0]
    output += value.slice(cursor, match.index)
    output += candidate.toLowerCase().startsWith('data:') ? '[data-url]' : '[url]'

    let consumed = pattern.lastIndex
    const framedKind = /;base64,$/i.test(candidate)
      ? 'data'
      : urlEndsWithCredentialAssignment(candidate)
        ? 'credential'
        : null
    if (framedKind) {
      consumed = consumeVerifiedEncodedContinuations(value, consumed, framedKind)
    }
    cursor = consumed
    pattern.lastIndex = consumed
  }

  return output + value.slice(cursor)
}

function consumeVerifiedEncodedContinuations(
  value: string,
  initial: number,
  kind: 'data' | 'credential'
): number {
  const matcher = /[ \t]*\r?\n[ \t]*([A-Za-z0-9+/_=-]+)[ \t]*(?=\r?\n|$)/y
  const continuations: Array<{ fragment: string; end: number }> = []
  let cursor = initial

  while (cursor < value.length) {
    matcher.lastIndex = cursor
    const match = matcher.exec(value)
    if (!match) break
    continuations.push({ fragment: match[1] ?? '', end: matcher.lastIndex })
    cursor = matcher.lastIndex
  }
  const first = continuations[0]?.fragment ?? ''
  if (!first) return initial
  if (isExplicitSecret(first)) return continuations[0]?.end ?? initial

  const wrapWidth = first.length
  const encodedFragments: string[] = []
  const base64UrlWrapped = /[-_]/.test(first)
  let candidateCompact = ''
  for (const [index, continuation] of continuations.entries()) {
    const fragment = continuation.fragment
    if (index > 0 && fragment.length > wrapWidth) break
    const continuationOfBase64Url = base64UrlWrapped && index > 0 && fragment.length <= wrapWidth
    const explicitHex = /^[0-9a-f]{8,}$/i.test(fragment)
    if (!continuationOfBase64Url && !explicitHex && looksLikeLikelyOcr(fragment)) {
      if (index === 0 || !isRoundTripEncodedData(`${candidateCompact}${fragment}`)) break
    }
    encodedFragments.push(fragment)
    candidateCompact += fragment
  }

  let longestVerified = 0
  let compact = ''
  for (let index = 0; index < encodedFragments.length; index += 1) {
    compact += encodedFragments[index]
    if (isRoundTripEncodedData(compact)) longestVerified = index + 1
  }
  if (longestVerified === 0) return initial
  return continuations[longestVerified - 1]?.end ?? initial
}

function urlEndsWithCredentialAssignment(value: string): boolean {
  return /[?&](?:x-amz-(?:signature|credential|security-token)|signature|sig|token|access_token|key)=$/i.test(value)
}

function isExplicitSecret(candidate: string): boolean {
  return /(?:^|[-_])(?:secret|signature|credential|access[-_]?token)(?:$|[-_])/i.test(candidate)
}

function isRoundTripEncodedData(candidate: string): boolean {
  const normalized = candidate.replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return false
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const decoded = Buffer.from(padded, 'base64')
  return decoded.length > 0 &&
    decoded.toString('base64').replace(/=+$/, '') === normalized.replace(/=+$/, '')
}

function looksLikeOcrIdentifier(candidate: string): boolean {
  return candidate.split(/[-_/]/).every((segment) =>
    /^(?:(?:[A-Z][a-z]{2,})+(?:(?:[A-Z][A-Za-z]*\d*)|\d+)?|[A-Z]{2,}\d*|[A-Z]\d+|\d+)$/.test(segment)
  )
}

function looksLikeLikelyOcr(candidate: string): boolean {
  return looksLikeOcrIdentifier(candidate) || /^[a-z]{3,}$/.test(candidate)
}

function isLineWrappedEncodedData(candidate: string): boolean {
  const fragments = candidate.trim().split(/\s+/)
  if (fragments.length < 2) return false
  const width = fragments[0]?.length ?? 0
  if (width < 4) return false
  if (/^[0-9a-f]+$/i.test(fragments[0] ?? '')) return false
  if (fragments.length === 2 && fragments[1]?.length !== width && !fragments[1]?.endsWith('=')) return false
  if (fragments.slice(0, -1).some((fragment) => fragment.length !== width)) return false
  if ((fragments.at(-1)?.length ?? 0) > width) return false
  const compact = fragments.join('')
  if (compact.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false
  if (/^[0-9a-f]+$/i.test(compact)) return false
  if (fragments.every(looksLikeLikelyOcr)) return false
  if (!/[a-z+/=]/.test(compact)) return false
  const decoded = Buffer.from(compact, 'base64')
  if (decoded.length === 0 || decoded.toString('base64').replace(/=+$/, '') !== compact.replace(/=+$/, '')) {
    return false
  }
  return true
}

function isEncodedData(candidate: string): boolean {
  const compact = candidate.replace(/\s/g, '')
  const payload = compact.replace(/=+$/, '')
  if (looksLikeLikelyOcr(compact)) return false
  const minimumLength = compact.endsWith('=') ? 4 : 12
  if (compact.length < minimumLength || compact.length % 4 === 1) return false
  const decoded = Buffer.from(compact, 'base64')
  if (decoded.length === 0 || decoded.toString('base64').replace(/=+$/, '') !== payload) return false
  if (compact.endsWith('=') || /[+/]/.test(payload)) return true
  if (!(/[A-Z]/.test(payload) && /[a-z]/.test(payload) && /\d/.test(payload))) return false
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
