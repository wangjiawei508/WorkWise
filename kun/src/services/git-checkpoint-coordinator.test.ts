import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskRun } from '../contracts/tasks.js'
import { GitCheckpointCoordinator } from './git-checkpoint-coordinator.js'
import { TaskRunRepository } from './task-run-repository.js'

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function task(root: string): TaskRun {
  return {
    id: 'task_git_guard',
    threadId: 'thread_git_guard',
    activeTurnId: 'turn_git_guard',
    childTaskIds: [],
    workspaceRoot: root,
    goal: 'edit repository',
    status: 'running',
    acceptance: {
      kind: 'files',
      requiredNodeKinds: ['execute', 'verify', 'deliver'],
      minimumArtifacts: 1,
      requireFinalResponse: true,
      requireActionableArtifactCard: true
    },
    agentId: 'general',
    budget: { maxAttempts: 8, maxDurationMs: 60_000 },
    attempts: 1,
    replans: 0,
    noProgressCount: 0,
    nodes: [],
    artifacts: [],
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    revision: 0
  }
}

describe('GitCheckpointCoordinator', () => {
  it('creates a compatible checkpoint before the first mutation and extends it before later files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-runtime-git-'))
    const storage = await mkdtemp(join(tmpdir(), 'workwise-runtime-git-store-'))
    cleanup.push(root, storage)
    execFileSync('git', ['init', '-b', 'main', root], { stdio: 'pipe' })
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'])
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'])
    await writeFile(join(root, 'README.md'), 'baseline\n')
    execFileSync('git', ['-C', root, 'add', 'README.md'])
    execFileSync('git', ['-C', root, 'commit', '-m', 'baseline'], { stdio: 'pipe' })

    const repository = new TaskRunRepository(join(storage, 'tasks.sqlite3'))
    repository.create(task(root))
    const coordinator = new GitCheckpointCoordinator(repository, storage)
    await coordinator.beforeMutation({
      absolutePath: join(root, 'README.md'),
      relativePath: 'README.md',
      workspaceRoot: root,
      threadId: 'thread_git_guard'
    })
    await writeFile(join(root, 'README.md'), 'task edit\n')
    await coordinator.beforeMutation({
      absolutePath: join(root, 'new-file.ts'),
      relativePath: 'new-file.ts',
      workspaceRoot: root,
      threadId: 'thread_git_guard'
    })

    const key = 'task:task_git_guard:first-write'
    const id = `gitcp_${createHash('sha256').update(`task_git_guard:${key}`).digest('hex').slice(0, 20)}`
    const stored = JSON.parse(await readFile(join(storage, id, 'checkpoint.json'), 'utf8')) as {
      schema: string
      checkpoint: { repositoryRoot: string; files: Array<{ relativePath: string }>; revision: number }
      snapshots: Array<{ relativePath: string; existed: boolean; snapshotPath?: string }>
    }
    expect(stored.schema).toBe('workwise.git-checkpoint')
    expect(stored.checkpoint.repositoryRoot).toBe(await realpath(root))
    expect(stored.checkpoint.files.map((file) => file.relativePath)).toEqual(['README.md', 'new-file.ts'])
    expect(stored.snapshots.find((file) => file.relativePath === 'README.md')?.snapshotPath).toBeTruthy()
    expect(stored.snapshots.find((file) => file.relativePath === 'new-file.ts')).toMatchObject({ existed: false })
    expect(repository.get('task_git_guard')?.repositoryRoot).toBe(await realpath(root))
    expect(repository.events('task_git_guard').filter((event) => event.kind === 'git_checkpoint_created')).toHaveLength(1)
    repository.close()
  })

  it('binds a mutation to the nearest nested repository instead of the parent repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-runtime-nested-git-'))
    const storage = await mkdtemp(join(tmpdir(), 'workwise-runtime-nested-store-'))
    cleanup.push(root, storage)
    execFileSync('git', ['init', '-b', 'main', root], { stdio: 'pipe' })
    execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'])
    execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'])
    await writeFile(join(root, 'parent.txt'), 'parent\n')
    execFileSync('git', ['-C', root, 'add', 'parent.txt'])
    execFileSync('git', ['-C', root, 'commit', '-m', 'parent'], { stdio: 'pipe' })

    const nested = join(root, 'packages', 'nested')
    await mkdir(nested, { recursive: true })
    execFileSync('git', ['init', '-b', 'main', nested], { stdio: 'pipe' })
    execFileSync('git', ['-C', nested, 'config', 'user.email', 'test@example.com'])
    execFileSync('git', ['-C', nested, 'config', 'user.name', 'Test'])
    await writeFile(join(nested, 'nested.ts'), 'export const value = 1\n')
    execFileSync('git', ['-C', nested, 'add', 'nested.ts'])
    execFileSync('git', ['-C', nested, 'commit', '-m', 'nested'], { stdio: 'pipe' })

    const repository = new TaskRunRepository(join(storage, 'tasks.sqlite3'))
    repository.create(task(root))
    const coordinator = new GitCheckpointCoordinator(repository, storage)
    await coordinator.beforeMutation({
      absolutePath: join(nested, 'nested.ts'),
      relativePath: 'packages/nested/nested.ts',
      workspaceRoot: root,
      threadId: 'thread_git_guard'
    })

    expect(repository.get('task_git_guard')?.repositoryRoot).toBe(await realpath(nested))
    repository.close()
  })
})
