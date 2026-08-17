import { isDeepSeekHost } from '../model/model-error-probe.js'
import type { WebProvider, WebSearchRequest, WebSearchResult } from '../../ports/web-provider.js'
import { sourceIdFor } from '../../ports/web-provider.js'

const DEFAULT_DEEPSEEK_RESPONSES_BASE_URL = 'https://api.deepseek.com'

type DeepSeekResponsesWebProviderOptions = {
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  nowIso?: () => string
}

type Citation = {
  url: string
  title?: string
  snippet?: string
}

type DeepSeekSearchPayload = {
  citations: Citation[]
  summary?: string
}

/** Uses DeepSeek's server-side Responses web_search without changing the chat model protocol. */
export class DeepSeekResponsesWebProvider implements WebProvider {
  readonly id = 'deepseek-responses'
  private readonly fetchImpl: typeof fetch
  private readonly nowIso: () => string

  constructor(private readonly options: DeepSeekResponsesWebProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
  }

  async search(request: WebSearchRequest): Promise<WebSearchResult[]> {
    if (!isDeepSeekResponsesWebSearchConfig(this.options)) {
      throw new Error('DeepSeek Responses web search is unavailable for this provider or model.')
    }
    const response = await this.fetchImpl(deepSeekResponsesUrl(this.options.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        input: request.query,
        tools: [{ type: 'web_search' }],
        tool_choice: { type: 'web_search' },
        max_output_tokens: 4_096,
        stream: false
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)])
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`DeepSeek Responses web search returned invalid JSON (HTTP ${response.status}).`)
    }
    if (!response.ok) {
      throw new Error(`DeepSeek Responses web search failed with HTTP ${response.status}.`)
    }
    const searchPayload = searchPayloadFromResponse(payload)
    const citations = searchPayload.citations
    if (citations.length === 0) {
      throw new Error('DeepSeek Responses web search returned no cited results.')
    }
    return citations
      .slice(0, request.limit)
      .map((citation, index) => ({
        sourceId: sourceIdFor('search', `${request.query}:${citation.url}:${index}`),
        url: citation.url,
        ...(citation.title ? { title: citation.title } : {}),
        snippet: citation.snippet || (index === 0 ? searchPayload.summary : undefined) || citation.title || citation.url,
        retrievedAt: this.nowIso(),
        provider: this.id,
        rank: index + 1
      }))
  }
}

export function isDeepSeekResponsesWebSearchConfig(input: {
  baseUrl: string
  apiKey: string
  model: string
}): boolean {
  return isDeepSeekHost(input.baseUrl) &&
    Boolean(input.apiKey.trim()) &&
    /^(?:[^/]+\/)?deepseek-v4-(?:pro|flash)$/i.test(input.model.trim())
}

function deepSeekResponsesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim() || DEFAULT_DEEPSEEK_RESPONSES_BASE_URL
  try {
    const parsed = new URL(trimmed)
    if (isDeepSeekHost(parsed.origin)) return `${parsed.origin}/v1/responses`
  } catch {
    /* validated by isDeepSeekResponsesWebSearchConfig before this path is used */
  }
  return `${DEFAULT_DEEPSEEK_RESPONSES_BASE_URL}/v1/responses`
}

function searchPayloadFromResponse(payload: unknown): DeepSeekSearchPayload {
  const found: Citation[] = []
  const seen = new Set<string>()
  let summary = ''
  const addCitation = (input: Citation): void => {
    const url = normalizedSourceUrl(input.url)
    if (!url || seen.has(url)) return
    seen.add(url)
    found.push({
      url,
      ...(input.title ? { title: input.title } : {}),
      ...(input.snippet ? { snippet: input.snippet } : {})
    })
  }

  walk(payload, (record) => {
    const type = stringValue(record.type).toLowerCase()
    const url = stringValue(record.url)
    if (!url || (type && !type.includes('citation') && type !== 'url')) return
    addCitation({
      url,
      title: stringValue(record.title) || undefined,
      snippet: stringValue(record.snippet) || stringValue(record.text) || undefined
    })
  })

  const output = objectArrayValue(objectValue(payload).output)
  for (const item of output) {
    const type = stringValue(item.type).toLowerCase()
    if (type === 'message' && stringValue(item.status).toLowerCase() === 'completed') {
      for (const content of objectArrayValue(item.content)) {
        if (stringValue(content.type).toLowerCase() !== 'output_text') continue
        const text = stringValue(content.text)
        if (text.length > summary.length) summary = text
      }
      continue
    }
    if (type !== 'web_search_call' || stringValue(item.status).toLowerCase() !== 'completed') continue
    const action = objectValue(item.action)
    if (stringValue(action.type).toLowerCase() !== 'open_page') continue
    addCitation({ url: stringValue(action.url) })
  }

  return {
    citations: found,
    ...(summary ? { summary } : {})
  }
}

function normalizedSourceUrl(value: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null
  if (/^#ws_call_id=/i.test(parsed.hash)) parsed.hash = ''
  return parsed.href
}

function walk(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  visit(record)
  for (const entry of Object.values(record)) walk(entry, visit)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function objectArrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(objectValue).filter((record) => Object.keys(record).length > 0)
    : []
}
