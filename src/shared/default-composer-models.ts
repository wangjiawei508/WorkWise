/** When upstream `GET /v1/models` fails, offer these ids in the composer (matches TUI picker + common IDs). */
export const DEFAULT_COMPOSER_MODEL_IDS = [
  'auto',
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp'
] as const

/**
 * Legacy DeepSeek ids remain accepted by the Runtime as configuration aliases,
 * but they are retired product names and must not appear in user pickers.
 */
export const RETIRED_COMPOSER_MODEL_IDS = new Set(['deepseek-chat', 'deepseek-reasoner'])

export function isVisibleComposerModelId(modelId: string): boolean {
  return !RETIRED_COMPOSER_MODEL_IDS.has(modelId.trim().toLowerCase())
}
