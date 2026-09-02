import { describe, expect, it } from 'vitest'

describe('Workbench responsive panel contract', () => {
  it('keeps both sidebars as overlay drawers at narrow widths', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const [workbench, surfaces, baseShell] = await Promise.all([
      readFile(new URL('./Workbench.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../styles/surfaces-write.css', import.meta.url), 'utf8'),
      readFile(new URL('../styles/base-shell.css', import.meta.url), 'utf8')
    ])

    expect(workbench).toContain('ds-workbench-left-panel')
    expect(workbench).toContain('ds-workbench-right-panel')
    expect(workbench).toContain('ds-workbench-left-divider')
    expect(workbench).toContain('ds-workbench-right-divider')
    expect(surfaces).toMatch(/@media \(max-width: 960px\)[\s\S]*\.ds-workbench-right-panel[\s\S]*position: absolute/)
    expect(surfaces).toMatch(/@media \(max-width: 720px\)[\s\S]*\.ds-workbench-left-panel[\s\S]*position: absolute/)
    expect(baseShell).toMatch(/\.ds-workbench-divider\s*\{[\s\S]*width: 1px;[\s\S]*flex: 0 0 1px;[\s\S]*background: transparent;/)
    expect(baseShell).toMatch(/\.ds-workbench-divider::before\s*\{\s*content: none;/)
    expect(baseShell).toMatch(/\.ds-workbench-divider::after\s*\{\s*content: none;/)
    expect(baseShell).not.toMatch(/\.ds-workbench-divider:hover::(before|after)/)
  })

  it('routes notification clicks to the requested chat thread', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const workbench = await readFile(new URL('./Workbench.tsx', import.meta.url), 'utf8')
    const notificationHandler = workbench.match(
      /onNotificationOpenThread\(\(threadId\) => \{([\s\S]*?)\n\s*\}\)/
    )?.[1] ?? ''
    const openThread = workbench.match(
      /const openThread = \(id: string\): void => \{([\s\S]*?)\n\s*\}/
    )?.[1] ?? ''

    expect(notificationHandler).toContain('notificationOpenThreadRef.current(threadId)')
    expect(workbench).toContain("if (runtimeConnection !== 'ready') return")
    expect(workbench).toContain('pendingNotificationThreadRef.current')
    expect(workbench).toContain("setRoute('chat')")
    expect(openThread).toContain('selectThread(id)')
  })

  it('keeps Design assistant history out of Code and routes it back to its Design document', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const workbench = await readFile(new URL('./Workbench.tsx', import.meta.url), 'utf8')

    expect(workbench).toMatch(/const codeThreads = useMemo\([\s\S]*?!isDesignAssistantThread\(thread\)/)
    const openThread = workbench.match(
      /const openThread = \(id: string\): void => \{([\s\S]*?)\n\s*\}/
    )?.[1] ?? ''
    expect(openThread).toContain('isDesignAssistantThread(selectedThread)')
    expect(openThread).toContain('requestDesignDocumentOpen(documentId)')
    expect(openThread).toContain("setRoute('design')")
  })

  it('uses an engineering-only project sidebar rather than the Programming thread list', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const [sidebar, engineeringSidebar] = await Promise.all([
      readFile(new URL('./chat/Sidebar.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./engineering/EngineeringSidebarContent.tsx', import.meta.url), 'utf8')
    ])

    expect(sidebar).toContain("activeView === 'engineering'")
    expect(sidebar).toContain('<EngineeringSidebarContent')
    expect(engineeringSidebar).toContain("/v1/engineering/projects")
    expect(engineeringSidebar).toContain('project.workspace === workspaceRoot')
    expect(engineeringSidebar).toContain('dispatchEngineeringProjectOpen(project.id)')
    expect(engineeringSidebar).not.toContain('SidebarProjectsSection')
  })

  it('opens Engineering on an AI command center with a deterministic delivery path', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const [engineering, aiCommandCenter] = await Promise.all([
      readFile(new URL('./engineering/EngineeringWorkspaceView.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./engineering/EngineeringAiCommandCenter.tsx', import.meta.url), 'utf8')
    ])

    expect(engineering).toContain("type TabId = 'ai-command'")
    expect(engineering).toContain("useState<TabId>('ai-command')")
    expect(engineering).toContain('<EngineeringAiCommandCenter')
    expect(aiCommandCenter).toContain('工程 AI 指挥台')
    expect(engineering).toContain('交付控制台')
    expect(engineering).toContain('<DeliveryStage index={1}')
    expect(engineering).toContain('<DeliveryStage index={6}')
    expect(engineering).toContain('原始文件保持不变；每次数据、阈值或字段映射的变化都会产生新的运行版本')
  })
})
