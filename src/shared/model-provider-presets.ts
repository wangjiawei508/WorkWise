import type {
  ImageGenerationProtocol,
  ModelEndpointFormat,
  ModelProviderImageCapabilityV1,
  ModelProviderProfileV1
} from './app-settings-types'

export type ModelProviderPresetId = 'xiaomi' | 'minimax'

export type ModelProviderPreset = {
  id: ModelProviderPresetId
  name: string
  baseUrl: string
  endpointFormat: ModelEndpointFormat
  models: string[]
  image?: {
    protocol: ImageGenerationProtocol
    baseUrl: string
    models: string[]
  }
  docsUrl: string
  apiKeyUrl: string
}

export const MODEL_PROVIDER_PRESETS: ModelProviderPreset[] = [
  {
    id: 'xiaomi',
    name: 'Xiaomi',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    endpointFormat: 'chat_completions',
    models: [
      'mimo-v2-omni',
      'mimo-v2.5-pro-ultraspeed',
      'mimo-v2-pro',
      'mimo-v2.5',
      'mimo-v2-flash',
      'mimo-v2.5-pro'
    ],
    docsUrl: 'https://platform.xiaomimimo.com/#/docs',
    apiKeyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys'
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    endpointFormat: 'messages',
    models: [
      'MiniMax-M2.5',
      'MiniMax-M3',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.7',
      'MiniMax-M2',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.1'
    ],
    image: {
      protocol: 'minimax-image',
      baseUrl: 'https://api.minimaxi.com',
      models: ['image-01']
    },
    docsUrl: 'https://platform.minimax.io/docs/api-reference/text-anthropic-api',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key'
  }
]

export function getModelProviderPreset(id: string): ModelProviderPreset | null {
  return MODEL_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null
}

export function modelProviderPresetProfile(
  preset: ModelProviderPreset,
  apiKey = ''
): ModelProviderProfileV1 {
  return {
    id: preset.id,
    name: preset.name,
    apiKey: apiKey.trim(),
    baseUrl: preset.baseUrl,
    endpointFormat: preset.endpointFormat,
    models: [...preset.models],
    ...(preset.image ? { image: modelProviderPresetImageCapability(preset.image) } : {})
  }
}

function modelProviderPresetImageCapability(
  image: NonNullable<ModelProviderPreset['image']>
): ModelProviderImageCapabilityV1 {
  return {
    protocol: image.protocol,
    baseUrl: image.baseUrl,
    models: [...image.models]
  }
}
