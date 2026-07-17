export function safeMediaPreviewUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized.startsWith('blob:')) return normalized
  if (/^data:(?:image|video)\/[a-z0-9.+-]+(?:;[^,]*)?;base64,/i.test(normalized)) {
    return normalized
  }
  return undefined
}
