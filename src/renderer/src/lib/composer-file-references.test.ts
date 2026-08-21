import { describe, expect, it } from 'vitest'
import {
  buildComposerFileContextPrompt,
  updateLegacyInlineFallbackKeys,
  runtimeWorkspaceReferences,
  selectComposerWorkspaceReference,
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
  it('clears legacy fallback provenance when legacy selections are removed or replaced', () => {
    const legacy = { ...runtimeFile, source: 'legacy' as const }
    const runtime = { ...runtimeFile, source: 'runtime' as const }
    const otherRuntime = {
      ...runtime,
      path: 'docs/runtime.md',
      relativePath: 'docs/runtime.md',
      name: 'runtime.md'
    }

    const selectedLegacy = updateLegacyInlineFallbackKeys([], { type: 'add', reference: legacy })
    expect(selectedLegacy).toEqual(['docs/投标 说明.md'])
    expect(updateLegacyInlineFallbackKeys(selectedLegacy, { type: 'add', reference: runtime })).toEqual([])

    const mixed = updateLegacyInlineFallbackKeys(selectedLegacy, { type: 'add', reference: otherRuntime })
    expect(mixed).toEqual(['docs/投标 说明.md'])
    expect(updateLegacyInlineFallbackKeys(mixed, {
      type: 'remove',
      relativePath: legacy.relativePath
    })).toEqual([])
    expect(updateLegacyInlineFallbackKeys(mixed, { type: 'clear' })).toEqual([])
  })

  it('stores only the relative path and kind from a search candidate', () => {
    expect(selectComposerWorkspaceReference(runtimeFile)).toEqual({
      relativePath: 'docs/投标 说明.md',
      kind: 'file'
    })
  })

  it('uses structured path-only references for a current Runtime thread', () => {
    expect(runtimeWorkspaceReferences('thr_1', [
      selectComposerWorkspaceReference(runtimeFile),
      selectComposerWorkspaceReference({
      path: 'src',
      relativePath: 'src',
      name: 'src',
      kind: 'directory',
      source: 'runtime'
      })
    ])).toEqual([
      { path: 'docs/投标 说明.md', kind: 'file' },
      { path: 'src', kind: 'directory' }
    ])
  })

  it('uses structured path-only references before a Runtime thread exists', () => {
    expect(runtimeWorkspaceReferences(null, [selectComposerWorkspaceReference(runtimeFile)])).toEqual([
      { path: 'docs/投标 说明.md', kind: 'file' }
    ])
  })

  it('requires an explicit compatibility flag before legacy references fall back to inline bodies', () => {
    const selectedLegacyReference = selectComposerWorkspaceReference({ ...runtimeFile, source: 'legacy' })
    expect(runtimeWorkspaceReferences('thr_1', [selectedLegacyReference])).toEqual([
      { path: 'docs/投标 说明.md', kind: 'file' }
    ])
    expect(runtimeWorkspaceReferences(
      'thr_1',
      [selectedLegacyReference],
      { allowLegacyInlineContext: true, legacyIndexFallback: true }
    )).toBeNull()

    const prompt = buildComposerFileContextPrompt('Review it.', [{
      relativePath: 'docs/legacy.md',
      content: 'LEGACY-BODY'
    }])
    expect(prompt).toContain('<workspace_file path="docs/legacy.md">')
    expect(prompt).toContain('LEGACY-BODY')
  })
})
