import type { WorkgptApi } from '../shared/workgpt-api'

export type * from '../shared/workgpt-api'

declare global {
  interface Window {
    workgpt: WorkgptApi
  }
}
