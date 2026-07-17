import { describe, expect, it } from 'vitest'
import { WRITE_EXPORT_FORMATS } from './write-workspace-view-utils'

describe('Write export menu', () => {
  it('offers real document formats instead of renamed HTML DOC files', () => {
    expect(WRITE_EXPORT_FORMATS).toEqual(['html', 'pdf', 'docx'])
  })
})
