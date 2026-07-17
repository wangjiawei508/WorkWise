import { describe, expect, it } from 'vitest'
import { resolveGeneratedFileWorkspaceRoot } from './generated-file-path'

describe('generated file workspace roots', () => {
  it('uses only the trusted active-thread workspace', () => {
    expect(resolveGeneratedFileWorkspaceRoot('/write')).toBe('/write')
    expect(resolveGeneratedFileWorkspaceRoot('   ')).toBeUndefined()
  })
})
