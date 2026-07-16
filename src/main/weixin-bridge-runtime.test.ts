import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { weixinBridgeRuntimeInternals } from './weixin-bridge-runtime'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/workwise-test-user-data',
    getVersion: () => '0.2.0-test'
  }
}))

const requireFromTest = createRequire(import.meta.url)

describe('weixin bridge runtime', () => {
  it('builds WeChat base_info from the bundled WeChat plugin package', () => {
    const pkg = requireFromTest('@tencent-weixin/openclaw-weixin/package.json') as {
      version: string
    }
    const baseInfo = weixinBridgeRuntimeInternals.buildBaseInfo()

    expect(baseInfo).toMatchObject({
      channel_version: pkg.version,
      bot_agent: 'WorkWise Runtime/0.2.0-test'
    })
  })

  it('keeps OpenClaw-compatible account id normalization for existing WeChat state files', () => {
    const { normalizeAccountId } = weixinBridgeRuntimeInternals

    expect(normalizeAccountId('b0f5860fdecb@im.bot')).toBe('b0f5860fdecb-im-bot')
    expect(normalizeAccountId('ABC@IM.WECHAT')).toBe('abc-im-wechat')
    expect(normalizeAccountId('')).toBe('default')
    expect(normalizeAccountId('__proto__')).toBe('default')
  })

  it('does not expose the removed OpenClaw adapter builders', () => {
    expect(Object.keys(weixinBridgeRuntimeInternals)).not.toContain('buildGuiManagedOpenClawConfig')
    expect(Object.keys(weixinBridgeRuntimeInternals)).not.toContain('buildWeixinBridgeAdapterSource')
    expect(Object.keys(weixinBridgeRuntimeInternals)).not.toContain('parseNodeVersion')
  })

  it('extracts webhook generated files for WeChat media delivery, capped at three', () => {
    const { webhookGeneratedFiles } = weixinBridgeRuntimeInternals

    expect(webhookGeneratedFiles({
      ok: true,
      reply: 'done',
      files: [
        { path: '/ws/.deepseekgui-images/cat.png', fileName: 'cat.png' },
        { path: '/ws/out/report.pdf' },
        { unrelated: true },
        { path: '/ws/a.png' },
        { path: '/ws/b.png' }
      ]
    })).toEqual([
      { path: '/ws/.deepseekgui-images/cat.png', fileName: 'cat.png' },
      { path: '/ws/out/report.pdf', fileName: 'report.pdf' },
      { path: '/ws/a.png', fileName: 'a.png' }
    ])

    expect(webhookGeneratedFiles({ ok: true, reply: 'no files' })).toEqual([])
    expect(webhookGeneratedFiles({ files: 'not-an-array' })).toEqual([])
  })

  it('retries transient WeChat delivery failures and returns the successful result', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockRejectedValueOnce(new Error('temporary gateway failure'))
      .mockResolvedValueOnce({ messageId: 'delivered' })

    await expect(
      weixinBridgeRuntimeInternals.retryWithDelays(operation, [0, 0, 0])
    ).resolves.toEqual({ messageId: 'delivered' })
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('surfaces the last WeChat delivery error after all retries fail', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('final failure'))

    await expect(
      weixinBridgeRuntimeInternals.retryWithDelays(operation, [0, 0])
    ).rejects.toThrow('final failure')
    expect(operation).toHaveBeenCalledTimes(2)
  })
})
