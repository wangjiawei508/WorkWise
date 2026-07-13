import type { KunGuiApi } from '../shared/kun-gui-api'

export type * from '../shared/kun-gui-api'

declare global {
  interface Window {
    kunGui: KunGuiApi
  }
}
