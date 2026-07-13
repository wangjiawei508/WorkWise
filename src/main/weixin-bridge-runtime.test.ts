import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { weixinBridgeRuntimeInternals } from './weixin-bridge-runtime'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/deepseek-gui-test-user-data',
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
      bot_agent: 'Kun/0.2.0-test'
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
})
