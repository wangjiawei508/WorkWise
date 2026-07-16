import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { WriteKnowledgeBaseSettingsV1 } from '../../shared/app-settings'
import type { WriteInlineCompletionRequest } from '../../shared/write-inline-completion'
import type {
  WriteKnowledgeBaseStatus,
  WriteKnowledgeSearchResult,
  WriteKnowledgeSnippet as SharedWriteKnowledgeSnippet
} from '../../shared/workwise-api'
import { atomicWriteFile as durableWriteFile } from './durable-file'

const INDEX_TTL_MS = 6 * 60 * 60 * 1_000
const API_HEALTH_TTL_MS = 5 * 60 * 1_000
const API_TIMEOUT_MS = 1_200
const STATIC_TIMEOUT_MS = 2_500
const MAX_RESULTS = 3
const MAX_EXPLICIT_SEARCH_RESULTS = 24
const PAGE_TTL_MS = 24 * 60 * 60 * 1_000
const MAX_PAGE_CACHE_BYTES = 20 * 1024 * 1024

export type WriteKnowledgeSnippet = SharedWriteKnowledgeSnippet

export type WriteKnowledgeContext = {
  source: 'api' | 'static' | 'stale-cache' | 'unavailable'
  keywords: string[]
  snippets: WriteKnowledgeSnippet[]
  refreshedAt?: string
}

type StaticEntry = { title: string; url: string; type: string; summary: string }
type StaticCache = { entries: StaticEntry[]; etag?: string; fetchedAt: number }
type ApiResult = { title: string; url: string; snippet: string; score: number }
type PageEntry = { url: string; text: string; fetchedAt: number }
type PersistentCache = { version: 1; index: StaticCache | null; pages: PageEntry[] }

let staticCache: StaticCache | null = null
let apiHealth = { checkedAt: 0, available: true }
let pageCache = new Map<string, PageEntry>()
let persistentCacheLoaded = false
let lastContext: WriteKnowledgeContext | null = null

function persistentCachePath(): string {
  return process.env.WORKWISE_KB_CACHE_PATH?.trim() ||
    join(homedir(), '.workwise', 'cache', 'write-knowledge.json')
}

async function loadPersistentCache(): Promise<void> {
  if (persistentCacheLoaded) return
  persistentCacheLoaded = true
  if (!existsSync(persistentCachePath())) return
  try {
    const parsed = JSON.parse(await readFile(persistentCachePath(), 'utf8')) as PersistentCache
    if (parsed?.version !== 1) return
    if (parsed.index && Array.isArray(parsed.index.entries)) staticCache = parsed.index
    if (Array.isArray(parsed.pages)) {
      pageCache = new Map(parsed.pages
        .filter((entry) => entry && typeof entry.url === 'string' && typeof entry.text === 'string')
        .map((entry) => [entry.url, entry]))
    }
  } catch {
    // A corrupt cache is disposable and must never block writing.
  }
}

function trimmedPageEntries(): PageEntry[] {
  const entries = [...pageCache.values()].sort((a, b) => b.fetchedAt - a.fetchedAt)
  const kept: PageEntry[] = []
  let bytes = 0
  for (const entry of entries) {
    const size = Buffer.byteLength(entry.url) + Buffer.byteLength(entry.text)
    if (bytes + size > MAX_PAGE_CACHE_BYTES) continue
    bytes += size
    kept.push(entry)
  }
  return kept
}

async function persistCache(): Promise<void> {
  try {
    const path = persistentCachePath()
    await mkdir(dirname(path), { recursive: true })
    const pages = trimmedPageEntries()
    pageCache = new Map(pages.map((entry) => [entry.url, entry]))
    await durableWriteFile(
      path,
      `${JSON.stringify({ version: 1, index: staticCache, pages } satisfies PersistentCache)}\n`
    )
  } catch {
    // Cache persistence is opportunistic.
  }
}

function tokenize(text: string, maxTokens = 12): string[] {
  const safe = text
    .replace(/(?:[A-Za-z]:)?[\\/][\w .@~+\-/\\]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .slice(0, 800)
    .toLowerCase()
  const latin = safe.match(/[a-z][a-z0-9_-]{1,24}/g) ?? []
  const hanRuns = safe.match(/[\p{Script=Han}]{2,12}/gu) ?? []
  const han = hanRuns.flatMap((run) => {
    if (run.length <= 4) return [run]
    return [run, ...Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2))]
  })
  return [...new Set([...latin, ...han])].filter((word) => word.length > 1).slice(0, maxTokens)
}

