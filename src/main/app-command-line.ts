import { app } from 'electron'

export const LINUX_WAYLAND_IME_SWITCHES = [
  { name: 'ozone-platform-hint', value: 'auto' },
  { name: 'enable-wayland-ime' }
] as const

export function shouldConfigureLinuxWaylandImeSwitches(platform = process.platform): boolean {
  return platform === 'linux'
}

/**
 * Electron's Chromium child processes use the command-line profile switch;
 * changing app.setPath('userData') alone does not update their userData path.
 */
export function configureChromiumUserDataPath(userDataPath: string): void {
  if (!userDataPath.trim()) throw new Error('Chromium userData path must not be empty.')
  // Electron may initialize a default profile switch before the main bundle
  // runs. appendSwitch() does not replace an existing switch, so remove it
  // first to keep Chromium helpers out of the production profile.
  app.commandLine.removeSwitch('user-data-dir')
  app.commandLine.appendSwitch('user-data-dir', userDataPath)
}

export function configureLinuxWaylandImeSwitches(platform = process.platform): void {
  if (!shouldConfigureLinuxWaylandImeSwitches(platform)) return

  for (const commandLineSwitch of LINUX_WAYLAND_IME_SWITCHES) {
    if (app.commandLine.hasSwitch(commandLineSwitch.name)) continue

    if ('value' in commandLineSwitch) {
      app.commandLine.appendSwitch(commandLineSwitch.name, commandLineSwitch.value)
    } else {
      app.commandLine.appendSwitch(commandLineSwitch.name)
    }
  }
}
