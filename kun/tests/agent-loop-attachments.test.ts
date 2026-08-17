import { describe, expect, it } from 'vitest'
import { bootstrapThread, makeHarness } from './loop-test-harness.js'
import type { ModelClient, ModelRequest } from '../src/ports/model-client.js'
import type { AttachmentStore } from '../src/attachments/attachment-store.js'
import type { ModelCapabilityMetadata } from '../src/contracts/capabilities.js'
import type { VisionEvidencePort } from '../src/contracts/vision-evidence.js'

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function attachmentStore(): AttachmentStore {
  const metadata = {
    schemaVersion: 2 as const,
    id: 'att_image',
    name: 'evidence.png',
    originalFileName: 'evidence.png',
    mimeType: 'image/png',
    byteSize: pngBytes.byteLength,
    hash: 'image-hash',
    kind: 'image' as const,
    state: 'ready' as const,
    degradationReasons: [],
    parserWarnings: [],
    indexState: 'not_applicable' as const,
    threadIds: ['thr_1'],
    workspaces: ['/tmp'],
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z'
  }
  return {
    resolveMetadataV2: async () => metadata,
    resolveContent: async () => ({ ...metadata, data: pngBytes }),
  } as unknown as AttachmentStore
}

const textOnly: ModelCapabilityMetadata = {
  id: 'fake-text',
  inputModalities: ['text'],
  outputModalities: ['text'],
  supportsToolCalling: false,
  messageParts: ['text']
}

const nativeVision: ModelCapabilityMetadata = {
  id: 'fake-vision',
  inputModalities: ['text', 'image'],
  outputModalities: ['text'],
  supportsToolCalling: false,
  messageParts: ['text', 'input_image']
}

function modelCapturingRequest(capture: (request: ModelRequest) => void): ModelClient {
  return {
    provider: 'fake',
    model: 'fake',
    async *stream(request) {
      capture(request)
      yield { kind: 'assistant_text_delta', text: 'done' }
      yield { kind: 'completed', stopReason: 'stop' }
    }
  }
}

describe('AgentLoop attachment routing', () => {
  it('fails before the model when a text-only model has no vision evidence analyzer', async () => {
    let request: ModelRequest | undefined
    const harness = makeHarness(modelCapturingRequest((value) => { request = value }), {
      attachmentStore: attachmentStore(),
      modelCapabilities: () => textOnly
    })
    await bootstrapThread(harness, {
      request: { prompt: 'describe the image', attachmentIds: ['att_image'] }
    })

    await expect(harness.loop.runTurn(harness.threadId, harness.turnId)).resolves.toBe('failed')
    expect(request).toBeUndefined()
    const events = await harness.sessionStore.loadEventsSince(harness.threadId, 0)
    const failure = events.find((event) => event.kind === 'attachment_evidence_failed')
    expect(failure).toMatchObject({ attachmentId: 'att_image', status: 'failed' })
    expect(JSON.stringify(events)).not.toContain(pngBytes.toString('base64'))
  })

  it('does not fall back to Base64 when the configured analyzer fails', async () => {
    let request: ModelRequest | undefined
    const visionEvidence: VisionEvidencePort = {
      analyze: async () => { throw new Error('analyzer offline') }
    }
    const harness = makeHarness(modelCapturingRequest((value) => { request = value }), {
      attachmentStore: attachmentStore(),
      visionEvidence,
      modelCapabilities: () => textOnly
    })
    await bootstrapThread(harness, {
      request: { prompt: 'describe the image', attachmentIds: ['att_image'] }
    })

    await expect(harness.loop.runTurn(harness.threadId, harness.turnId)).resolves.toBe('failed')
    expect(request).toBeUndefined()
    const events = await harness.sessionStore.loadEventsSince(harness.threadId, 0)
    expect(JSON.stringify(events)).not.toContain(pngBytes.toString('base64'))
    expect(events.find((event) => event.kind === 'attachment_evidence_failed')).toMatchObject({
      message: 'analyzer offline'
    })
  })

  it('passes the image attachment unchanged to a native vision model', async () => {
    let request: ModelRequest | undefined
    const harness = makeHarness(modelCapturingRequest((value) => { request = value }), {
      attachmentStore: attachmentStore(),
      modelCapabilities: () => nativeVision
    })
    await bootstrapThread(harness, {
      request: { prompt: 'describe the image', attachmentIds: ['att_image'] }
    })

    await expect(harness.loop.runTurn(harness.threadId, harness.turnId)).resolves.toBe('completed')
    expect(request?.attachments).toHaveLength(1)
    expect(request?.attachments?.[0]).toMatchObject({
      id: 'att_image',
      mimeType: 'image/png',
      dataBase64: pngBytes.toString('base64')
    })
  })
})
