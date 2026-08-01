import { createHmac } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowRepository } from './repository.js'
import { EncryptedFileFlowSecretStore, FlowWebhookSecurity } from './webhook-security.js'

describe('Flow webhook security', () => {
  it('verifies HMAC and persists replay nonces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-flow-webhook-')); const now = 1_800_000_000_000
    const repository = new FlowRepository(join(root, 'flow.sqlite')); const security = new FlowWebhookSecurity(repository, new EncryptedFileFlowSecretStore(join(root, 'secrets'), Buffer.alloc(32, 1)), () => now)
    const provisioned = await security.provision('flow_1', 'webhook_1'); const body = JSON.stringify({ ok: true }); const timestamp = String(now / 1000); const nonce = 'nonce_1234567890abcdef'
    const signature = createHmac('sha256', Buffer.from(provisioned.secret, 'base64url')).update(timestamp).update('.').update(nonce).update('.').update(body).digest('hex')
    const request = () => new Request('http://localhost/hook', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-workwise-timestamp': timestamp, 'x-workwise-nonce': nonce, 'x-workwise-signature': `sha256=${signature}` } })
    await expect(security.verify(provisioned.triggerId, request())).resolves.toEqual({ flowId: 'flow_1', nodeId: 'webhook_1', input: { ok: true } })
    await expect(security.verify(provisioned.triggerId, request())).rejects.toMatchObject({ code: 'webhook_replay' })
    repository.close()
  })

  it('rejects stale timestamps and invalid signatures without consuming a nonce', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-flow-webhook-')); const now = 1_800_000_000_000
    const repository = new FlowRepository(join(root, 'flow.sqlite')); const security = new FlowWebhookSecurity(repository, new EncryptedFileFlowSecretStore(join(root, 'secrets'), Buffer.alloc(32, 2)), () => now)
    const provisioned = await security.provision('flow_1', 'webhook_1')
    const stale = new Request('http://localhost/hook', { method: 'POST', body: '{}', headers: { 'x-workwise-timestamp': String((now - 301_000) / 1000), 'x-workwise-nonce': 'nonce_1234567890abcdef', 'x-workwise-signature': '0'.repeat(64) } })
    await expect(security.verify(provisioned.triggerId, stale)).rejects.toMatchObject({ code: 'webhook_timestamp_invalid' })
    repository.close()
  })
})
