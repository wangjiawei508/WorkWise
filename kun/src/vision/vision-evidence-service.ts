import { createHash } from 'node:crypto'
import { AttachmentEvidence, type VisionEvidenceInput, type VisionEvidencePort } from '../contracts/vision-evidence.js'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_CACHE_ENTRIES = 64

type FetchLike = typeof fetch

type InflightAnalysis = {
  promise: Promise<AttachmentEvidence>
  controller: AbortController
  waiters: Set<symbol>
  settled: boolean
}

export type VisionEvidenceConfig = {
  enabled: boolean
  endpoint: string
  timeoutMs?: number
  analyzer?: string
}

export function normalizeVisionEvidenceEndpoint(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('vision evidence endpoint is invalid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('vision evidence endpoint must use HTTP or HTTPS')
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new Error('vision evidence endpoint must use a loopback IP address')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('vision evidence endpoint cannot contain credentials, query parameters, or fragments')
  }
  return parsed.toString()
}

export class HttpVisionEvidenceService implements VisionEvidencePort {
  private readonly cache = new Map<string, AttachmentEvidence>()
  private readonly inflight = new Map<string, InflightAnalysis>()
  private readonly endpoint: string
  private readonly configFingerprint: string
  private readonly maxCacheEntries: number

  constructor(private readonly config: VisionEvidenceConfig, private readonly options: {
    fetch?: FetchLike
    maxCacheEntries?: number
  } = {}) {
    if (!config.enabled) throw new Error('vision evidence is disabled')
    this.endpoint = normalizeVisionEvidenceEndpoint(config.endpoint)
    if (!this.endpoint) throw new Error('vision evidence endpoint is not configured')
    this.maxCacheEntries = normalizeCacheEntries(options.maxCacheEntries)
    this.configFingerprint = createHash('sha256')
      .update(JSON.stringify({ endpoint: this.endpoint, analyzer: config.analyzer ?? '', timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS }))
      .digest('hex')
  }

  analyze(input: VisionEvidenceInput): Promise<AttachmentEvidence> {
    try {
      validateImage(input.mimeType, input.data)
    } catch (error) {
      return Promise.reject(error)
    }
    if (input.signal.aborted) {
      return Promise.reject(new Error('attachment_analysis_unavailable: vision evidence analysis was cancelled'))
    }
    const key = createHash('sha256')
      .update(input.data)
      .update('\0')
      .update(this.configFingerprint)
      .digest('hex')
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Promise.resolve({ ...cached, attachmentId: input.attachmentId })
    }
    const pending = this.inflight.get(key)
    if (pending) return this.waitForAnalysis(pending, input.attachmentId, input.signal)
    const controller = new AbortController()
    const created: InflightAnalysis = {
      controller,
      waiters: new Set<symbol>(),
      settled: false,
      promise: Promise.resolve(undefined as never)
    }
    created.promise = this.request(input, controller)
      .then((evidence) => {
        this.cache.set(key, evidence)
        while (this.cache.size > this.maxCacheEntries) {
          const oldest = this.cache.keys().next().value
          if (typeof oldest !== 'string') break
          this.cache.delete(oldest)
        }
        return evidence
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, created)
    created.promise.finally(() => { created.settled = true }).catch(() => undefined)
    return this.waitForAnalysis(created, input.attachmentId, input.signal)
  }

  private waitForAnalysis(
    pending: InflightAnalysis,
    attachmentId: string,
    signal: AbortSignal
  ): Promise<AttachmentEvidence> {
    const waiter = Symbol('vision-evidence-waiter')
    pending.waiters.add(waiter)
    return new Promise<AttachmentEvidence>((resolve, reject) => {
      let settled = false
      const release = (): void => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        pending.waiters.delete(waiter)
        if (pending.waiters.size === 0 && !pending.settled) {
          pending.controller.abort('all_waiters_cancelled')
        }
      }
      const onAbort = (): void => {
        release()
        reject(new Error('attachment_analysis_unavailable: vision evidence analysis was cancelled'))
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) {
        onAbort()
        return
      }
      pending.promise.then(
        (evidence) => {
          release()
          resolve({ ...evidence, attachmentId })
        },
        (error) => {
          release()
          reject(error)
        }
      )
    })
  }

  private async request(input: VisionEvidenceInput, controller: AbortController): Promise<AttachmentEvidence> {
    const signal = controller.signal
    const timer = setTimeout(() => controller.abort('timeout'), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    try {
      const response = await (this.options.fetch ?? fetch)(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          attachmentId: input.attachmentId,
          name: input.name,
          mimeType: input.mimeType,
          dataBase64: input.data.toString('base64')
        }),
        signal,
        redirect: 'error'
      })
      const text = await readResponseText(response, MAX_RESPONSE_BYTES, signal)
      if (!response.ok) throw new Error(`vision evidence analyzer failed (${response.status})`)
      const raw = JSON.parse(text) as Record<string, unknown>
      return AttachmentEvidence.parse({
        ...raw,
        version: 1,
        attachmentId: input.attachmentId,
        source: {
          kind: 'configured-endpoint',
          analyzer: this.config.analyzer?.trim() || 'workwise-vision-evidence',
          configFingerprint: this.configFingerprint
        },
        status: 'ready'
      })
    } catch (error) {
      if (signal.aborted) throw new Error('attachment_analysis_unavailable: vision evidence analysis timed out or was cancelled')
      if (error instanceof SyntaxError) throw new Error('attachment_analysis_unavailable: analyzer returned invalid JSON')
      throw new Error(`attachment_analysis_unavailable: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

function normalizeCacheEntries(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_CACHE_ENTRIES
  return Math.min(DEFAULT_CACHE_ENTRIES, Math.max(0, Math.trunc(value)))
}

async function readResponseText(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await abortable(response.text(), signal)
    if (Buffer.byteLength(text) > maxBytes) throw new Error('vision evidence response exceeds the size limit')
    return text
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await abortable(reader.read(), signal)
      if (next.done) break
      if (!next.value) continue
      total += next.value.byteLength
      if (total > maxBytes) {
        try { await reader.cancel('response_size_limit') } catch { /* preserve the size-limit error */ }
        throw new Error('vision evidence response exceeds the size limit')
      }
      chunks.push(next.value)
    }
  } catch (error) {
    if (signal.aborted) {
      try { await reader.cancel('aborted') } catch { /* preserve the timeout/cancellation error */ }
    }
    throw error
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString('utf8')
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason ?? new Error('aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

function validateImage(mimeType: string, data: Buffer): void {
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
    throw new Error('attachment_analysis_unavailable: image exceeds the analysis size limit')
  }
  const actual = sniffImageMimeType(data)
  if (!actual || actual !== mimeType.toLowerCase()) {
    throw new Error('attachment_analysis_unavailable: image MIME type does not match its content')
  }
}

function sniffImageMimeType(data: Buffer): string | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.subarray(0, 6).toString('ascii') === 'GIF87a' || data.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}
