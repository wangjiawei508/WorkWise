import { describe, expect, it } from 'vitest'
import { startupShellLabel } from './App'

describe('startup shell', () => {
  it('uses the persisted window locale instead of flashing English', () => {
    expect(startupShellLabel('zh')).toBe('正在打开 WorkWise 工作台…')
    expect(startupShellLabel('en')).toBe('Opening WorkWise workbench…')
  })
})
