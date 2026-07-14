import type { WorkWiseApi } from '../shared/workwise-api'

export type * from '../shared/workwise-api'

declare global {
  interface Window {
    workwise: WorkWiseApi
    /** @deprecated Use window.workwise. Compatibility is removed after 0.3.x. */
    kunGui: WorkWiseApi
  }
}
