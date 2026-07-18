import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RepoMapService } from './repo-map-service'

let root = ''
let cache = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'workwise-repo-map-'))
  cache = await mkdtemp(join(tmpdir(), 'workwise-repo-map-cache-'))
  execFileSync('git', ['init', '-b', 'main', root], { stdio: 'pipe' })
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'])
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'a.ts'), 'export function greet(name: string): string { return `hi ${name}` }\n')
  await writeFile(join(root, 'src', 'b.ts'), "import { greet } from './a'\nexport const message = greet('WorkWise')\n")
  await writeFile(join(root, '.gitignore'), 'node_modules\n')
  execFileSync('git', ['-C', root, 'add', '.'])
  execFileSync('git', ['-C', root, 'commit', '-m', 'baseline'], { stdio: 'pipe' })
})

afterEach(async () => {
  await Promise.all([root, cache].filter(Boolean).map((path) => rm(path, { recursive: true, force: true })))
})

describe('RepoMapService', () => {
  it('builds a budgeted symbol/import map and supports cached query', async () => {
    const service = new RepoMapService(cache)
    const result = await service.build({
      workspaceRoot: root,
      repositoryRoot: root,
      idempotencyKey: 'build-1'
    })
    expect(result.filesIndexed).toBe(2)
    expect(result.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'greet', kind: 'function', relativePath: 'src/a.ts', exported: true }),
      expect.objectContaining({ name: 'message', kind: 'variable', relativePath: 'src/b.ts', exported: true })
    ]))
    expect(result.imports).toContainEqual({ from: 'src/b.ts', to: './a' })

    const filtered = await service.query({ repositoryRoot: root, query: 'greet' })
    expect(filtered.symbols.map((entry) => entry.name)).toEqual(['greet'])
  })

  it('answers TypeScript definition, references, hover and diagnostics', async () => {
    const service = new RepoMapService(cache)
    await service.build({ workspaceRoot: root, repositoryRoot: root, idempotencyKey: 'build-lsp' })

    const definition = await service.lsp({
      workspaceRoot: root,
      repositoryRoot: root,
      relativePath: 'src/b.ts',
      line: 2,
      column: 25,
      kind: 'definition'
    })
    expect(definition.items[0]).toMatchObject({ relativePath: 'src/a.ts', line: 1, name: 'greet' })

    const references = await service.lsp({
      workspaceRoot: root,
      repositoryRoot: root,
      relativePath: 'src/a.ts',
      line: 1,
      column: 17,
      kind: 'references'
    })
    expect(references.items.some((item) => item.relativePath === 'src/b.ts')).toBe(true)

    const hover = await service.lsp({
      workspaceRoot: root,
      repositoryRoot: root,
      relativePath: 'src/b.ts',
      line: 2,
      column: 25,
      kind: 'hover'
    })
    expect(hover.items[0]?.text).toContain('greet')

    const diagnostics = await service.lsp({
      workspaceRoot: root,
      repositoryRoot: root,
      relativePath: 'src/b.ts',
      line: 1,
      column: 1,
      kind: 'diagnostics'
    })
    expect(diagnostics.items).toEqual([])
  })
})
