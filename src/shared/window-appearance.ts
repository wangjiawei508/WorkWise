export const WINDOW_MATERIALS = ['solid', 'vibrancy', 'mica', 'acrylic'] as const
export type WindowMaterialV1 = typeof WINDOW_MATERIALS[number]

export const WINDOW_APPEARANCE_REASONS = [
  'supported',
  'reduced-transparency',
  'high-contrast',
  'gpu-disabled',
  'remote-session',
  'disabled-by-environment',
  'unsupported-platform',
  'unsupported-windows-version'
] as const
export type WindowAppearanceReasonV1 = typeof WINDOW_APPEARANCE_REASONS[number]

export type WindowAppearanceV1 = {
  schema: 'workwise.window-appearance'
  version: 1
  material: WindowMaterialV1
  transparencyEnabled: boolean
  reason: WindowAppearanceReasonV1
}

export const SOLID_WINDOW_APPEARANCE: WindowAppearanceV1 = {
  schema: 'workwise.window-appearance',
  version: 1,
  material: 'solid',
  transparencyEnabled: false,
  reason: 'unsupported-platform'
}

const MATERIAL_ARGUMENT = '--workwise-window-material='
const TRANSPARENCY_ARGUMENT = '--workwise-window-transparency='
const REASON_ARGUMENT = '--workwise-window-appearance-reason='

function lastArgumentValue(args: readonly string[], prefix: string): string | undefined {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const value = args[index]
    if (value?.startsWith(prefix)) return value.slice(prefix.length)
  }
  return undefined
}

export function windowAppearanceArguments(appearance: WindowAppearanceV1): string[] {
  return [
    `${MATERIAL_ARGUMENT}${appearance.material}`,
    `${TRANSPARENCY_ARGUMENT}${appearance.transparencyEnabled ? 'enabled' : 'disabled'}`,
    `${REASON_ARGUMENT}${appearance.reason}`
  ]
}

export function parseWindowAppearanceArguments(args: readonly string[]): WindowAppearanceV1 {
  const materialValue = lastArgumentValue(args, MATERIAL_ARGUMENT)
  const material = WINDOW_MATERIALS.find((candidate) => candidate === materialValue) ?? 'solid'
  const reasonValue = lastArgumentValue(args, REASON_ARGUMENT)
  const reason = WINDOW_APPEARANCE_REASONS.find((candidate) => candidate === reasonValue)
    ?? 'unsupported-platform'
  const transparencyEnabled =
    material !== 'solid' && lastArgumentValue(args, TRANSPARENCY_ARGUMENT) === 'enabled'

  return {
    schema: 'workwise.window-appearance',
    version: 1,
    material,
    transparencyEnabled,
    reason
  }
}
