import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_KUN_MODEL,
  DEFAULT_MODEL_PROVIDER_ID,
  type AppSettingsV1,
  type KunRuntimeSettingsV1,
  type ModelProviderProfilePatchV1,
  type ModelProviderProfileV1,
  type ModelProviderSettingsPatchV1,
  type ModelProviderSettingsV1,
  type ModelProviderApiType,
  type KunRuntimeApiType
} from './app-settings-types'
import { getKunRuntimeSettings } from './app-settings-kun'
import { normalizeDeepseekBaseUrl } from './app-settings-normalizers'
import { DEFAULT_COMPOSER_MODEL_IDS } from './default-composer-models'

const DEFAULT_MODEL_PROVIDER_NAME = 'DeepSeek'

export function defaultModelProviderSettings(): ModelProviderSettingsV1 {
  const defaultProvider = defaultModelProviderProfile('', DEFAULT_DEEPSEEK_BASE_URL)
  return {
    apiKey: defaultProvider.apiKey,
    baseUrl: defaultProvider.baseUrl,
    providers: [defaultProvider]
  }
}

export function normalizeModelProviderSettings(
  input: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  const defaults = defaultModelProviderSettings()
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : defaults.apiKey
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : defaults.baseUrl
  const rawProviders = Array.isArray(input?.providers) ? input.providers : []
  const providersById = new Map<string, ModelProviderProfileV1>()
  const defaultProvider = defaultModelProviderProfile(apiKey, baseUrl)
  providersById.set(defaultProvider.id, defaultProvider)
  for (const rawProvider of rawProviders) {
    const provider = normalizeModelProviderProfile(rawProvider)
    if (!provider) continue
    providersById.set(provider.id, provider.id === DEFAULT_MODEL_PROVIDER_ID
      ? {
          ...defaultProvider,
          ...provider,
          apiKey,
          baseUrl
        }
      : provider)
  }
  const providers = [...providersById.values()]
  return {
    apiKey,
    baseUrl,
    providers
  }
}

export function mergeModelProviderSettings(
  current: ModelProviderSettingsV1,
  patch: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings({
    ...current,
    ...(patch ?? {})
  })
}

export function getModelProviderSettings(settings: AppSettingsV1): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings((settings as { provider?: ModelProviderSettingsPatchV1 }).provider)
}

