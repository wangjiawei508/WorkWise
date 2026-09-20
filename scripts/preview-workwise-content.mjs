import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTENT_FILES, sha256 } from './workwise-content-deploy.mjs'

const ORIGIN = 'https://www.railwise.cn'
const RESOURCE_PATH = /^\/(?:css|js|fonts|images|assets)\/[A-Za-z0-9_./-]+\.(?:css|js|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|ico)$/i

export function previewResourceUrl(rawUrl) {
  if (!rawUrl.startsWith('/') || rawUrl.startsWith('//') || /%(?:2e|2f|5c)|\\|(?:^|\/)\.\.(?:\/|$)/i.test(rawUrl)) return null
  const url = new URL(rawUrl, ORIGIN)
  if (url.origin !== ORIGIN || !RESOURCE_PATH.test(url.pathname)) return null
  return url
}

export function createPreviewServer(directory, fetcher = fetch) {
  const root = resolve(directory)
  const metadata = JSON.parse(readFileSync(resolve(root, 'render-metadata.json'), 'utf8'))
  const html = readFileSync(resolve(root, 'index.html'))
  if (sha256(html) !== metadata.htmlSha256) throw new Error('Preview HTML hash mismatch.')
  const local = new Map([['/products/workwise/', { data: html, type: 'text/html; charset=utf-8' }]])
  for (const relative of CONTENT_FILES.slice(1)) {
    const data = readFileSync(resolve(root, relative))
    if (sha256(data) !== metadata.files.find((file) => file.relative === relative)?.sha256) throw new Error(`Preview file hash mismatch: ${relative}`)
    local.set(`/${relative}`, { data, type: relative.endsWith('.json') ? 'application/json' : 'image/jpeg' })
  }
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Security-Policy', "form-action 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'")
    if (request.method !== 'GET') { response.writeHead(405); return response.end('Read-only preview') }
    if (request.url === '/') { response.writeHead(302, { Location: '/products/workwise/' }); return response.end() }
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    if (local.has(pathname)) {
      const file = local.get(pathname)
      response.writeHead(200, { 'Content-Type': file.type })
      return response.end(file.data)
    }
    const resource = previewResourceUrl(request.url)
    if (!resource) { response.writeHead(404); return response.end('Resource not allowed') }
    try {
      const upstream = await fetcher(resource, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000) })
      if (!upstream.ok || upstream.status >= 300) { response.writeHead(502); return response.end('Resource unavailable') }
      const length = Number(upstream.headers.get('content-length'))
      if (length > 15 * 1024 * 1024) { await upstream.body?.cancel(); response.writeHead(502); return response.end('Resource too large') }
      const data = Buffer.from(await upstream.arrayBuffer())
      if (data.length > 15 * 1024 * 1024) { response.writeHead(502); return response.end('Resource too large') }
      response.writeHead(200, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream' })
      response.end(data)
    } catch {
      response.writeHead(502)
      response.end('Resource unavailable')
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map()
  for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1])
  if (!args.get('--directory')) throw new Error('Required: --directory preview artifact directory')
  const port = Number(args.get('--port') || 4175)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port')
  createPreviewServer(args.get('--directory')).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/products/workwise/`))
}