export function buildKnowledgeQuery(request: WriteInlineCompletionRequest): string[] {
  return tokenize([
    request.context.currentLinePrefix,
    request.context.previousNonEmptyLine,
    request.context.nextLine,
    request.preview.local.slice(-360)
  ].join(' '))
}

function isAllowedPublicUrl(value: string, publicBaseUrl: string): boolean {
  try {
    const url = new URL(value)
    const base = new URL(publicBaseUrl)
    return url.protocol === 'https:' && url.origin === base.origin
  } catch {
    return false
  }
}

function parseStaticIndex(markdown: string, publicBaseUrl: string): StaticEntry[] {
  const entries: StaticEntry[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\s*-\s+\[([^\]]+)]\((https:\/\/[^)]+)\)(?:\s+\(([^)]+)\))?\s+-\s+(.+?)\s*$/.exec(line)
    if (!match || !isAllowedPublicUrl(match[2] ?? '', publicBaseUrl)) continue
    entries.push({
      title: (match[1] ?? '').trim(),
      url: (match[2] ?? '').trim(),
      type: (match[3] ?? '').trim(),
      summary: (match[4] ?? '').trim()
    })
  }
  return entries
}

function scoreEntry(entry: StaticEntry, keywords: string[]): number {
  const title = entry.title.toLowerCase()
  const haystack = `${title} ${entry.type} ${entry.summary}`.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (title.includes(keyword)) score += 4
    if (entry.type.toLowerCase().includes(keyword)) score += 2
    if (haystack.includes(keyword)) score += 1
  }
  return score
}

function rankStaticEntries(entries: StaticEntry[], keywords: string[]): Array<{ entry: StaticEntry; score: number }> {
  if (entries.length === 0 || keywords.length === 0) return []
  const documents = entries.map((entry) => {
    const tokens = tokenize(`${entry.title} ${entry.type} ${entry.summary}`, 80)
    return { entry, tokens }
  })
  const averageLength = documents.reduce((sum, document) => sum + document.tokens.length, 0) /
    Math.max(1, documents.length)
  const k1 = 1.2
  const b = 0.75
  return documents.map(({ entry, tokens }) => {
    let score = 0
    for (const keyword of keywords) {
      const termFrequency = tokens.filter((token) => token === keyword || token.includes(keyword)).length
      if (termFrequency === 0) continue
      const documentFrequency = documents.filter((document) =>
        document.tokens.some((token) => token === keyword || token.includes(keyword))
      ).length
      const inverseDocumentFrequency = Math.log(1 + (documents.length - documentFrequency + 0.5) /
        (documentFrequency + 0.5))
      const denominator = termFrequency + k1 * (1 - b + b * tokens.length / Math.max(1, averageLength))
      score += inverseDocumentFrequency * (termFrequency * (k1 + 1) / denominator)
      if (entry.title.toLowerCase().includes(keyword)) score += inverseDocumentFrequency * 1.6
    }
    return { entry, score }
  }).sort((a, b) => b.score - a.score)
}

function isKnowledgeListQuery(query: string): boolean {
  return /(哪些|什么|有什么|多少|列表|目录|分类|包含|全部|所有)/u.test(query)
}

function categorySummary(entries: StaticEntry[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const name = entry.type || '未分类'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))
}

function staticSnippet(entry: StaticEntry, score: number): WriteKnowledgeSnippet {
  return {
    title: entry.title,
    url: entry.url,
    text: [entry.type, entry.summary, pageCache.get(entry.url)?.text]
      .filter(Boolean).join(' · ').slice(0, 1_800),
    score,
    source: 'railwise-static'
  }
}

async function fetchStaticIndex(settings: WriteKnowledgeBaseSettingsV1): Promise<StaticCache | null> {
  await loadPersistentCache()
  const now = Date.now()
  if (staticCache && now - staticCache.fetchedAt < INDEX_TTL_MS) return staticCache
  const headers: Record<string, string> = { Accept: 'text/plain' }
  if (staticCache?.etag) headers['If-None-Match'] = staticCache.etag
  try {
    const response = await fetch(`${settings.publicBaseUrl}/llms-full.txt`, {
      headers,
      signal: AbortSignal.timeout(STATIC_TIMEOUT_MS)
    })
    if (response.status === 304 && staticCache) {
      staticCache = { ...staticCache, fetchedAt: now }
      return staticCache
    }
    if (!response.ok) return staticCache
    const text = await response.text()
    const entries = parseStaticIndex(text, settings.publicBaseUrl)
    if (entries.length === 0) return staticCache
    staticCache = {
      entries,
      etag: response.headers.get('etag') ?? undefined,
      fetchedAt: now
    }
    void persistCache()
    return staticCache
  } catch {
    return staticCache
  }
}