export function modelProviderSettingsPatch(
  provider: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsPatchV1 {
  return provider ? { ...provider } : {}
}

export function resolveModelProviderApiKey(settings: AppSettingsV1): string {
  return getDefaultModelProviderProfile(settings).apiKey.trim()
}

export function resolveModelProviderBaseUrl(settings: AppSettingsV1): string {
  return normalizeDeepseekBaseUrl(getDefaultModelProviderProfile(settings).baseUrl)
}

export function getDefaultModelProviderProfile(settings: AppSettingsV1): ModelProviderProfileV1 {
  return getModelProviderProfile(settings, DEFAULT_MODEL_PROVIDER_ID)
}

export function getModelProviderProfile(
  settings: AppSettingsV1,
  providerId: string | undefined
): ModelProviderProfileV1 {
  const provider = getModelProviderSettings(settings)
  const id = normalizeProviderId(providerId || DEFAULT_MODEL_PROVIDER_ID)
  return provider.providers.find((profile) => profile.id === id) ?? provider.providers[0] ?? defaultModelProviderProfile(provider.apiKey, provider.baseUrl)
}

export function listModelProviderModelIds(settings: AppSettingsV1): string[] {
  const ids = new Set<string>()
  for (const provider of getModelProviderSettings(settings).providers) {
    for (const model of provider.models) {
      const trimmed = model.trim()
      if (trimmed) ids.add(trimmed)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

export type ResolvedKunRuntimeSettingsV1 = Omit<KunRuntimeSettingsV1, 'apiType'> & {
  apiType: ModelProviderApiType
}

export function resolveKunRuntimeSettings(settings: AppSettingsV1): ResolvedKunRuntimeSettingsV1 {
  const runtime = getKunRuntimeSettings(settings)
  const provider = getModelProviderProfile(settings, runtime.providerId)
  const modelResolution = resolveKunRuntimeModel(runtime.model, provider.models)
  const runtimeApiKey = runtime.apiKey?.trim() ?? ''
  const runtimeBaseUrl = runtime.baseUrl?.trim() ?? ''
  const providerBaseUrl = provider.baseUrl.trim() || DEFAULT_DEEPSEEK_BASE_URL
  const runtimeApiType = normalizeKunRuntimeApiType(runtime.apiType)

  return {
    ...runtime,
    model: modelResolution.model,
    apiKey: runtimeApiKey || provider.apiKey.trim(),
    baseUrl:
      runtimeBaseUrl && runtimeBaseUrl !== DEFAULT_DEEPSEEK_BASE_URL
        ? normalizeDeepseekBaseUrl(runtimeBaseUrl)
        : normalizeDeepseekBaseUrl(providerBaseUrl),
    apiType: runtimeApiType === 'inherit' || modelResolution.inheritedFromProvider
      ? provider.apiType
      : runtimeApiType
  }
}

export function resolveModelSelectionForProvider(
  settings: AppSettingsV1,
  requestedModel: string | undefined
): string | undefined {
  const selected = requestedModel?.trim() ?? ''
  if (!selected) return undefined

  const runtime = getKunRuntimeSettings(settings)
  const provider = getModelProviderProfile(settings, runtime.providerId)
  const providerModels = provider.models
    .map((model) => model.trim())
    .filter((model) => model && model !== 'auto')
  const providerModelSet = new Set(providerModels)
  const resolvedModel = resolveKunRuntimeSettings(settings).model.trim()
  const isBuiltInComposerModel = DEFAULT_COMPOSER_MODEL_IDS.includes(
    selected as typeof DEFAULT_COMPOSER_MODEL_IDS[number]
  )
  const isBuiltInConcreteComposerModel = selected !== 'auto' && isBuiltInComposerModel
  const providerHasBuiltInModels = DEFAULT_COMPOSER_MODEL_IDS.some(
    (model) => model !== 'auto' && providerModelSet.has(model)
  )

  if (
    providerModels.length > 0 &&
    resolvedModel &&
    resolvedModel !== selected &&
    (
      (selected === 'auto' && !providerHasBuiltInModels) ||
      (isBuiltInConcreteComposerModel && !providerModelSet.has(selected))
    )
  ) {
    return resolvedModel
  }

  return selected
}

function resolveKunRuntimeModel(
  runtimeModel: string,
  providerModels: readonly string[]
): { model: string; inheritedFromProvider: boolean } {
  const configured = runtimeModel.trim()
  const normalizedProviderModels = providerModels
    .map((model) => model.trim())
    .filter((model) => model && model !== 'auto')
  const providerDefault = normalizedProviderModels[0]

  if (!providerDefault) {
    return { model: configured || DEFAULT_KUN_MODEL, inheritedFromProvider: false }
  }

  if (!configured) {
    return { model: providerDefault, inheritedFromProvider: true }
  }

  if (configured === DEFAULT_KUN_MODEL && !normalizedProviderModels.includes(configured)) {
    return { model: providerDefault, inheritedFromProvider: true }
  }

  return { model: configured, inheritedFromProvider: false }
}

function defaultModelProviderProfile(apiKey: string, baseUrl: string): ModelProviderProfileV1 {
  return {
    id: DEFAULT_MODEL_PROVIDER_ID,
    name: DEFAULT_MODEL_PROVIDER_NAME,
    apiKey: apiKey.trim(),
    baseUrl: normalizeDeepseekBaseUrl(baseUrl),
    apiType: 'chat_completions',
    models: DEFAULT_COMPOSER_MODEL_IDS.filter((id) => id !== 'auto')
  }
}

function normalizeModelProviderProfile(
  input: ModelProviderProfilePatchV1 | undefined
): ModelProviderProfileV1 | null {
  const id = normalizeProviderId(input?.id)
  if (!id) return null
  const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : id
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : DEFAULT_DEEPSEEK_BASE_URL
  const models = normalizeProviderModels(input?.models)
  return {
    id,
    name,
    apiKey: typeof input?.apiKey === 'string' ? input.apiKey.trim() : '',
    baseUrl,
    apiType: normalizeModelProviderApiType(input?.apiType),
    models
  }
}

function normalizeProviderModels(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const ids = new Set<string>()
  for (const model of models) {
    if (typeof model !== 'string') continue
    const trimmed = model.trim()
    if (trimmed) ids.add(trimmed)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function normalizeModelProviderApiType(value: unknown): ModelProviderApiType {
  return value === 'responses' ? 'responses' : 'chat_completions'
}

function normalizeKunRuntimeApiType(value: unknown): KunRuntimeApiType {
  if (value === 'responses' || value === 'chat_completions' || value === 'inherit') return value
  return 'inherit'
}

function normalizeProviderId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    : ''
}
