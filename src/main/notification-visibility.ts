type NotificationVisibilityTarget = {
  isDestroyed(): boolean
  isVisible(): boolean
  isMinimized(): boolean
  isFocused(): boolean
}

export function isActiveThreadActuallyVisible(
  target: NotificationVisibilityTarget | null,
  rendererMarksActive: boolean | undefined
): boolean {
  if (rendererMarksActive !== true || !target || target.isDestroyed()) return false
  return target.isVisible() && !target.isMinimized() && target.isFocused()
}
