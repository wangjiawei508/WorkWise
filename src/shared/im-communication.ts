import type { ClawImProvider } from './app-settings-types'

export const IM_HEALTH_STATUSES = [
  'unknown',
  'starting',
  'connected',
  'retrying',
  'stale',
  'expired',
  'error',
  'stopped'
] as const

export type ImHealthStatusV1 = typeof IM_HEALTH_STATUSES[number]

export type ImHealthReasonCodeV1 =
  | 'none'
  | 'first_poll_timeout'
  | 'poll_stale'
  | 'network'
  | 'provider_error'
  | 'bridge_unavailable'
  | 'runtime_unavailable'
  | 'credential_missing'
  | 'credential_unavailable'
  | 'auth_expired'
  | 'user_stopped'
  | 'state_corrupt'

export type ImCredentialStorageV1 = 'keychain' | 'dpapi' | 'safe-storage' | 'session'

export type ImCredentialRefV1 = {
  id: string
  storage: ImCredentialStorageV1
  createdAt: string
}

export type ImChannelHealthV1 = {
  schema: 'workwise.im-health'
  version: 1
  channelId: string
  provider: ClawImProvider
  accountId: string
  status: ImHealthStatusV1
  reasonCode: ImHealthReasonCodeV1
  message: string
  runId: string
  startedAt?: string
  connectedAt?: string
  updatedAt: string
  lastSuccessfulHeartbeatAt?: string
  lastInboundAt?: string
  lastOutboundAt?: string
  lastErrorAt?: string
  failureCount: number
  nextRetryAt?: string
  errorCode?: number | string
  credentialStorage?: ImCredentialStorageV1
  pendingMessages: number
  processingMessages: number
  deliveryMessages: number
}

export type ImSelfCheckItemV1 = {
  id: string
  pass: boolean
  code: string
  summary: string
}

export type ImSelfCheckResultV1 = {
  schema: 'workwise.im-self-check'
  version: 1
  overall: 'PASS' | 'FAIL'
  checkedAt: string
  runId: string
  checks: ImSelfCheckItemV1[]
}

export type ImDiagnosticsV1 = {
  schema: 'workwise.im-diagnostics'
  version: 1
  generatedAt: string
  appVersion: string
  userDataFingerprint: string
  channels: Array<{
    channelId: string
    provider: ClawImProvider
    accountFingerprint: string
    status: ImHealthStatusV1
    reasonCode: ImHealthReasonCodeV1
    runId: string
    lastSuccessfulHeartbeatAt?: string
    lastInboundAt?: string
    lastOutboundAt?: string
    failureCount: number
    pendingMessages: number
    processingMessages: number
    deliveryMessages: number
  }>
}

export type ImLifecycleResultV1 =
  | { ok: true; health: ImChannelHealthV1 }
  | { ok: false; code: string; message: string; health?: ImChannelHealthV1 }

export const IM_FIRST_HEARTBEAT_DEADLINE_MS = 90_000
export const IM_STALE_AFTER_MS = 90_000
export const IM_HEALTH_SUPERVISOR_INTERVAL_MS = 15_000
export const IM_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000] as const
export const IM_RETRY_JITTER_RATIO = 0.2
export const IM_SLOW_NOTICE_MS = 8_000
export const IM_RUNTIME_START_TIMEOUT_MS = 60_000
export const IM_RUNTIME_TURN_TIMEOUT_MS = 600_000
export const IM_SEND_TIMEOUT_MS = 15_000
export const IM_LEDGER_LEASE_MS = 120_000
// The provider bridge continues sending after the webhook response returns
// (for example, WeChat may upload generated files before sending its receipt).
// Keep that delivery worker lease alive long enough to cover the bridge's
// bounded request timeout and a retry margin.
export const IM_LEDGER_PROVIDER_DELIVERY_LEASE_MS = 15 * 60_000
export const IM_LEDGER_LEASE_RENEW_INTERVAL_MS = 30_000
export const IM_LEDGER_PAYLOAD_RETENTION_MS = 7 * 24 * 60 * 60_000
export const IM_LEDGER_RETENTION_MS = 30 * 24 * 60 * 60_000

export function retryDelayMs(failureCount: number, random = Math.random): number {
  const index = Math.max(0, Math.min(IM_RETRY_DELAYS_MS.length - 1, Math.floor(failureCount) - 1))
  const base = IM_RETRY_DELAYS_MS[index] ?? IM_RETRY_DELAYS_MS.at(-1)!
  const jitter = 1 + ((random() * 2) - 1) * IM_RETRY_JITTER_RATIO
  return Math.max(0, Math.round(base * jitter))
}

export function isFreshImHeartbeat(health: Pick<ImChannelHealthV1, 'lastSuccessfulHeartbeatAt'>, now = Date.now()): boolean {
  if (!health.lastSuccessfulHeartbeatAt) return false
  const timestamp = Date.parse(health.lastSuccessfulHeartbeatAt)
  return Number.isFinite(timestamp) && now - timestamp <= IM_STALE_AFTER_MS
}
