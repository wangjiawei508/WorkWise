import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { atomicWriteFile, atomicWriteFileLocked, serializeFileOperation } from '../adapters/file/atomic-write.js'
import type { TaskRunRepository } from './task-run-repository.js'

const execFileAsync = promisify(execFile)
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
const MAX_CHECKPOINT_FILES = 512

type SnapshotRecord = {
  relativePath: string
  existed: boolean
  snapshotPath?: string
  beforeSha256?: string
  originallyModified: boolean
}

type StoredCheckpoint = {
  schema: 'workwise.git-checkpoint'
  version: 1
  idempotencyKey: string
  checkpoint: {
    id: string
    taskId: string
    workspaceRoot: string
    repositoryRoot: string
    head: string
    originalStatus: string
    files: Array<{ relativePath: string; beforeSha256?: string; originallyModified: boolean }>
    createdAt: string
    revision: number
  }
  snapshots: SnapshotRecord[]
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedRelativePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

function statusPaths(output: string): string[] {
  const entries = output.split('\0').filter(Boolean)
  const paths: string[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!
    if (entry.length < 4) continue
    const status = entry.slice(0, 2)
    paths.push(normalizedRelativePath(entry.slice(3)))
    if (status.includes('R') || status.includes('C')) index += 1
  }
  return paths
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    timeout: 20_000,
    maxBuffer: 8 * 1024 * 1024,
    encoding: 'utf8'
  })
  return String(result.stdout)
}

function isContained(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && rel !== '..' && !isAbsolute(rel))
}

async function canonicalTarget(path: string): Promise<string> {
  const existing = await realpath(path).catch(() => null)
  if (existing) return existing
  const suffix = [basename(path)]
  let cursor = dirname(path)
  for (;;) {
    const canonical = await realpath(cursor).catch(() => null)
    if (canonical) return join(canonical, ...suffix)
    const parent = dirname(cursor)
    if (parent === cursor) throw Object.assign(new Error('No existing parent for Git checkpoint target.'), { code: 'unsafe_path' })
    suffix.unshift(basename(cursor))
    cursor = parent
  }
}

async function existingAncestor(path: string): Promise<string> {
  let cursor = path
  for (;;) {
    if (await access(cursor).then(() => true, () => false)) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) return cursor
    cursor = parent
  }
}

export class GitCheckpointCoordinator {
  private readonly storageRoot: string
  private readonly repository: TaskRunRepository

  constructor(repository: TaskRunRepository, storageRoot = join(homedir(), '.workwise', 'git-checkpoints')) {
    this.repository = repository
    this.storageRoot = resolve(storageRoot)
  }