function pageTextFromHtml(html: string): string {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html
  return main
    .replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12_000)
}

async function refreshPageBody(url: string, settings: WriteKnowledgeBaseSettingsV1): Promise<void> {
  if (!isAllowedPublicUrl(url, settings.publicBaseUrl)) return
  const cached = pageCache.get(url)
  if (cached && Date.now() - cached.fetchedAt < PAGE_TTL_MS) return
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(STATIC_TIMEOUT_MS)
    })
    if (!response.ok) return
    const text = pageTextFromHtml(await response.text())
    if (text.length < 80) return
    pageCache.set(url, { url, text, fetchedAt: Date.now() })
    void persistCache()
  } catch {
    // Keep stale public content when offline.
  }
}

function validApiResults(value: unknown, settings: WriteKnowledgeBaseSettingsV1): ApiResult[] | null {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { results?: unknown }).results)
      ? (value as { results: unknown[] }).results
      : null
  if (!rows) return null
  const parsed: ApiResult[] = []
  for (const row of rows.slice(0, MAX_RESULTS)) {
    if (!row || typeof row !== 'object') return null
    const item = row as Record<string, unknown>
    if (
      typeof item.title !== 'string' || typeof item.url !== 'string' ||
      typeof item.snippet !== 'string' || typeof item.score !== 'number' ||
      !Number.isFinite(item.score) || !isAllowedPublicUrl(item.url, settings.publicBaseUrl)
    ) return null
    parsed.push({ title: item.title, url: item.url, snippet: item.snippet, score: item.score })
  }
  return parsed
}

async function searchApi(
  settings: WriteKnowledgeBaseSettingsV1,
  keywords: string[]
): Promise<ApiResult[] | null> {
  const now = Date.now()
  if (!apiHealth.available && now - apiHealth.checkedAt < API_HEALTH_TTL_MS) return null
  try {
    const response = await fetch(`${settings.apiBaseUrl}/v1/kb/search`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: keywords.join(' ').slice(0, 180), limit: MAX_RESULTS, visibility: 'public' }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error('Knowledge API unavailable')
    const results = validApiResults(await response.json(), settings)
    if (!results) throw new Error('Knowledge API returned an invalid response')
    apiHealth = { checkedAt: now, available: true }
    return results
  } catch {
    apiHealth = { checkedAt: now, available: false }
    return null
  }
}

export async function retrieveWriteKnowledgeContext(
  request: WriteInlineCompletionRequest,
  settings: WriteKnowledgeBaseSettingsV1
): Promise<WriteKnowledgeContext> {
  const keywords = buildKnowledgeQuery(request)
  if (!settings.enabled || keywords.length === 0) {
    const result: WriteKnowledgeContext = { source: 'unavailable', keywords, snippets: [] }
    lastContext = result
    return result
  }

  const api = await searchApi(settings, keywords)
  if (api?.length) {
    const result: WriteKnowledgeContext = {
      source: 'api',
      keywords,
      snippets: api.map((item) => ({
        title: item.title,
        url: item.url,
        text: item.snippet.slice(0, 900),
        score: item.score,
        source: 'railwise-api'
      }))
    }
    lastContext = result
    return result
  }

  const cache = await fetchStaticIndex(settings)
  if (!cache) {
    const result: WriteKnowledgeContext = { source: 'unavailable', keywords, snippets: [] }
    lastContext = result
    return result
  }
  const snippets = rankStaticEntries(cache.entries, keywords)
    .filter((candidate) => candidate.score > 0)
    .slice(0, MAX_RESULTS)
    .map(({ entry, score }) => ({
      title: entry.title,
      url: entry.url,
      text: [entry.type, entry.summary, pageCache.get(entry.url)?.text]
        .filter(Boolean).join(' · ').slice(0, 1_800),
      score,
      source: 'railwise-static' as const
    }))
  for (const snippet of snippets.slice(0, 2)) void refreshPageBody(snippet.url, settings)
  const result: WriteKnowledgeContext = {
    source: Date.now() - cache.fetchedAt > INDEX_TTL_MS ? 'stale-cache' : 'static',
    keywords,
    snippets,
    refreshedAt: new Date(cache.fetchedAt).toISOString()
  }
  lastContext = result
  return result
}

