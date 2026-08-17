import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { atomicWriteFile } from './durable-file'

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000

type FetchLike = typeof fetch

type SubmissionJob = {
  id: string
  status_url: string
}

type JobResponse = {
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  document_page?: number
  result?: {
    generated_text?: string
    result?: { text?: string } | string
  }
  error?: string
}

export type UnlimitedOcrParseResult = {
  markdownPath: string
  warnings: string[]
  durationMs: number
}

export function normalizeUnlimitedOcrServerUrl(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('Unlimited-OCR server URL is invalid.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unlimited-OCR server must use HTTP or HTTPS.')
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new Error('Unlimited-OCR server must use a loopback IP address.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Unlimited-OCR server URL cannot contain credentials, query parameters, or fragments.')
  }
  return parsed.origin
}

export class UnlimitedOcrService {
  constructor(private readonly options: {
    fetch?: FetchLike
    pollIntervalMs?: number
    timeoutMs?: number
  } = {}) {}

  async checkHealth(serverUrl: string): Promise<{ available: boolean; message?: string }> {
    let origin: string
    try {
      origin = normalizeUnlimitedOcrServerUrl(serverUrl)
    } catch (error) {
      return { available: false, message: error instanceof Error ? error.message : 'Unlimited-OCR server URL is invalid.' }
    }
    if (!origin) return { available: false, message: 'Unlimited-OCR server is not configured.' }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort('health_timeout'), 2_000)
    try {
      const response = await (this.options.fetch ?? fetch)(new URL('/health', origin), {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal
      })
      await response.body?.cancel()
      if (!response.ok) return { available: false, message: `Unlimited-OCR health check failed (HTTP ${response.status}).` }
      return { available: true }
    } catch (error) {
      if (controller.signal.aborted) return { available: false, message: 'Unlimited-OCR health check timed out.' }
      return { available: false, message: safeHealthErrorMessage(error) }
    } finally {
      clearTimeout(timeout)
    }
  }

  async parse(input: {
    serverUrl: string
    inputPath: string
    outputDirectory: string
    signal: AbortSignal
  }): Promise<UnlimitedOcrParseResult> {
    const startedAt = Date.now()
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const deadline = startedAt + timeoutMs
    return runWithParseDeadline(input.signal, timeoutMs, async (signal) => {
      const origin = normalizeUnlimitedOcrServerUrl(input.serverUrl)
      if (!origin) throw new Error('Unlimited-OCR server is not configured.')
      const fetcher = this.options.fetch ?? fetch
      const contents = await readFile(input.inputPath)
      throwIfAborted(signal)
      const form = new FormData()
      form.append('image', new Blob([contents], { type: 'application/pdf' }), basename(input.inputPath))
      form.append('text_input', '<|grounding|><image>Convert the document to markdown.')
      const submissionResponse = await fetcher(new URL('/v1/infer', origin), {
        method: 'POST',
        body: form,
        signal,
        redirect: 'error'
      })
      throwIfAborted(signal)
      const submission = await this.readJson(submissionResponse, signal) as {
        id?: string
        status_url?: string
        jobs?: SubmissionJob[]
      }
      const jobs = Array.isArray(submission.jobs)
        ? submission.jobs
        : submission.id && submission.status_url
          ? [{ id: submission.id, status_url: submission.status_url }]
          : []
      if (jobs.length === 0) throw new Error('Unlimited-OCR server returned no jobs.')

      const pages: Array<{ page: number; markdown: string }> = []
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index]
        const statusUrl = new URL(job.status_url, origin)
        if (statusUrl.origin !== origin) throw new Error('Unlimited-OCR job URL left the configured server origin.')
        const completed = await this.waitForJob(fetcher, statusUrl, signal, deadline)
        const markdown = extractJobText(completed)
        if (!markdown.trim()) throw new Error(`Unlimited-OCR returned an empty result for page ${index + 1}.`)
        pages.push({ page: completed.document_page ?? index + 1, markdown: markdown.trim() })
      }
      pages.sort((left, right) => left.page - right.page)
      const markdown = pages
        .map((page) => `<!-- page:${page.page} -->\n\n${page.markdown}`)
        .join('\n\n')
      const markdownPath = join(input.outputDirectory, 'unlimited-ocr.md')
      throwIfAborted(signal)
      await atomicWriteFile(markdownPath, `${markdown}\n`)
      throwIfAborted(signal)
      return { markdownPath, warnings: [], durationMs: Date.now() - startedAt }
    })
  }

  private async waitForJob(
    fetcher: FetchLike,
    url: URL,
    signal: AbortSignal,
    deadline: number
  ): Promise<JobResponse> {
    while (Date.now() < deadline) {
      throwIfAborted(signal)
      const response = await fetcher(url, { signal, redirect: 'error' })
      throwIfAborted(signal)
      const job = await this.readJson(response, signal) as JobResponse
      if (job.status === 'succeeded') return job
      if (job.status === 'failed') throw new Error(job.error || 'Unlimited-OCR job failed.')
      if (job.status !== 'queued' && job.status !== 'running') {
        throw new Error('Unlimited-OCR job returned an unknown status.')
      }
      await abortableDelay(this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, signal)
    }
    throw timeoutError()
  }

  private async readJson(response: Response, signal: AbortSignal): Promise<unknown> {
    const text = await readResponseText(response, MAX_RESPONSE_BYTES, signal)
    if (!response.ok) {
      let message = `Unlimited-OCR request failed (${response.status}).`
      try {
        const parsed = JSON.parse(text) as { message?: unknown }
        if (typeof parsed.message === 'string' && parsed.message.trim()) message = parsed.message.trim().slice(0, 240)
      } catch {
        // Keep the stable status-only fallback.
      }
      throw new Error(message)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('Unlimited-OCR server returned invalid JSON.')
    }
  }
}