  async beforeMutation(input: {
    absolutePath: string
    relativePath: string
    workspaceRoot: string
    threadId: string
  }): Promise<void> {
    const task = this.repository.findActiveByThread(input.threadId)
    if (!task) return
    const workspaceRoot = await realpath(input.workspaceRoot).catch(() => resolve(input.workspaceRoot))
    const target = await canonicalTarget(input.absolutePath)
    const repositoryCwd = await existingAncestor(dirname(target))
    const repositoryRoot = await git(repositoryCwd, ['rev-parse', '--show-toplevel'])
      .then((value) => realpath(value.trim()))
      .catch(() => null)
    if (!repositoryRoot || !isContained(workspaceRoot, repositoryRoot)) return
    if (!isContained(repositoryRoot, target)) return
    const relativePath = normalizedRelativePath(relative(repositoryRoot, target))
    const idempotencyKey = `task:${task.id}:first-write`
    const checkpointId = `gitcp_${sha256(`${task.id}:${idempotencyKey}`).slice(0, 20)}`
    const directory = join(this.storageRoot, checkpointId)
    const checkpointPath = join(directory, 'checkpoint.json')

    await serializeFileOperation(checkpointPath, async () => {
      const current = await readFile(checkpointPath, 'utf8')
        .then((value) => JSON.parse(value) as StoredCheckpoint)
        .catch(() => null)
      if (current?.snapshots.some((snapshot) => snapshot.relativePath === relativePath)) return
      if (current && current.snapshots.length >= MAX_CHECKPOINT_FILES) {
        throw Object.assign(new Error('Git checkpoint file limit reached.'), { code: 'resource_limit' })
      }

      if (!current) {
        const [head, originalStatus] = await Promise.all([
          git(repositoryRoot, ['rev-parse', 'HEAD']).then((value) => value.trim()),
          git(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
        ])
        const dirtyPaths = statusPaths(originalStatus)
        const candidates = [...new Set([...dirtyPaths, relativePath])].slice(0, MAX_CHECKPOINT_FILES)
        const snapshots = await Promise.all(candidates.map((path) => this.snapshot(repositoryRoot, directory, path, dirtyPaths.includes(path))))
        const createdAt = new Date().toISOString()
        const stored: StoredCheckpoint = {
          schema: 'workwise.git-checkpoint',
          version: 1,
          idempotencyKey,
          checkpoint: {
            id: checkpointId,
            taskId: task.id,
            workspaceRoot,
            repositoryRoot,
            head,
            originalStatus,
            files: snapshots.map((snapshot) => ({
              relativePath: snapshot.relativePath,
              beforeSha256: snapshot.beforeSha256,
              originallyModified: snapshot.originallyModified
            })),
            createdAt,
            revision: 0
          },
          snapshots
        }
        await atomicWriteFileLocked(checkpointPath, `${JSON.stringify(stored, null, 2)}\n`)
        this.bindRepository(task.id, repositoryRoot, checkpointId)
        return
      }

      const dirty = await git(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
      const snapshot = await this.snapshot(repositoryRoot, directory, relativePath, statusPaths(dirty).includes(relativePath))
      current.snapshots.push(snapshot)
      current.checkpoint.files.push({
        relativePath: snapshot.relativePath,
        beforeSha256: snapshot.beforeSha256,
        originallyModified: snapshot.originallyModified
      })
      current.checkpoint.revision += 1
      await atomicWriteFileLocked(checkpointPath, `${JSON.stringify(current, null, 2)}\n`)
    })
  }

  private async snapshot(
    repositoryRoot: string,
    directory: string,
    relativePath: string,
    originallyModified: boolean
  ): Promise<SnapshotRecord> {
    const target = resolve(repositoryRoot, relativePath)
    if (!isContained(repositoryRoot, target)) {
      throw Object.assign(new Error(`Unsafe Git checkpoint path: ${relativePath}`), { code: 'unsafe_path' })
    }
    const info = await lstat(target).catch(() => null)
    if (!info) return { relativePath, existed: false, originallyModified }
    if (!info.isFile() || info.isSymbolicLink()) {
      throw Object.assign(new Error(`Git checkpoint only supports regular files: ${relativePath}`), { code: 'unsafe_path' })
    }
    if (info.size > MAX_SNAPSHOT_BYTES) {
      throw Object.assign(new Error(`Git checkpoint file exceeds 5 MiB: ${relativePath}`), { code: 'resource_limit' })
    }
    const content = await readFile(target)
    const snapshotPath = join(directory, 'before', sha256(relativePath))
    await mkdir(dirname(snapshotPath), { recursive: true })
    await atomicWriteFile(snapshotPath, content)
    return {
      relativePath,
      existed: true,
      snapshotPath,
      beforeSha256: sha256(content),
      originallyModified
    }
  }

  private bindRepository(taskId: string, repositoryRoot: string, checkpointId: string): void {
    const current = this.repository.get(taskId)
    if (!current || current.repositoryRoot === repositoryRoot) return
    const now = new Date().toISOString()
    this.repository.update(taskId, current.revision, (task) => ({ ...task, repositoryRoot, updatedAt: now }), {
      key: `git-checkpoint:${checkpointId}`,
      kind: 'git_checkpoint_created',
      payload: { checkpointId, repositoryRoot },
      createdAt: now
    })
  }
}
