// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitBranchPicker } from './GitBranchPicker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

let container: HTMLDivElement
let root: Root

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('GitBranchPicker', () => {
  it('keeps the authorized request root after discovering a parent repository', async () => {
    const getGitBranches = vi.fn(async () => ({
      ok: true as const,
      repositoryRoot: '/repo',
      repositories: [{ root: '/repo', relativePath: 'repo' }],
      currentBranch: 'main',
      branches: [
        { name: 'main', current: true },
        { name: 'feature/test', current: false }
      ],
      dirtyCount: 0
    }))
    const switchGitBranch = vi.fn(async () => getGitBranches())
    Object.defineProperty(window, 'workwise', {
      configurable: true,
      value: { getGitBranches, switchGitBranch }
    })

    await act(async () => {
      root.render(createElement(GitBranchPicker, { workspaceRoot: '/repo/authorized-child' }))
    })
    await settle()
    expect(getGitBranches).toHaveBeenCalledTimes(1)
    expect(getGitBranches).toHaveBeenLastCalledWith('/repo/authorized-child')

    const trigger = container.querySelector('button')
    await act(async () => trigger?.click())
    await settle()
    expect(getGitBranches).toHaveBeenLastCalledWith('/repo/authorized-child')

    const branch = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('feature/test'))
    await act(async () => branch?.click())
    await settle()

    expect(switchGitBranch).toHaveBeenCalledWith('/repo/authorized-child', 'feature/test')
  })
})
