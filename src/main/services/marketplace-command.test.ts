import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  marketplaceCommandEnvironment,
  resolveMarketplaceCommand
} from './marketplace-command'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('resolveMarketplaceCommand', () => {
  it('uses a tool directory that is present in the inherited PATH', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-marketplace-command-'))
    roots.push(root)
    const executable = join(root, 'npm')
    await writeFile(executable, '#!/bin/sh\n')
    await chmod(executable, 0o755)

    expect(resolveMarketplaceCommand('npm', { PATH: root }, root)).toBe(executable)
  })

  it('finds user-managed tools even when the GUI PATH is minimal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-marketplace-command-'))
    roots.push(root)
    const executable = join(root, '.local', 'bin', 'workwise-tool')
    await mkdir(join(root, '.local', 'bin'), { recursive: true })
    await writeFile(executable, '#!/bin/sh\n')
    await chmod(executable, 0o755)

    expect(resolveMarketplaceCommand('workwise-tool', { PATH: '/usr/bin' }, root)).toBe(executable)
  })

  it('preserves explicit executable paths', () => {
    expect(resolveMarketplaceCommand('/custom/bin/npm', { PATH: '' }, '/tmp')).toBe('/custom/bin/npm')
  })

  it('augments child PATH so env-based tool launchers can find their runtime', () => {
    const env = marketplaceCommandEnvironment({ PATH: '/usr/bin' }, '/tmp/workwise-home')
    expect(env.PATH?.split(':')).toEqual(expect.arrayContaining(['/usr/bin', '/opt/homebrew/bin']))
  })
})
