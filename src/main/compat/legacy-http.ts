/** Read-only support for webhook headers emitted by pre-0.2.5 clients. */
export function readLegacyWebhookSecret(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const raw = headers['x-kun-secret'] ?? headers['x-deepseek-gui-secret']
  return Array.isArray(raw) ? raw[0] : raw
}
