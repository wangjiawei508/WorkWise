import type { ImChannelHealthV1 } from '../shared/im-communication'

/**
 * Protected credentials require an explicit user action after a cold-start
 * deferral. Automatic recovery would invoke the Keychain helper again.
 */
export function shouldAutoRecoverFeishuHealth(
  health: Pick<ImChannelHealthV1, 'provider' | 'reasonCode' | 'status'>
): boolean {
  return health.provider === 'feishu' &&
    health.reasonCode !== 'credential_unavailable' &&
    (health.status === 'stale' || health.status === 'retrying')
}
