import { describe, expect, it } from 'vitest'
import {
  buildComposerFileContextPrompt,
  runtimeWorkspaceReferences,
  type ComposerFileReference
} from './composer-file-references'

const runtimeFile: ComposerFileReference = {
  path: 'docs/投标 说明.md',
  relativePath: 'docs/投标 说明.md',
  name: '投标 说明.md',
  kind: 'file',
  source: 'runtime'
}

describe('composer workspace references', () => {
  it('uses structured path-only references for a current Runtime thread', () => {
    expect(runtimeWorkspaceReferences('thr_1', [runtimeFile, {
      path: 'src',
      relativePath: 'src',
      name: 'src',
      kind: 'directory',
      source: 'runtime'
    }])).toEqual([
      { path: 'docs/投标 说明.md', kind: 'file' },
      { path: 'src', kind: 'directory' }
    ])
  })

  it('uses structured path-only references before a Runtime thread exists', () => {
    expect(runtimeWorkspaceReferences(null, [runtimeFile])).toEqual([
      { path: 'docs/投标 说明.md', kind: 'file' }
    ])
  })

  it('requires an explicit compatibility flag before legacy references fall back to inline bodies', () => {
    expect(runtimeWorkspaceReferences('thr_1', [{ ...runtimeFile, source: 'legacy' }])).toEqual([
      { path: 'docs/投标 说明.md', kind: 'file' }
    ])
    expect(runtimeWorkspaceReferences(
      'thr_1',
      [{ ...runtimeFile, source: 'legacy' }],
      { allowLegacyInlineContext: true }
    )).toBeNull()

    const prompt = buildComposerFileContextPrompt('Review it.', [{
      relativePath: 'docs/legacy.md',
      content: 'LEGACY-BODY'
    }])
    expect(prompt).toContain('<workspace_file path="docs/legacy.md">')
    expect(prompt).toContain('LEGACY-BODY')
  })
})