async function readResponseText(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  throwIfAborted(signal)
  const advertisedBytes = Number(response.headers.get('content-length'))
  if (Number.isFinite(advertisedBytes) && advertisedBytes > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error('Unlimited-OCR response exceeded the size limit.')
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  const onAbort = (): void => {
    void reader.cancel(signal.reason).catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      throwIfAborted(signal)
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error('Unlimited-OCR response exceeded the size limit.')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    if (signal.aborted) throw abortReason(signal)
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

function extractJobText(job: JobResponse): string {
  const nested = job.result?.result
  if (nested && typeof nested === 'object' && typeof nested.text === 'string') return nested.text
  if (typeof nested === 'string') return nested
  return job.result?.generated_text ?? ''
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const timer = setTimeout(finish, Math.max(0, milliseconds))
    const onAbort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function runWithParseDeadline<T>(
  callerSignal: AbortSignal,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (callerSignal.aborted) throw cancellationError()
  if (!(timeoutMs > 0)) throw timeoutError()

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let onCallerAbort: (() => void) | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = timeoutError()
      reject(error)
      controller.abort(error)
    }, timeoutMs)
  })
  const cancellationPromise = new Promise<never>((_, reject) => {
    onCallerAbort = () => {
      const error = cancellationError()
      reject(error)
      controller.abort(error)
    }
    callerSignal.addEventListener('abort', onCallerAbort, { once: true })
  })

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise, cancellationPromise])
  } finally {
    clearTimeout(timeout)
    if (onCallerAbort) callerSignal.removeEventListener('abort', onCallerAbort)
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : cancellationError()
}

function cancellationError(): DOMException {
  return new DOMException('Unlimited-OCR parsing was cancelled.', 'AbortError')
}

function timeoutError(): Error {
  return new Error('Unlimited-OCR parsing timed out.')
}

function safeHealthErrorMessage(error: unknown): string {
  const fallback = 'Unlimited-OCR health check failed.'
  if (!(error instanceof Error) || !error.message.trim()) return fallback
  return error.message
    .replace(/\bhttps?:\/\/[^\s]+/gi, '[url]')
    .replace(/(?:[A-Za-z]:)?[\\/](?:[^\s/\\]+[\\/])+[^\s/\\]+/g, '[path]')
    .slice(0, 240) || fallback
}
