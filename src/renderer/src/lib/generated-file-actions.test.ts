import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  openGeneratedWorkspaceFile,
  revealGeneratedWorkspaceFile,
  saveGeneratedWorkspaceFileAs
} from './generated-file-actions'

afterEach(() => vi.unstubAllGlobals())

describe('generated file actions', () => {
  it('opens a verified workspace artifact with the system application', async () => {
    const openWorkspaceFile = vi.fn(async () => ({ ok: true as const }))
    vi.stubGlobal('window', { workwise: { openWorkspaceFile } })

    await expect(openGeneratedWorkspaceFile({
      path: 'output/deck.pptx',
      workspaceRoot: '/workspace'
    })).resolves.toEqual({ ok: true })
    expect(openWorkspaceFile).toHaveBeenCalledWith({
      path: 'output/deck.pptx',
      workspaceRoot: '/workspace'
    })
  })

  it('passes Save As and reveal through their validated bridges', async () => {
    const saveWorkspaceFileAs = vi.fn(async () => ({ ok: true as const, path: '/download/deck.pptx' }))
    const revealWorkspaceFile = vi.fn(async () => ({ ok: true as const }))
    vi.stubGlobal('window', { workwise: { saveWorkspaceFileAs, revealWorkspaceFile } })

    await expect(saveGeneratedWorkspaceFileAs({
      sourcePath: 'output/deck.pptx',
      workspaceRoot: '/workspace',
      suggestedName: 'deck.pptx'
    })).resolves.toEqual({ ok: true, path: '/download/deck.pptx' })
    await expect(revealGeneratedWorkspaceFile({
      path: 'output/deck.pptx',
      workspaceRoot: '/workspace'
    })).resolves.toEqual({ ok: true })
  })

  it('returns actionable failures when a bridge is missing or rejects', async () => {
    vi.stubGlobal('window', { workwise: { openWorkspaceFile: vi.fn(async () => { throw new Error('launch failed') }) } })
    await expect(openGeneratedWorkspaceFile({ path: 'deck.pptx' })).resolves.toEqual({
      ok: false,
      message: 'launch failed'
    })

    vi.stubGlobal('window', {})
    await expect(saveGeneratedWorkspaceFileAs({ dataBase64: 'YQ==' })).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('unavailable')
    })
  })
})
