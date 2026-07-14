import { describe, expect, it } from 'vitest'
import {
  SDD_DRAFT_FILE_NAME,
  SDD_IMAGE_RELATIVE_DIR,
  buildSddDraftRelativePath,
  isSddDraftRelativePath,
  isSddImageRelativePath,
  normalizeSddRelativePath
} from './sdd'

describe('sdd shared paths', () => {
  it('builds a canonical draft requirement path', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    expect(buildSddDraftRelativePath(id)).toBe(`.workwise/sdd/draft/${id}/${SDD_DRAFT_FILE_NAME}`)
  })

  it('validates only uuid-backed requirement drafts', () => {
    expect(isSddDraftRelativePath('.workwise/sdd/draft/123e4567-e89b-12d3-a456-426614174000/requirement.md')).toBe(true)
    expect(isSddDraftRelativePath('.workwise/sdd/draft/not-a-uuid/requirement.md')).toBe(false)
    expect(isSddDraftRelativePath('.workwise/sdd/draft/123e4567-e89b-12d3-a456-426614174000/other.md')).toBe(false)
    expect(isSddDraftRelativePath('.workwise/sdd/draft/123e4567-e89b-12d3-a456-426614174000/nested/requirement.md')).toBe(false)
  })

  it('normalizes separators before image validation', () => {
    expect(normalizeSddRelativePath('./.workwise/sdd\\img\\wireframe.png')).toBe('.workwise/sdd/img/wireframe.png')
    expect(isSddImageRelativePath(`${SDD_IMAGE_RELATIVE_DIR}/wireframe.png`)).toBe(true)
    expect(isSddImageRelativePath(`${SDD_IMAGE_RELATIVE_DIR}/nested/wireframe.png`)).toBe(true)
    expect(isSddImageRelativePath(`${SDD_IMAGE_RELATIVE_DIR}/../escape.png`)).toBe(false)
    expect(isSddImageRelativePath('img/wireframe.png')).toBe(false)
  })
})
