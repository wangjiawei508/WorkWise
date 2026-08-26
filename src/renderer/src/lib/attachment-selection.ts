export const MAX_COMPOSER_ATTACHMENTS = 8

export function selectFilesForAvailableAttachmentSlots<T>(
  files: readonly T[],
  currentAttachmentCount: number
): T[] {
  const available = Math.max(0, MAX_COMPOSER_ATTACHMENTS - Math.max(0, currentAttachmentCount))
  return files.slice(0, available)
}
