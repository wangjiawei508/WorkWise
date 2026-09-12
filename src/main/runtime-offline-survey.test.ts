import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

function bodyBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('local survey runtime without a model provider credential', () => {
  it('starts the authenticated runtime for deterministic work without requiring a model key', () => {
    const body = bodyBetween('async function ensureManagedRuntime(', 'const started = await waitForRuntimeHealth')
    expect(body).not.toContain('resolveConfiguredApiKey')
    expect(body).not.toContain('missing_api_key')
    expect(body).toContain('if (!runtime.autoStart)')
    expect(body).toContain('await adapter.ensureRunning(settings)')
    expect(body).toContain('await probeThreadApi(settings)')
  })

  it.each([
    ['async function restartManagedRuntimeForSettingsChange(', 'async function restartManagedRuntimeForMcpConfigChange('],
    ['async function restartManagedRuntimeForMcpConfigChange(', 'async function waitForManagedRuntimeReadyBeforeStop(']
  ])('keeps a credential-free local runtime available after %s', (start, end) => {
    const body = bodyBetween(start, end)
    expect(body).not.toContain('resolveConfiguredApiKey')
    expect(body).toContain('if (!runtime.autoStart) return')
    expect(body).toContain('if (!wasRunning) return')
  })
})
