type NotificationNavigationTarget = {
  isDestroyed(): boolean
  webContents: {
    isDestroyed(): boolean
    isLoadingMainFrame(): boolean
    once(event: 'did-finish-load', listener: () => void): unknown
    send(channel: string, threadId: string): void
  }
}

export function createNotificationClickHandler(
  getTarget: () => NotificationNavigationTarget | null,
  reveal: () => void,
  threadId: string | null | undefined
): () => void {
  return () => {
    reveal()
    dispatchNotificationOpenThread(getTarget(), threadId)
  }
}

export function dispatchNotificationOpenThread(
  target: NotificationNavigationTarget | null,
  rawThreadId: string | null | undefined
): boolean {
  const threadId = rawThreadId?.trim()
  if (!threadId || !target || target.isDestroyed() || target.webContents.isDestroyed()) {
    return false
  }

  const deliver = (): void => {
    if (target.isDestroyed() || target.webContents.isDestroyed()) return
    target.webContents.send('notification:open-thread', threadId)
  }
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
  return true
}
