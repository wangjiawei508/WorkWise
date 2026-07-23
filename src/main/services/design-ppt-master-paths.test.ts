import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolvePptMasterScript } from './design-ppt-master-paths'

describe('resolvePptMasterScript', () => {
  let tempRoot = ''
  const originalOverride = process.env.WORKWISE_PPT_MASTER_ROOT
  const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath')

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'design-ppt-master-paths-'))
    delete process.env.WORKWISE_PPT_MASTER_ROOT
  })

  afterEach(async () => {
    if (originalOverride === undefined) delete process.env.WORKWISE_PPT_MASTER_ROOT
    else process.env.WORKWISE_PPT_MASTER_ROOT = originalOverride
    if (originalResourcesPath) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPath)
    } else {
      Reflect.deleteProperty(process, 'resourcesPath')
    }
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('prefers the explicit audited PPT Master root', async () => {
    const root = join(tempRoot, 'override')
    const script = join(root, 'scripts', 'preset_shape_svg.py')
    await mkdir(join(root, 'scripts'), { recursive: true })
    await writeFile(script, '# test\n', 'utf8')
    process.env.WORKWISE_PPT_MASTER_ROOT = root

    expect(resolvePptMasterScript('preset_shape_svg.py')).toBe(script)
  })

  it('finds scripts unpacked beside app.asar in a packaged app', async () => {
    const resourcesPath = join(tempRoot, 'resources')
    const script = join(
      resourcesPath,
      'app.asar.unpacked',
      'src',
      'asset',
      'skills',
      'ppt-master',
      'scripts',
      'svg_to_pptx.py'
    )
    await mkdir(dirname(script), { recursive: true })
    await writeFile(script, '# test\n', 'utf8')
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: resourcesPath
    })

    expect(resolvePptMasterScript('svg_to_pptx.py')).toBe(script)
  })

  it('returns null for an unavailable script', () => {
    process.env.WORKWISE_PPT_MASTER_ROOT = join(tempRoot, 'missing')
    expect(resolvePptMasterScript('definitely-not-a-real-script.py')).toBeNull()
  })
})
