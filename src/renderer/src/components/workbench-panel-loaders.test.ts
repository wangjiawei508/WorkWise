import { describe, expect, it } from 'vitest'
import { builtinRightPanelLoaders } from './workbench-panel-loaders'

describe('builtin right panel loaders', () => {
  it('loads the SDD assistant component instead of a placeholder module', async () => {
    const module = await builtinRightPanelLoaders['sdd-ai']()
    expect(module.SddAssistantPanel).toBeTypeOf('function')
  })

  it('loads the write assistant component instead of a placeholder module', async () => {
    const module = await builtinRightPanelLoaders['write-assistant']()
    expect(module.WriteAssistantPanel).toBeTypeOf('function')
  })
})
