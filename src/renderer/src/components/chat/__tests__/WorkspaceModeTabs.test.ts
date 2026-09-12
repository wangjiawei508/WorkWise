// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { WorkspaceModeTabs } from '../WorkspaceModeTabs'

type ActiveRoute = ComponentProps<typeof WorkspaceModeTabs>['activeRoute']

function renderTabs(activeRoute: ActiveRoute = 'chat'): string {
  return renderToStaticMarkup(
    createElement(WorkspaceModeTabs, {
      activeRoute,
      onCodeOpen: vi.fn(),
      onEngineeringOpen: vi.fn()
    })
  )
}

describe('WorkspaceModeTabs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each<ActiveRoute>(['chat', 'write', 'claw', 'schedule', 'design', 'flow', 'engineering', 'plugins', 'settings'])(
    'keeps Code and Survey as the only primary entries on the %s route',
    (activeView) => {
      const html = renderTabs(activeView)

      expect(html).toContain('Code')
      expect(html).toContain('Survey')
      expect(html).not.toContain('Write')
      expect(html).toContain('Code / Survey')
      expect(html).not.toContain('role="tab"')
      expect(html).not.toContain('role="tablist"')
    }
  )

  it('marks only the current primary workbench as selected', () => {
    const code = renderTabs('chat')
    const survey = renderTabs('engineering')
    const secondary = renderTabs('write')

    expect(code.match(/aria-current="page"/g)?.length).toBe(1)
    expect(survey.match(/aria-current="page"/g)?.length).toBe(1)
    expect(secondary).not.toContain('aria-current')
  })

  it('routes the fixed primary entries to Code and Survey', async () => {
    const onCodeOpen = vi.fn()
    const onEngineeringOpen = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(WorkspaceModeTabs, {
        activeRoute: 'write',
        onCodeOpen,
        onEngineeringOpen
      }))
    })

    const tabs = container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Code / Survey"] button')
    await act(async () => tabs[0]?.click())
    await act(async () => tabs[1]?.click())

    expect(onCodeOpen).toHaveBeenCalledOnce()
    expect(onEngineeringOpen).toHaveBeenCalledOnce()
    await act(async () => root.unmount())
    container.remove()
  })

  it('keeps a stable horizontal layout for narrow sidebars', () => {
    const html = renderTabs()

    expect(html).toContain('flex-row')
    expect(html).not.toContain('flex-col')
    expect(html.match(/flex-1/g)?.length).toBe(2)
    expect(html.match(/truncate/g)?.length).toBe(2)
    expect(html).toContain('min-w-0')
  })

  it('renders the Focus switch below the fixed primary entries', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceModeTabs, {
        activeRoute: 'write',
        focusModeEnabled: true,
        onCodeOpen: vi.fn(),
        onEngineeringOpen: vi.fn(),
        onToggleFocusMode: vi.fn()
      })
    )

    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('Focus')
    expect(html).toContain('On')
    expect(html).toContain('Code / Survey')
  })

  it('uses the configured language for both primary entries', async () => {
    await i18n.changeLanguage('zh')

    const html = renderTabs('write')

    expect(html).toContain('编程')
    expect(html).toContain('内业')
    expect(html).toContain('编程 / 内业')
  })
})
