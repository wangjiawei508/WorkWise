import {
  DEFAULT_MODEL_PROVIDER_ID,
  isOfficialDeepSeekBaseUrl,
  type ModelProviderProfileV1
} from '@shared/app-settings'
import type { ModelProviderModelGroup } from '@shared/workwise-api'

export const DEEPSEEK_VISION_MODEL_ID = 'deepseek-v4-flash-vision-exp'

type AttachmentDescriptor = {
  mimeType?: string
  kind?: string
}

export type AttachmentAwareModelDecision =
  | { ok: true; model: string }
  | { ok: false; model: typeof DEEPSEEK_VISION_MODEL_ID }

export function hasImageAttachment(attachments: readonly AttachmentDescriptor[]): boolean {
  return attachments.some((attachment) =>
    attachment.kind?.trim().toLowerCase() === 'image' ||
    attachment.mimeType?.trim().toLowerCase().startsWith('image/') === true
  )
}

export function resolveAttachmentAwareModel(input: {
  selectedModel: string
  attachments: readonly AttachmentDescriptor[]
  activeProvider: Pick<ModelProviderProfileV1, 'id' | 'baseUrl' | 'models'>
  modelGroups: readonly ModelProviderModelGroup[]
}): AttachmentAwareModelDecision {
  const selectedModel = input.selectedModel.trim()
  if (selectedModel !== 'auto' || !hasImageAttachment(input.attachments)) {
    return { ok: true, model: selectedModel }
  }

  const configuredByCustomProvider =
    input.activeProvider.id !== DEFAULT_MODEL_PROVIDER_ID &&
    includesModel(input.activeProvider.models, DEEPSEEK_VISION_MODEL_ID)
  const discoveredByActiveProvider = input.modelGroups.some((group) =>
    group.providerId === input.activeProvider.id &&
    includesModel(group.discoveredModelIds ?? [], DEEPSEEK_VISION_MODEL_ID)
  )
  if (
    isOfficialDeepSeekBaseUrl(input.activeProvider.baseUrl) ||
    configuredByCustomProvider ||
    discoveredByActiveProvider
  ) {
    return { ok: true, model: DEEPSEEK_VISION_MODEL_ID }
  }

  return { ok: false, model: DEEPSEEK_VISION_MODEL_ID }
}

function includesModel(models: readonly string[], expected: string): boolean {
  const normalizedExpected = expected.toLowerCase()
  return models.some((model) => model.trim().toLowerCase() === normalizedExpected)
}
