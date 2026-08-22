#!/usr/bin/env node

import { mkdir, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const [serverUrl, inputArg, outputArg] = process.argv.slice(2)
if (!serverUrl || !inputArg) {
  console.error('Usage: node scripts/run-real-unlimited-ocr-acceptance.mjs <loopback-url> <pdf> [output-dir]')
  process.exit(2)
}

const root = resolve(new URL('..', import.meta.url).pathname)
const inputPath = resolve(inputArg)
const outputDirectory = resolve(outputArg || join('/private/tmp', `workwise-real-uocr-${Date.now()}`))
const bundled = await build({
  entryPoints: [join(root, 'src/main/services/unlimited-ocr-service.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  absWorkingDir: root,
  logLevel: 'silent'
})
const serviceModule = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const service = new serviceModule.UnlimitedOcrService({ timeoutMs: 20 * 60 * 1000, pollIntervalMs: 100 })
const health = await service.checkHealth(serverUrl)
if (!health.available) throw new Error(`Unlimited-OCR health check failed: ${health.message}`)

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
const result = await service.parse({ serverUrl, inputPath, outputDirectory, signal: new AbortController().signal })
const markdown = await readFile(result.markdownPath, 'utf8')
const pageMarkers = [...markdown.matchAll(/^<!-- page:(\d+) -->$/gm)].map((match) => Number(match[1]))
const expectedPages = [...new Set(pageMarkers)].sort((left, right) => left - right)
const inputHash = createHash('sha256').update(await readFile(inputPath)).digest('hex')
console.log(JSON.stringify({
  input: inputPath,
  inputSha256: inputHash,
  output: result.markdownPath,
  health,
  engineVersion: result.engineVersion,
  durationMs: result.durationMs,
  pageMarkers,
  pageCount: pageMarkers.length,
  pageSequenceValid: pageMarkers.length > 0 && pageMarkers.every((page, index) => page === index + 1),
  markdownBytes: Buffer.byteLength(markdown),
  nonEmptyPages: pageMarkers.filter((page) => markdown.includes(`<!-- page:${page} -->\n\n`)).length,
  expectedPages
}, null, 2))
