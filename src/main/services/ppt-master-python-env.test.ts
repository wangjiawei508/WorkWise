import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensurePptMasterPythonEnv,
  getPptMasterPythonEnvStatus,
  resolveManagedPythonPath
} from './ppt-master-python-env'

describe('ppt-master-python-env', () => {
  let tempRoot: string
  let previousEnv: string | undefined

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'ww-python-env-'))
    previousEnv = process.env.WORKWISE_PPT_MASTER_PYTHON
    process.env.WORKWISE_PPT_MASTER_PYTHON = join(tempRoot, 'venv', 'bin', 'python')
  })

  afterEach(async () => {
    if (previousEnv === undefined) delete process.env.WORKWISE_PPT_MASTER_PYTHON
    else process.env.WORKWISE_PPT_MASTER_PYTHON = previousEnv
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('reports not installed before the environment is created', () => {
    const status = getPptMasterPythonEnvStatus()
    expect(status.exists).toBe(false)
    expect(status.pythonPath).toBe(join(tempRoot, 'venv', 'bin', 'python'))
  })

  it('creates the venv and installs requirements through the runner', async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    await ensurePptMasterPythonEnv({
      run: async (command, args, onLine) => {
        calls.push({ command, args })
        if (args.includes('-m') && args.includes('venv')) {
          await mkdir(join(tempRoot, 'venv', 'bin'), { recursive: true })
          await writeFile(join(tempRoot, 'venv', 'bin', 'python'), '#!/bin/sh\n', { mode: 0o755 })
        }
        onLine('ok')
        return 0
      }
    })
    expect(calls).toHaveLength(2)
    expect(calls[0].args).toContain('venv')
    expect(calls[1].args.join(' ')).toContain('pip install')
    expect(getPptMasterPythonEnvStatus().exists).toBe(true)
    expect(resolveManagedPythonPath()).toBe(join(tempRoot, 'venv', 'bin', 'python'))
  })
})
