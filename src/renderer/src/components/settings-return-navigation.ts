import type { AppRoute } from '../store/chat-store-types'

type SettingsReturnRoute = Exclude<AppRoute, 'settings'>

type SettingsReturnActions = {
  setRoute: (route: AppRoute) => void
  openCode: () => Promise<void>
  openWrite: () => Promise<void>
  openClaw: () => void
  openSchedule: () => void
}

export async function restoreSettingsReturnRoute(
  route: SettingsReturnRoute,
  actions: SettingsReturnActions
): Promise<void> {
  if (route === 'chat') {
    await actions.openCode()
    return
  }
  if (route === 'write') {
    await actions.openWrite()
    return
  }
  if (route === 'claw') {
    actions.openClaw()
    return
  }
  if (route === 'schedule') {
    actions.openSchedule()
    return
  }
  actions.setRoute(route)
}