/** Explicit RailWise search for the Write assistant conversation. */
export async function searchWriteKnowledge(
  query: string,
  settings: WriteKnowledgeBaseSettingsV1
): Promise<WriteKnowledgeSearchResult> {
  const normalizedQuery = query.trim().slice(0, 800)
  const keywords = tokenize(normalizedQuery, 24)
  if (!settings.enabled || keywords.length === 0) {
    return { source: 'unavailable', keywords, snippets: [] }
  }

  const listQuery = isKnowledgeListQuery(normalizedQuery)
  if (!listQuery) {
    const api = await searchApi(settings, keywords)
    if (api?.length) {
      return {
        source: 'api',
        keywords,
        snippets: api.map((item) => ({
          title: item.title,
          url: item.url,
          text: item.snippet.slice(0, 1_800),
          score: item.score,
          source: 'railwise-api'
        }))
      }
    }
  }

  const cache = await fetchStaticIndex(settings)
  if (cache) {
    const ranked = listQuery
      ? cache.entries.map((entry, index) => ({ entry, score: Math.max(0, cache.entries.length - index) }))
      : rankStaticEntries(cache.entries, keywords).filter((candidate) => candidate.score > 0)
    const snippets = ranked
      .slice(0, listQuery ? MAX_EXPLICIT_SEARCH_RESULTS : MAX_RESULTS)
      .map(({ entry, score }) => staticSnippet(entry, score))
    for (const snippet of snippets.slice(0, 2)) void refreshPageBody(snippet.url, settings)
    return {
      source: Date.now() - cache.fetchedAt > INDEX_TTL_MS ? 'stale-cache' : 'static',
      keywords,
      snippets,
      totalEntries: cache.entries.length,
      ...(listQuery ? { categories: categorySummary(cache.entries) } : {}),
      refreshedAt: new Date(cache.fetchedAt).toISOString()
    }
  }

  const api = await searchApi(settings, keywords)
  if (api?.length) {
    return {
      source: 'api',
      keywords,
      snippets: api.map((item) => ({
        title: item.title,
        url: item.url,
        text: item.snippet.slice(0, 1_800),
        score: item.score,
        source: 'railwise-api'
      }))
    }
  }
  return { source: 'unavailable', keywords, snippets: [] }
}

export function getWriteKnowledgeBaseStatus(
  settings: WriteKnowledgeBaseSettingsV1
): WriteKnowledgeBaseStatus {
  if (!settings.enabled) return { state: 'disabled', referenceCount: 0 }
  const source = lastContext?.source
  const state = source === 'api' ? 'api'
    : source === 'static' ? 'static'
      : source === 'stale-cache' ? 'stale_cache'
        : staticCache ? 'static' : 'offline'
  return {
    state,
    lastUpdated: lastContext?.refreshedAt ?? (staticCache ? new Date(staticCache.fetchedAt).toISOString() : undefined),
    referenceCount: lastContext?.snippets.length ?? 0
  }
}

export async function refreshWriteKnowledgeBase(
  settings: WriteKnowledgeBaseSettingsV1
): Promise<WriteKnowledgeBaseStatus> {
  if (!settings.enabled) return { state: 'disabled', referenceCount: 0 }
  await loadPersistentCache()
  if (staticCache) staticCache = { ...staticCache, fetchedAt: 0 }
  apiHealth = { checkedAt: 0, available: true }
  const cache = await fetchStaticIndex(settings)
  if (cache) {
    lastContext = { source: 'static', keywords: [], snippets: [], refreshedAt: new Date(cache.fetchedAt).toISOString() }
  }
  return getWriteKnowledgeBaseStatus(settings)
}

export function clearWriteKnowledgeCache(): void {
  staticCache = null
  apiHealth = { checkedAt: 0, available: true }
  pageCache.clear()
  persistentCacheLoaded = false
  lastContext = null
}

export const _internals = {
  parseStaticIndex,
  validApiResults,
  tokenize,
  scoreEntry,
  rankStaticEntries,
  pageTextFromHtml,
  isKnowledgeListQuery,
  categorySummary
}
