import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitCheckpointService } from './git-checkpoint-service'

let root = ''
let storage = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'workwise-git-checkpoint-repo-'))
  storage = await mkdtemp(join(tmpdir(), 'workwise-git-checkpoint-store-'))
  execFileSync('git', ['init', '-b', 'main', root], { stdio: 'pipe' })
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'])
  await writeFile(join(root, 'README.md'), 'baseline\n')
  execFileSync('git', ['-C', root, 'add', 'README.md'])
  execFileSync('git', ['-C', root, 'commit', '-m', 'baseline'], { stdio: 'pipe' })
})

afterEach(async () => {
  await Promise.all([root, storage].filter(Boolean).map((path) => rm(path, { recursive: true, force: true })))
})

describe('GitCheckpointService', () => {
  it('previews and restores only a clean-at-start task file', async () => {
    const service = new GitCheckpointService(storage)
    const checkpoint = await service.create({
      taskId: 'task-safe',
      workspaceRoot: root,
      repositoryRoot: root,
      relatedPaths: ['README.md'],
      idempotencyKey: 'create-safe'
    })
    await writeFile(join(root, 'README.md'), 'task change\n')

    const preview = await service.preview({ checkpointId: checkpoint.id })
    expect(preview.safe).toBe(true)
    expect(preview.changedFiles).toHaveLength(1)
    expect(preview.changedFiles[0]?.diff).toContain('task change')

    const applied = await service.apply({ checkpointId: checkpoint.id, expectedRevision: 0, idempotencyKey: 'apply-safe' })
    expect(applied).toMatchObject({ safe: true })
    await expect(readFile(join(root, 'README.md'), 'utf8')).resolves.toBe('baseline\n')
    await expect(new GitCheckpointService(storage).apply({
      checkpointId: checkpoint.id,
      expectedRevision: 0,
      idempotencyKey: 'apply-safe'
    })).resolves.toEqual(applied)
  })

  it('refuses to overwrite a file that was already modified before the task', async () => {
    await writeFile(join(root, 'README.md'), 'user change\n')
    const service = new GitCheckpointService(storage)
    const checkpoint = await service.create({
      taskId: 'task-conflict',
      workspaceRoot: root,
      relatedPaths: ['README.md'],
      idempotencyKey: 'create-conflict'
    })
    await writeFile(join(root, 'README.md'), 'user and task change\n')

    const preview = await service.preview({ checkpointId: checkpoint.id })
    expect(preview).toMatchObject({ safe: false })
    expect(preview.changedFiles[0]).toMatchObject({ relativePath: 'README.md', conflict: true })

    const blocked = await service.apply({ checkpointId: checkpoint.id, expectedRevision: 0, idempotencyKey: 'apply-conflict' })
    expect(blocked.safe).toBe(false)
    expect(blocked.rescueRef).toMatch(/^workwise\/rescue\//)
    await expect(readFile(join(root, 'README.md'), 'utf8')).resolves.toBe('user and task change\n')
  })

  it('returns the same checkpoint for the same idempotency key', async () => {
    const service = new GitCheckpointService(storage)
    const request = {
      taskId: 'task-idempotent',
      workspaceRoot: root,
      relatedPaths: ['README.md'],
      idempotencyKey: 'same-key'
    }
    const first = await service.create(request)
    const second = await service.create(request)
    expect(second).toEqual(first)
  })

  it('rejects a stale rollback revision before changing files', async () => {
    const service = new GitCheckpointService(storage)
    const checkpoint = await service.create({
      taskId: 'task-stale',
      workspaceRoot: root,
      relatedPaths: ['README.md'],
      idempotencyKey: 'create-stale'
    })
    await writeFile(join(root, 'README.md'), 'task change\n')
    await expect(service.apply({ checkpointId: checkpoint.id, expectedRevision: 9, idempotencyKey: 'apply-stale' }))
      .rejects.toMatchObject({ code: 'stale_request' })
    await expect(readFile(join(root, 'README.md'), 'utf8')).resolves.toBe('task change\n')
  })
})
