import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_VISION_MODEL_ID,
  resolveAttachmentAwareModel
} from './attachment-aware-model'

const image = { mimeType: 'image/png', kind: 'image' }
const document = { mimeType: 'application/pdf', kind: 'pdf' }

describe('attachment-aware model routing', () => {
  it('uses the vision model for auto image turns on the official DeepSeek endpoint', () => {
    expect(resolveAttachmentAwareModel({
      selectedModel: 'auto',
      attachments: [image],
      activeProvider: {
        id: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        models: []
      },
      modelGroups: []
    })).toEqual({ ok: true, model: DEEPSEEK_VISION_MODEL_ID })
  })

  it('accepts an explicitly configured vision model on a custom provider', () => {
    expect(resolveAttachmentAwareModel({
      selectedModel: 'auto',
      attachments: [image],
      activeProvider: {
        id: 'third-party',
        baseUrl: 'https://third-party.example/v1',
        models: [DEEPSEEK_VISION_MODEL_ID]
      },
      modelGroups: []
    })).toEqual({ ok: true, model: DEEPSEEK_VISION_MODEL_ID })
  })

  it('accepts a vision model discovered from the active third-party provider', () => {
    expect(resolveAttachmentAwareModel({
      selectedModel: 'auto',
      attachments: [image],
      activeProvider: {
        id: 'third-party',
        baseUrl: 'https://third-party.example/v1',
        models: []
      },
      modelGroups: [{
        providerId: 'third-party',
        label: 'Third Party',
        modelIds: [DEEPSEEK_VISION_MODEL_ID],
        discoveredModelIds: [DEEPSEEK_VISION_MODEL_ID]
      }]
    })).toEqual({ ok: true, model: DEEPSEEK_VISION_MODEL_ID })
  })

  it('does not treat fallback picker models as provider availability', () => {
    expect(resolveAttachmentAwareModel({
      selectedModel: 'auto',
      attachments: [image],
      activeProvider: {
        id: 'deepseek',
        baseUrl: 'https://third-party.example/v1',
        models: [DEEPSEEK_VISION_MODEL_ID]
      },
      modelGroups: [{
        providerId: 'deepseek',
        label: 'DeepSeek compatible',
        modelIds: [DEEPSEEK_VISION_MODEL_ID]
      }]
    })).toEqual({ ok: false, model: DEEPSEEK_VISION_MODEL_ID })
  })

  it('keeps explicit model selection and document-only turns unchanged', () => {
    const provider = {
      id: 'third-party',
      baseUrl: 'https://third-party.example/v1',
      models: []
    }
    expect(resolveAttachmentAwareModel({
      selectedModel: 'custom-vision-model',
      attachments: [image],
      activeProvider: provider,
      modelGroups: []
    })).toEqual({ ok: true, model: 'custom-vision-model' })
    expect(resolveAttachmentAwareModel({
      selectedModel: 'auto',
      attachments: [document],
      activeProvider: provider,
      modelGroups: []
    })).toEqual({ ok: true, model: 'auto' })
  })
})
