type QueryValue = string | number | boolean | null | undefined
export type Obj = Record<string, unknown>

type CallOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  query?: Record<string, QueryValue>
  body?: unknown
  timeoutMs?: number
}

export class OsApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = "OsApiError"
    this.status = status
    this.details = details
  }
}

export function obj(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Obj
}

export function list(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(obj).filter((item): item is Obj => Boolean(item))
}

export function text(value: unknown) {
  if (value === undefined || value === null) return ""
  return String(value)
}

export function first(item: Obj | null | undefined, keys: string[]) {
  return text(keys.map((key) => item?.[key]).find((value) => value !== undefined && value !== null && value !== ""))
}

export function num(value: unknown) {
  return Number(value || 0)
}

function baseUrl() {
  return (process.env.RAILWISE_OS_API_BASE || "http://railwise-os-api:3001/api/v1").replace(/\/+$/, "")
}

function appendQuery(url: URL, query: Record<string, QueryValue> = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    url.searchParams.set(key, String(value))
  }
}

async function parseResponse(res: Response) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export async function callOsApi(path: string, options: CallOptions = {}) {
  const url = new URL(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`)
  appendQuery(url, options.query)

  const token = process.env.RAILWISE_OS_INTERNAL_TOKEN || ""
  const headers: Record<string, string> = { Accept: "application/json" }
  if (token) headers["X-Railwise-Internal-Token"] = token
  if (options.body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(url, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 60_000),
  })
  const payload = await parseResponse(res)
  const data = obj(payload)
  const code = typeof data?.code === "number" ? data.code : res.status

  if (!res.ok || (data && typeof data.code === "number" && data.code !== 200)) {
    throw new OsApiError(first(data, ["message"]) || `OS API request failed: ${url.pathname}`, code, payload)
  }

  return data?.data ?? payload
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function clipText(value: unknown, maxChars = 8000) {
  const text = typeof value === "string" ? value : prettyJson(value)
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text
}
