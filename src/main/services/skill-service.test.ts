import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { installBundledSkill, installGithubSkill, listGuiSkills } from './skill-service'

const originalFetch = globalThis.fetch

describe('skill-service', () => {
  let tempRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'gui-skills-'))
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('discovers project Codex skills from the active workspace', async () => {
    const workspaceRoot = join(tempRoot, 'workspace')
    const skillRoot = join(workspaceRoot, '.codex', 'skills', 'openspec-apply-change')
    await mkdir(skillRoot, { recursive: true })
    await writeFile(join(skillRoot, 'SKILL.md'), [
      '---',
      'name: openspec-apply-change',
      'description: Implement tasks from an OpenSpec change.',
      '---',
      '',
      'Implement tasks from an OpenSpec change.'
    ].join('\n'), 'utf8')

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toContainEqual(expect.objectContaining({
      id: 'openspec-apply-change',
      name: 'Openspec Apply Change',
      description: 'Implement tasks from an OpenSpec change.',
      scope: 'project'
    }))
  })

  it('keeps legacy SKILL.md entries with Chinese frontmatter names distinct', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-cn')
    const skillRoot = join(workspaceRoot, '.agents', 'skills')
    const tddRoot = join(skillRoot, 'tdd')
    const reviewRoot = join(skillRoot, 'code-review')
    await mkdir(tddRoot, { recursive: true })
    await mkdir(reviewRoot, { recursive: true })
    await writeFile(join(tddRoot, 'SKILL.md'), [
      '---',
      'name: 测试驱动开发(TDD)',
      'description: 用测试先行推进实现。',
      '---',
      '',
      '# TDD',
      '',
      '先写失败测试，再实现。'
    ].join('\n'), 'utf8')
    await writeFile(join(reviewRoot, 'SKILL.md'), [
      '---',
      'name: 代码审查',
      'description: 检查回归风险。',
      '---',
      '',
      '# Review',
      '',
      '关注正确性和测试。'
    ].join('\n'), 'utf8')

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const projectSkills = result.skills.filter((skill) => skill.root.startsWith(skillRoot))
    expect(projectSkills).toHaveLength(2)
    expect(projectSkills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'tdd',
        name: '测试驱动开发(TDD)',
        description: '用测试先行推进实现。'
      }),
      expect.objectContaining({
        id: 'code-review',
        name: '代码审查',
        description: '检查回归风险。'
      })
    ]))
    expect(projectSkills.map((skill) => skill.id)).not.toContain('skill')
  })

  it('includes WorkWise source metadata when listing managed skills', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-managed')
    const skillRoot = join(workspaceRoot, '.agents', 'skills', 'di-bao-monitoring')
    await mkdir(skillRoot, { recursive: true })
    await writeFile(join(skillRoot, 'SKILL.md'), [
      '---',
      'name: di-bao-monitoring',
      'description: Railwise monitoring.',
      '---',
      '',
      '# Di-bao'
    ].join('\n'), 'utf8')
    await writeFile(join(skillRoot, '.workgpt-skill-source.json'), JSON.stringify({
      type: 'github',
      owner: 'railwise-cn',
      repo: 'di-bao-monitoring-skill',
      path: 'skill/di-bao-monitoring',
      ref: 'main',
      installedSha: 'abc123',
      autoUpdate: true
    }), 'utf8')

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toContainEqual(expect.objectContaining({
      id: 'di-bao-monitoring',
      source: {
        type: 'github',
        owner: 'railwise-cn',
        repo: 'di-bao-monitoring-skill',
        path: 'skill/di-bao-monitoring',
        ref: 'main',
        installedSha: 'abc123',
        autoUpdate: true
      }
    }))
  })

  it('installs the bundled operational monitoring skill with its assets', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-bundled')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')

    const installed = await installBundledSkill(skillInstallRoot, {
      id: 'operational-monitoring'
    })

    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    expect(installed.path).toBe(join(skillInstallRoot, 'operational-monitoring', 'SKILL.md'))
    expect(await readFile(join(skillInstallRoot, 'operational-monitoring', 'references', 'monitoring-scheme.md'), 'utf8'))
      .toContain('监测实施方案')
    const source = JSON.parse(
      await readFile(join(skillInstallRoot, 'operational-monitoring', '.workgpt-skill-source.json'), 'utf8')
    ) as Record<string, unknown>
    expect(source).toMatchObject({
      type: 'bundled',
      id: 'operational-monitoring',
      autoUpdate: false
    })

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toContainEqual(expect.objectContaining({
      id: 'operational-monitoring',
      source: {
        type: 'bundled',
        id: 'operational-monitoring',
        autoUpdate: false
      }
    }))
  })

  it('installs the bundled Railwise di-bao monitoring skill with its assets', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-bundled-dibao')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')

    const installed = await installBundledSkill(skillInstallRoot, {
      id: 'di-bao-monitoring'
    })

    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    expect(installed.path).toBe(join(skillInstallRoot, 'di-bao-monitoring', 'SKILL.md'))
    expect(await readFile(join(skillInstallRoot, 'di-bao-monitoring', 'assets', 'daily-report-template.md'), 'utf8'))
      .toContain('日报')
    const source = JSON.parse(
      await readFile(join(skillInstallRoot, 'di-bao-monitoring', '.workgpt-skill-source.json'), 'utf8')
    ) as Record<string, unknown>
    expect(source).toMatchObject({
      type: 'bundled',
      id: 'di-bao-monitoring',
      autoUpdate: false
    })
  })

  it('installs bundled GitHub-managed writing skills with update metadata', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-bundled-writing')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')

    const installed = await installBundledSkill(skillInstallRoot, {
      id: 'ai-flavor-remover'
    })

    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    expect(await readFile(join(skillInstallRoot, 'ai-flavor-remover', 'SKILL.md'), 'utf8'))
      .toContain('WorkWise Skill 包装')
    expect(await readFile(join(skillInstallRoot, 'ai-flavor-remover', 'README.md'), 'utf8'))
      .toContain('AI 味去除')
    const source = JSON.parse(
      await readFile(join(skillInstallRoot, 'ai-flavor-remover', '.workgpt-skill-source.json'), 'utf8')
    ) as Record<string, unknown>
    expect(source).toMatchObject({
      type: 'github',
      owner: 'hylarucoder',
      repo: 'ai-flavor-remover',
      path: '',
      ref: 'main',
      autoUpdate: true,
      includePaths: ['README.md'],
      overlaySkillId: 'ai-flavor-remover'
    })

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toContainEqual(expect.objectContaining({
      id: 'ai-flavor-remover',
      source: expect.objectContaining({
        type: 'github',
        owner: 'hylarucoder',
        repo: 'ai-flavor-remover',
        includePaths: ['README.md'],
        overlaySkillId: 'ai-flavor-remover'
      })
    }))
  })

  it('installs the bundled PPT Master slim skill with WorkWise overlay files', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-bundled-ppt-master')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')

    const installed = await installBundledSkill(skillInstallRoot, {
      id: 'ppt-master'
    })

    expect(installed.ok).toBe(true)
    if (!installed.ok) return
    const installedRoot = join(skillInstallRoot, 'ppt-master')
    expect(await readFile(join(installedRoot, 'SKILL.md'), 'utf8'))
      .toContain('PPT Master for WorkWise')
    expect(await readFile(join(installedRoot, 'requirements.txt'), 'utf8'))
      .not.toContain('pandoc')
    expect(await readFile(join(installedRoot, 'scripts', 'source_to_md', 'doc_to_md.py'), 'utf8'))
      .not.toMatch(/pandoc/i)
    expect(existsSync(join(installedRoot, 'scripts', 'confirm_ui', 'server.py'))).toBe(true)
    expect(existsSync(join(installedRoot, 'scripts', 'confirm_ui', 'static', 'index.html'))).toBe(true)
    expect(existsSync(join(installedRoot, 'scripts', 'docs', 'confirm_ui.md'))).toBe(true)
    expect(existsSync(join(installedRoot, 'scripts', 'svg_editor', 'static', 'index.html'))).toBe(true)
    expect(existsSync(join(installedRoot, 'templates', 'charts', 'charts_index.json'))).toBe(true)
    expect(existsSync(join(installedRoot, 'templates', 'layouts', 'layouts_index.json'))).toBe(true)
    expect(existsSync(join(installedRoot, 'templates', 'icons'))).toBe(false)
    expect(existsSync(join(installedRoot, 'projects', 'README.md'))).toBe(true)
    expect(existsSync(join(installedRoot, 'examples', 'README.md'))).toBe(true)
    expect(existsSync(join(
      installedRoot,
      'examples',
      'ppt169_顶级咨询风_构建有效AI代理_Anthropic',
      'design_spec.md'
    ))).toBe(true)
    expect(existsSync(join(
      installedRoot,
      'examples',
      'ppt169_顶级咨询风_构建有效AI代理_Anthropic',
      'exports'
    ))).toBe(false)
    expect(existsSync(join(
      installedRoot,
      'examples',
      'ppt169_顶级咨询风_构建有效AI代理_Anthropic',
      'svg_output'
    ))).toBe(false)
    const source = JSON.parse(
      await readFile(join(installedRoot, '.workgpt-skill-source.json'), 'utf8')
    ) as Record<string, unknown>
    expect(source).toMatchObject({
      type: 'github',
      owner: 'hugohe3',
      repo: 'ppt-master',
      path: 'skills/ppt-master',
      autoUpdate: true,
      overlaySkillId: 'ppt-master',
      includePaths: [
        'references',
        'workflows',
        'scripts',
        'templates/design_spec_reference.md',
        'templates/spec_lock_reference.md',
        'templates/charts',
        'templates/layouts'
      ]
    })

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toContainEqual(expect.objectContaining({
      id: 'ppt-master',
      name: 'Ppt Master',
      description: expect.stringContaining('生成和导出 PPT'),
      source: expect.objectContaining({
        type: 'github',
        owner: 'hugohe3',
        repo: 'ppt-master',
        path: 'skills/ppt-master',
        autoUpdate: true,
        overlaySkillId: 'ppt-master'
      })
    }))
  })

  it('prefers bundled skills unpacked beside app.asar in packaged apps', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-packaged-bundled')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')
    const resourcesPath = join(tempRoot, 'packaged-resources')
    const cwd = join(tempRoot, 'empty-cwd')
    const unpackedSkill = join(resourcesPath, 'app.asar.unpacked', 'src', 'asset', 'skills', 'packaged-skill')
    const archivedSkill = join(resourcesPath, 'app.asar', 'src', 'asset', 'skills', 'packaged-skill')
    await mkdir(unpackedSkill, { recursive: true })
    await mkdir(archivedSkill, { recursive: true })
    await mkdir(cwd, { recursive: true })
    await writeFile(join(unpackedSkill, 'SKILL.md'), '# Unpacked Skill\n', 'utf8')
    await writeFile(join(archivedSkill, 'SKILL.md'), '# Archived Skill\n', 'utf8')

    const originalCwd = process.cwd()
    const originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: resourcesPath
    })
    process.chdir(cwd)
    try {
      const installed = await installBundledSkill(skillInstallRoot, {
        id: 'packaged-skill'
      })

      expect(installed.ok).toBe(true)
      if (!installed.ok) return
      expect(await readFile(join(skillInstallRoot, 'packaged-skill', 'SKILL.md'), 'utf8'))
        .toBe('# Unpacked Skill\n')
    } finally {
      process.chdir(originalCwd)
      if (originalResourcesPath) {
        Object.defineProperty(process, 'resourcesPath', originalResourcesPath)
      } else {
        Reflect.deleteProperty(process, 'resourcesPath')
      }
    }
  })

  it('does not overwrite a user-created skill with the same bundled name', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-conflict')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')
    const existingSkill = join(skillInstallRoot, 'operational-monitoring')
    await mkdir(existingSkill, { recursive: true })
    await writeFile(join(existingSkill, 'SKILL.md'), '# Custom skill\n', 'utf8')

    const installed = await installBundledSkill(skillInstallRoot, {
      id: 'operational-monitoring'
    })

    expect(installed).toEqual({
      ok: false,
      message: 'Skill "operational-monitoring" already exists and is not managed by this source.'
    })
    expect(await readFile(join(existingSkill, 'SKILL.md'), 'utf8')).toBe('# Custom skill\n')
  })

  it('installs a GitHub managed skill recursively and records source metadata', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-github')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')
    const skillMarkdown = [
      '---',
      'name: di-bao-monitoring',
      'description: Railwise monitoring.',
      '---',
      '',
      '# Di-bao'
    ].join('\n')
    const referenceMarkdown = '# Reference\n'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/commits/main')) {
        return jsonResponse({ sha: 'sha-new' })
      }
      if (url.includes('/contents/skill/di-bao-monitoring/references')) {
        return jsonResponse([
          {
            name: 'guide.md',
            path: 'skill/di-bao-monitoring/references/guide.md',
            type: 'file',
            size: referenceMarkdown.length,
            download_url: 'https://raw.test/guide.md'
          }
        ])
      }
      if (url.includes('/contents/skill/di-bao-monitoring')) {
        return jsonResponse([
          {
            name: 'SKILL.md',
            path: 'skill/di-bao-monitoring/SKILL.md',
            type: 'file',
            size: skillMarkdown.length,
            download_url: 'https://raw.test/SKILL.md'
          },
          {
            name: 'references',
            path: 'skill/di-bao-monitoring/references',
            type: 'dir'
          }
        ])
      }
      if (url === 'https://raw.test/SKILL.md') {
        return new Response(skillMarkdown)
      }
      if (url === 'https://raw.test/guide.md') {
        return new Response(referenceMarkdown)
      }
      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const installed = await installGithubSkill(skillInstallRoot, {
      owner: 'railwise-cn',
      repo: 'di-bao-monitoring-skill',
      path: 'skill/di-bao-monitoring',
      ref: 'main',
      autoUpdate: true
    })

    expect(installed).toEqual({
      ok: true,
      path: join(skillInstallRoot, 'di-bao-monitoring', 'SKILL.md'),
      sha: 'sha-new',
      updated: true
    })
    expect(await readFile(join(skillInstallRoot, 'di-bao-monitoring', 'references', 'guide.md'), 'utf8'))
      .toBe(referenceMarkdown)
    const source = JSON.parse(
      await readFile(join(skillInstallRoot, 'di-bao-monitoring', '.workgpt-skill-source.json'), 'utf8')
    ) as Record<string, unknown>
    expect(source).toMatchObject({
      type: 'github',
      owner: 'railwise-cn',
      repo: 'di-bao-monitoring-skill',
      path: 'skill/di-bao-monitoring',
      ref: 'main',
      installedSha: 'sha-new',
      autoUpdate: true
    })
  })

  it('installs a GitHub managed skill from selected paths with a bundled overlay', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-github-overlay')
    const skillInstallRoot = join(workspaceRoot, '.agents', 'skills')
    const readmeMarkdown = '# AI 味去除\n'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/commits/main')) {
        return jsonResponse({ sha: 'sha-overlay' })
      }
      if (url.includes('/contents/README.md')) {
        return jsonResponse({
          name: 'README.md',
          path: 'README.md',
          type: 'file',
          size: readmeMarkdown.length,
          download_url: 'https://raw.test/README.md'
        })
      }
      if (url === 'https://raw.test/README.md') {
        return new Response(readmeMarkdown)
      }
      return new Response('not found', { status: 404, statusText: 'Not Found' })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const installed = await installGithubSkill(skillInstallRoot, {
      owner: 'hylarucoder',
      repo: 'ai-flavor-remover',
      path: '',
      ref: 'main',
      skillName: 'ai-flavor-remover',
      includePaths: ['README.md'],
      overlaySkillId: 'ai-flavor-remover',
      autoUpdate: true
    })

    expect(installed).toEqual({
      ok: true,
      path: join(skillInstallRoot, 'ai-flavor-remover', 'SKILL.md'),
      sha: 'sha-overlay',
      updated: true
    })
    expect(await readFile(join(skillInstallRoot, 'ai-flavor-remover', 'README.md'), 'utf8'))
      .toBe(readmeMarkdown)
    expect(await readFile(join(skillInstallRoot, 'ai-flavor-remover', 'SKILL.md'), 'utf8'))
      .toContain('WorkWise Skill 包装')
    const source = JSON.parse(
      await readFile(join(skillInstallRoot, 'ai-flavor-remover', '.workgpt-skill-source.json'), 'utf8')
    ) as Record<string, unknown>
    expect(source).toMatchObject({
      type: 'github',
      owner: 'hylarucoder',
      repo: 'ai-flavor-remover',
      path: '',
      ref: 'main',
      installedSha: 'sha-overlay',
      autoUpdate: true,
      includePaths: ['README.md'],
      overlaySkillId: 'ai-flavor-remover'
    })
  })

  function createSettings(workspaceRoot: string): AppSettingsV1 {
    return {
      version: 1,
      locale: 'en',
      theme: 'system',
      uiFontScale: 'small',
      provider: defaultModelProviderSettings(),
      agents: { kun: defaultKunRuntimeSettings() },
      workspaceRoot,
      log: { enabled: false, retentionDays: 7 },
      notifications: { turnComplete: true },
      appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
      keyboardShortcuts: defaultKeyboardShortcuts(),
      write: defaultWriteSettings(),
      claw: defaultClawSettings(),
      schedule: defaultScheduleSettings(),
      guiUpdate: { channel: 'stable' },
      codePromptPrefix: ''
    }
  }

  function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
