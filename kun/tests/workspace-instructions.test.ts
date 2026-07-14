import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWorkspaceInstructions } from '../src/workspace/workspace-instructions.js'

const sandboxes: string[] = []

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('workspace instruction boundaries', () => {
  it('loads only instructions between the workspace root and current file', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'workwise-instructions-'))
    sandboxes.push(parent)
    const workspace = join(parent, 'workspace')
    const current = join(workspace, 'src', 'feature', 'index.ts')
    await mkdir(join(workspace, 'src', 'feature'), { recursive: true })
    await writeFile(join(parent, 'AGENTS.md'), 'outside')
    await writeFile(join(workspace, 'AGENTS.md'), 'root')
    await writeFile(join(workspace, 'src', 'CLAUDE.md'), 'nested')
    await writeFile(current, 'export {}')

    const instructions = await loadWorkspaceInstructions(workspace, current)

    expect(instructions.map((entry) => entry.content)).toEqual(['root', 'nested'])
  })

  it.skipIf(process.platform === 'win32')('rejects an external current path and skips linked instruction files', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'workwise-instructions-'))
    sandboxes.push(parent)
    const workspace = join(parent, 'workspace')
    await mkdir(workspace)
    const outside = join(parent, 'outside.md')
    await writeFile(outside, 'outside')
    await symlink(outside, join(workspace, 'AGENTS.md'))

    await expect(loadWorkspaceInstructions(workspace, outside)).rejects.toThrow(/escapes/)
    await expect(loadWorkspaceInstructions(workspace)).resolves.toEqual([])
  })

  it('skips individual files over 64 KiB', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-instructions-'))
    sandboxes.push(workspace)
    await writeFile(join(workspace, 'AGENTS.md'), 'x'.repeat(64 * 1024 + 1))
    await expect(loadWorkspaceInstructions(workspace)).resolves.toEqual([])
  })
})
