import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentProfileService, builtInAgentProfiles } from './agent-profile-service'

const roots: string[] = []

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'workwise-agents-'))
  roots.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })))
})

function profile(id: string, name: string): string {
  return [
    '---',
    `id: ${id}`,
    `name: ${name}`,
    'role: 测试角色',
    'color: "#1688ff"',
    'tools: [read, grep]',
    'mcp: []',
    'trustLevel: read-only',
    'budget:',
    '  maxAttempts: 4',
    '  maxDurationMs: 60000',
    'revision: 1',
    '---',
    '',
    '只读取并汇总事实。',
    ''
  ].join('\n')
}

describe('AgentProfileService', () => {
  it('provides the four immutable built-in profiles', () => {
    expect(builtInAgentProfiles().map((entry) => entry.id)).toEqual([
      'general',
      'explore',
      'review',
      'research'
    ])
    expect(builtInAgentProfiles().every((entry) => entry.builtIn)).toBe(true)
  })

  it('lets workspace profiles override global profiles with the same id', async () => {
    const base = await root()
    const globalRoot = join(base, 'global')
    const workspace = join(base, 'workspace')
    await mkdir(join(workspace, '.workwise', 'agents'), { recursive: true })
    await mkdir(globalRoot, { recursive: true })
    await writeFile(join(globalRoot, 'custom.md'), profile('custom', 'Global'))
    await writeFile(join(workspace, '.workwise', 'agents', 'custom.md'), profile('custom', 'Workspace'))

    const snapshot = await new AgentProfileService(globalRoot).list(workspace)
    expect(snapshot.profiles.find((entry) => entry.id === 'custom')).toMatchObject({
      name: 'Workspace',
      source: 'workspace'
    })
  })

  it('isolates invalid and linked profiles as diagnostics', async () => {
    const base = await root()
    const globalRoot = join(base, 'global')
    await mkdir(globalRoot, { recursive: true })
    await writeFile(join(globalRoot, 'invalid.md'), 'missing frontmatter')
    await writeFile(join(base, 'outside.md'), profile('outside', 'Outside'))
    await symlink(join(base, 'outside.md'), join(globalRoot, 'linked.md'))

    const snapshot = await new AgentProfileService(globalRoot).list()
    expect(snapshot.profiles.some((entry) => entry.id === 'outside')).toBe(false)
    expect(snapshot.diagnostics.map((entry) => entry.code).sort()).toEqual([
      'invalid_frontmatter',
      'unsafe_path'
    ])
  })

  it('uses expectedRevision and refuses to overwrite built-ins', async () => {
    const base = await root()
    const service = new AgentProfileService(join(base, 'global'))
    const input = {
      id: 'writer',
      name: 'Writer',
      role: '写作',
      color: '#1688ff',
      systemPrompt: '交付清晰文档。',
      toolAllowlist: ['read', 'write'],
      mcpAllowlist: [],
      trustLevel: 'workspace-write' as const,
      budget: { maxAttempts: 8, maxDurationMs: 60000 }
    }
    const saved = await service.save({ scope: 'global', profile: input, expectedRevision: 0, idempotencyKey: 'save-writer' })
    expect(saved.revision).toBe(1)
    await expect(service.save({ scope: 'global', profile: input, expectedRevision: 0, idempotencyKey: 'save-writer' }))
      .resolves.toEqual(saved)
    await expect(service.save({ scope: 'global', profile: input, expectedRevision: 0 }))
      .rejects.toMatchObject({ code: 'stale_request' })
    await expect(service.save({ scope: 'global', profile: { ...input, id: 'general' } }))
      .rejects.toThrow(/read-only/)
  })
})
