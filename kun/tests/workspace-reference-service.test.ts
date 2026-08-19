import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkspaceReferenceService } from '../src/services/workspace-reference-service.js'
import { workspaceReferenceInstruction } from '../src/loop/agent-loop.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kun-workspace-reference-'))
  roots.push(root)
  return root
}

describe('WorkspaceReferenceService', () => {
  it('builds path-only model context without file bodies', () => {
    const instruction = workspaceReferenceInstruction([
      { path: '投标 文档/报价 & 说明.md', kind: 'file' },
      { path: 'src/components', kind: 'directory' }
    ])

    expect(instruction).toContain('path="投标 文档/报价 &amp; 说明.md" kind="file"')
    expect(instruction).toContain('path="src/components" kind="directory"')
    expect(instruction).not.toContain('PRIVATE-FILE-BODY')
    expect(instruction).not.toContain('<workspace_file')
  })

  it('indexes files and directories with Chinese and space-containing paths', async () => {
    const root = await workspace()
    await mkdir(join(root, '投标 文档'), { recursive: true })
    await writeFile(join(root, '投标 文档', '报价 表.md'), '# 报价')

    const result = await new WorkspaceReferenceService().search({
      workspaceRoot: root,
      query: '报价'
    })

    expect(result.entries).toContainEqual({
      path: '投标 文档/报价 表.md',
      name: '报价 表.md',
      kind: 'file',
      depth: 2
    })
    const directories = await new WorkspaceReferenceService().search({
      workspaceRoot: root,
      query: '投标'
    })
    expect(directories.entries).toContainEqual({
      path: '投标 文档',
      name: '投标 文档',
      kind: 'directory',
      depth: 1
    })
  })

  it('ignores dependency directories and excludes symbolic links', async () => {
    const root = await workspace()
    const outside = await workspace()
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'pkg', 'secret.txt'), 'ignored')
    await writeFile(join(outside, 'outside.txt'), 'outside')
    await symlink(join(outside, 'outside.txt'), join(root, 'linked.txt'))

    const result = await new WorkspaceReferenceService().search({ workspaceRoot: root })

    expect(result.entries).toEqual([])
    await expect(new WorkspaceReferenceService().validateReferences(root, [
      { path: 'linked.txt', kind: 'file' }
    ])).rejects.toThrow(/symlink/u)
  })

  it('rejects escaping, missing, and kind-mismatched references', async () => {
    const root = await workspace()
    await mkdir(join(root, 'source docs'), { recursive: true })
    await writeFile(join(root, 'notes.txt'), 'notes')
    const service = new WorkspaceReferenceService()

    await expect(service.validateReferences(root, [{ path: '../notes.txt', kind: 'file' }]))
      .rejects.toThrow(/escapes/u)
    await expect(service.validateReferences(root, [{ path: './notes.txt', kind: 'file' }]))
      .rejects.toThrow(/escapes/u)
    await expect(service.validateReferences(root, [{ path: 'missing.txt', kind: 'file' }]))
      .rejects.toThrow(/does not exist/u)
    await expect(service.validateReferences(root, [{ path: 'notes.txt', kind: 'directory' }]))
      .rejects.toThrow(/kind mismatch/u)
    await expect(service.validateReferences(root, [{ path: 'source docs', kind: 'directory' }]))
      .resolves.toEqual([{ path: 'source docs', kind: 'directory' }])
  })

  it('bounds the index and reports truncation', async () => {
    const root = await workspace()
    await Promise.all(['a.txt', 'b.txt', 'c.txt'].map((name) => writeFile(join(root, name), name)))
    const result = await new WorkspaceReferenceService({ maxEntries: 2 }).search({ workspaceRoot: root })

    expect(result.entries).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('indexes through depth eight without traversing depth nine', async () => {
    const root = await workspace()
    let current = root
    for (let depth = 1; depth <= 9; depth += 1) {
      current = join(current, `level-${depth}`)
      await mkdir(current)
      await writeFile(join(current, `file-${depth}.txt`), String(depth))
    }

    const result = await new WorkspaceReferenceService().search({ workspaceRoot: root })

    expect(result.entries).toContainEqual(expect.objectContaining({
      path: 'level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8',
      kind: 'directory',
      depth: 8
    }))
    expect(result.entries.some((entry) => entry.path.includes('level-9'))).toBe(false)
    expect(result.truncated).toBe(true)
  })

  it('uses the cached index until TTL expiry and supports explicit invalidation', async () => {
    const root = await workspace()
    let now = 1_000
    const service = new WorkspaceReferenceService({ ttlMs: 30_000, nowMs: () => now })
    await writeFile(join(root, 'first.txt'), 'first')
    expect((await service.search({ workspaceRoot: root })).entries.map((entry) => entry.name)).toEqual(['first.txt'])

    await writeFile(join(root, 'second.txt'), 'second')
    expect((await service.search({ workspaceRoot: root })).entries.map((entry) => entry.name)).toEqual(['first.txt'])

    now += 30_001
    expect((await service.search({ workspaceRoot: root })).entries.map((entry) => entry.name)).toEqual([
      'first.txt',
      'second.txt'
    ])

    await writeFile(join(root, 'third.txt'), 'third')
    await service.invalidate(root)
    expect((await service.search({ workspaceRoot: root })).entries.map((entry) => entry.name).sort()).toEqual([
      'first.txt',
      'second.txt',
      'third.txt'
    ])
  })

  it('reports the index build timestamp and refreshes it after the default 30 second TTL', async () => {
    const root = await workspace()
    let now = 1_000
    const service = new WorkspaceReferenceService({
      nowMs: () => now,
      nowIso: () => new Date(now).toISOString()
    })
    await writeFile(join(root, 'first.txt'), 'first')

    const first = await service.search({ workspaceRoot: root })
    now += 30_000
    const refreshed = await service.search({ workspaceRoot: root })

    expect(first.indexedAt).toBe('1970-01-01T00:00:01.000Z')
    expect(refreshed.indexedAt).toBe('1970-01-01T00:00:31.000Z')
  })
})
