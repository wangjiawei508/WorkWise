import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import type { FlowDefinitionV1, FlowNodeV1, FlowRunV1 } from '../contracts/flow.js'
import type { ModelClient, ModelRequest } from '../ports/model-client.js'
import { buildRuntimeFlowAdapters } from './runtime-adapters.js'

class FakeModel implements ModelClient {
  readonly provider = 'test'; readonly model = 'test-model'; constructor(private readonly outputs: string[]) {}
  async *stream(_request: ModelRequest) { yield { kind: 'assistant_text_delta' as const, text: this.outputs.shift() ?? '' }; yield { kind: 'completed' as const, stopReason: 'stop' as const } }
}
const policy = { timeoutMs: 2_000, retryAttempts: 0, retryBackoffMs: 0, errorBehavior: 'fail' as const, concurrencyLimit: 1, resumable: false, breakpoint: false }
const node = (type: string, config: Record<string, unknown> = {}): FlowNodeV1 => ({ id: type, type, label: type, position: { x: 0, y: 0 }, bindings: {}, config, policy, disabled: false })
const run = { id: 'run', flowId: 'flow', versionId: 'v1', status: 'running', input: {}, invocationStack: [], startedAt: '', updatedAt: '' } as FlowRunV1
const definition = (workspace?: string) => ({ id: 'flow', workspace } as FlowDefinitionV1)
const context = (type: string, input: unknown, workspace?: string, config?: Record<string, unknown>) => ({ run, definition: definition(workspace), node: node(type, config), input, signal: new AbortController().signal })

describe('Runtime-backed Flow adapters', () => {
  it('runs Agent, classifier, extraction, and subagent through existing Runtime ports', async () => {
    const runSubagent = vi.fn(async () => ({ status: 'completed', summary: 'child done' })); const adapters = buildRuntimeFlowAdapters({ model: new FakeModel(['answer', '{"category":"bid"}', '```json\n{"amount":2}\n```']), defaultModel: 'default', runSubagent })
    await expect(adapters.get('agent')!(context('agent', { prompt: 'hello' }))).resolves.toMatchObject({ kind: 'output', output: { text: 'answer' } })
    await expect(adapters.get('classification')!(context('classification', 'classify'))).resolves.toEqual({ kind: 'output', output: { category: 'bid' } })
    await expect(adapters.get('parameter_extraction')!(context('parameter_extraction', 'extract'))).resolves.toEqual({ kind: 'output', output: { amount: 2 } })
    await expect(adapters.get('subagent')!(context('subagent', 'delegate', '/workspace'))).resolves.toMatchObject({ output: { summary: 'child done' } }); expect(runSubagent).toHaveBeenCalled()
  })
  it('retrieves scoped document sections and bounds HTTP behavior', async () => {
    const searchSections = vi.fn(async () => [{ id: 's1', text: 'clause', provenance: { page: 9 } }]); const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })); const adapters = buildRuntimeFlowAdapters({ model: new FakeModel([]), defaultModel: 'default', attachments: { searchSections } as never, fetch })
    await expect(adapters.get('knowledge_retrieval')!(context('knowledge_retrieval', { attachmentId: 'att_1', query: 'clause' }, '/workspace'))).resolves.toMatchObject({ output: { untrusted: true, results: [{ provenance: { page: 9 } }] } }); expect(searchSections).toHaveBeenCalledWith('att_1', 'clause', { workspace: '/workspace' }, 8)
    await expect(adapters.get('http')!(context('http', {}, undefined, { url: 'https://example.com/api' }))).resolves.toMatchObject({ output: { status: 200, body: { ok: true } } })
    await expect(adapters.get('http')!(context('http', {}, undefined, { url: 'http://example.com' }))).rejects.toThrow('requires HTTPS')
  })
  it('creates contained real DOCX, XLSX, PDF, and PPTX artifacts', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-flow-output-')); const adapters = buildRuntimeFlowAdapters({ model: new FakeModel([]), defaultModel: 'default' })
    for (const format of ['docx', 'xlsx', 'pdf', 'pptx'] as const) {
      const result = await adapters.get(`${format}_output`)!(context(`${format}_output`, format === 'xlsx' ? [{ a: 1, b: 2 }] : 'Tender output', workspace)) as { kind: 'output'; output: { path: string } }
      const bytes = await readFile(result.output.path); expect(bytes.length).toBeGreaterThan(100)
      if (format === 'pdf') expect(bytes.subarray(0, 8).toString()).toBe('%PDF-1.4')
      else { const zip = await JSZip.loadAsync(bytes); expect(Object.keys(zip.files).length).toBeGreaterThan(2) }
    }
    await expect(adapters.get('docx_output')!(context('docx_output', 'bad', workspace, { outputPath: '../escape.docx' }))).rejects.toThrow('escapes')
  })
})
