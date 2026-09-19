export const engineeringTaskTypes = ['control-network', 'leveling-network', 'traverse-network', 'resection', 'deformation', 'gnss'] as const

export function engineeringTaskLabel(type: string | undefined, translate: (key: string) => string): string {
  return type && engineeringTaskTypes.includes(type as typeof engineeringTaskTypes[number])
    ? translate(`engineeringTaskTypes.${type}`)
    : type || '—'
}
