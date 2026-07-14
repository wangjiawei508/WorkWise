import type { AgentProvider } from './types'
import { WorkWiseRuntimeProvider } from './managed-runtime'

let cachedProvider: AgentProvider | null = null

export function getProvider(): AgentProvider {
  if (cachedProvider) return cachedProvider
  cachedProvider = new WorkWiseRuntimeProvider()
  return cachedProvider
}

export function resetProviderCacheForTests(): void {
  cachedProvider = null
}
