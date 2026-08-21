export function shouldStopServicesWhenAllWindowsClose(
  platform: NodeJS.Platform,
  candidateMode = false
): boolean {
  return candidateMode || platform !== 'darwin'
}

export function shouldCloseMainWindowToTray(
  closeToTray: boolean,
  candidateMode = false
): boolean {
  return closeToTray && !candidateMode
}

export function shouldShowStartupErrorDialog(candidateHeadless = false): boolean {
  return !candidateHeadless
}
