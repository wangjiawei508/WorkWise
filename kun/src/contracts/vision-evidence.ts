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
      redactDataUrlCandidate
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
      (candidate) => isLineWrappedEncodedData(candidate) ? '[encoded-data]' : candidate
    )
    .replace(
      /(?<![A-Za-z0-9+/])(?:[A-Za-z0-9+/]{12,}={0,2}|[A-Za-z0-9+/]{6,}={1,2})(?![A-Za-z0-9+/=])/g,
      (candidate) => isEncodedData(candidate) ? '[encoded-data]' : candidate
    )
}

function redactUrlCandidate(candidate: string): string {
  const lines = candidate.split(/(\r?\n[ \t]*)/)
  const firstLine = lines[0] ?? ''
  let consumed = firstLine.length
  if (urlEndsWithCredentialAssignment(firstLine)) {
    consumed = consumeExplicitlyFramedContinuations(lines, consumed)
  }
  const suffix = candidate.slice(consumed)
  return `[url]${suffix ? sanitizeAttachmentEvidenceText(suffix) : ''}`
}

function redactDataUrlCandidate(candidate: string): string {
  const lines = candidate.split(/(\r?\n[ \t]*)/)
  const firstLine = lines[0] ?? ''
  const consumed = /;base64,$/i.test(firstLine)
    ? consumeVerifiedEncodedContinuations(lines, firstLine.length)
    : firstLine.length
  return `[data-url]${candidate.slice(consumed)}`
}

function consumeExplicitlyFramedContinuations(lines: string[], initial: number): number {
  return consumeVerifiedEncodedContinuations(lines, initial)
}

function consumeVerifiedEncodedContinuations(lines: string[], initial: number): number {
  let offset = lines[0]?.length ?? 0
  let startIndex = 1
  while (startIndex + 1 < lines.length && offset < initial) {
    offset += (lines[startIndex]?.length ?? 0) + (lines[startIndex + 1]?.length ?? 0)
    startIndex += 2
  }
  if (offset !== initial) return initial

  const firstSeparator = lines[startIndex] ?? ''
  const firstFragment = lines[startIndex + 1] ?? ''
  if (!/^\r?\n[ \t]*$/.test(firstSeparator)) return initial

  const firstKind = encodedContinuationKind(firstFragment)
  if (firstKind === 'explicit-secret') {
    return initial + firstSeparator.length + firstFragment.length
  }
  if (firstKind === 'base64url') {
    let encodedLength = firstFragment.length
    let encodedValue = firstFragment
    for (let index = startIndex + 2; index + 1 < lines.length; index += 2) {
      const separator = lines[index] ?? ''
      const fragment = lines[index + 1] ?? ''
      if (!/^\r?\n[ \t]*$/.test(separator)) break
      if (encodedContinuationKind(fragment) === 'base64url') {
        encodedLength += separator.length + fragment.length
        encodedValue += fragment
        continue
      }
      if (/^[A-Za-z0-9]{1,3}$/.test(fragment) && isRoundTripBase64Url(`${encodedValue}${fragment}`)) {
        encodedLength += separator.length + fragment.length
      }
      break
    }
    return initial + firstSeparator.length + encodedLength
  }
  if (!firstKind && /^[0-9a-f]+$/i.test(firstFragment)) return initial

  const fragments: string[] = []
  let verifiedLength = 0
  let wrapWidth: number | null = null
  for (let index = startIndex; index + 1 < lines.length; index += 2) {
    const separator = lines[index] ?? ''
    const fragment = lines[index + 1] ?? ''
    if (!/^\r?\n[ \t]*$/.test(separator) || !/^[A-Za-z0-9+/]+={0,2}$/.test(fragment)) break
    if (wrapWidth === null) wrapWidth = fragment.length
    if (fragment.length > wrapWidth) break
    fragments.push(fragment)
    verifiedLength += separator.length + fragment.length
    if (fragment.length < wrapWidth) break
  }
  if (fragments.length >= 2 && isLineWrappedEncodedData(fragments.join('\n'))) {
    return initial + verifiedLength
  }
  if (firstKind === 'base64') return initial + firstSeparator.length + firstFragment.length
  return initial
}

function urlEndsWithCredentialAssignment(value: string): boolean {
  return /[?&](?:x-amz-(?:signature|credential|security-token)|signature|sig|token|access_token|key)=$/i.test(value)
}

function encodedContinuationKind(candidate: string): 'base64' | 'base64url' | 'explicit-secret' | null {
  if (/(?:^|[-_])(?:secret|signature|credential|access[-_]?token)(?:$|[-_])/i.test(candidate)) {
    return 'explicit-secret'
  }
  if (candidate.length < 4) return null
  const normalized = candidate.replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return null
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const decoded = Buffer.from(padded, 'base64')
  if (decoded.length === 0) return null
  if (decoded.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) return null
  if (/[-_]/.test(candidate)) {
    return candidate.length >= 10 && !looksLikeOcrIdentifier(candidate) ? 'base64url' : null
  }
  if (/[+/=]/.test(candidate)) {
    return /[+=]/.test(candidate) || (candidate.match(/\//g)?.length ?? 0) > 1
      ? 'base64'
      : null
  }
  const text = decoded.toString('utf8')
  if (Buffer.from(text, 'utf8').compare(decoded) !== 0) return null
  return /^[A-Za-z0-9]+$/.test(text) && [...text].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return character === '\n' || character === '\r' || character === '\t' || codePoint >= 0x20
  }) ? 'base64' : null
}

function isRoundTripBase64Url(candidate: string): boolean {
  const normalized = candidate.replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+$/.test(normalized)) return false
  const decoded = Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64')
  return decoded.length > 0 &&
    decoded.toString('base64').replace(/=+$/, '') === normalized.replace(/=+$/, '')
}

function looksLikeOcrIdentifier(candidate: string): boolean {
  return candidate.split(/[-_/]/).every((segment) =>
    /^(?:[A-Z][a-z]{2,}(?:[A-Z][a-z]{2,})*(?:[A-Z]?\d+)?|[A-Z]\d+)$/.test(segment)
  )
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
  if (fragments.every(looksLikeOcrIdentifier)) return false
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
  const minimumLength = compact.endsWith('=') ? 8 : 12
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
