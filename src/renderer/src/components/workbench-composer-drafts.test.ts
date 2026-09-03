import { describe, expect, it } from 'vitest'
import {
  createWorkbenchComposerDrafts,
  setWorkbenchComposerDraft,
  workbenchComposerScope
} from './workbench-composer-drafts'

describe('workbench composer drafts', () => {
  it('keeps Code and Write in separate composer scopes', () => {
    expect(workbenchComposerScope('chat')).toBe('code')
    expect(workbenchComposerScope('write')).toBe('write')
    expect(workbenchComposerScope('design')).toBe('detached')
    expect(workbenchComposerScope('engineering')).toBe('detached')
  })

  it('updates one surface without leaking the draft into another', () => {
    const initial = createWorkbenchComposerDrafts()
    const withWriteDraft = setWorkbenchComposerDraft(initial, 'write', '监测报告草稿')

    expect(withWriteDraft).toEqual({
      code: '',
      write: '监测报告草稿',
      detached: ''
    })

    const withCodeDraft = setWorkbenchComposerDraft(withWriteDraft, 'code', '修复代码')
    expect(withCodeDraft.write).toBe('监测报告草稿')
    expect(withCodeDraft.code).toBe('修复代码')
  })
})
