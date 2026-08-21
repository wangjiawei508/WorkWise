import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderPresetShape } from './design-preset-service'

describe('design preset service', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
  })

  it('falls back to the Python preset script when the sidecar exits before replying', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-preset-sidecar-'))
    const brokenSidecar = join(root, 'broken-sidecar.sh')
    await writeFile(brokenSidecar, '#!/bin/sh\nprintf \'sidecar unavailable\\n\' >&2\nexit 17\n', 'utf8')
    await chmod(brokenSidecar, 0o755)
    vi.stubEnv('WORKWISE_PPT_MASTER_SIDECAR', brokenSidecar)

    try {
      const result = await renderPresetShape('rect', { x: 50, y: 60, w: 200, h: 100 }, '#1E3A5F')

      expect(result).toMatchObject({ ok: true })
      if (result.ok) expect(result.svg).toContain('data-pptx-prst="rect"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
