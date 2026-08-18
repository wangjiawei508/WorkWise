import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('WorkWise brand boundary', () => {
  it('allows legacy path guards in the isolated candidate authorization script', () => {
    expect(() => execFileSync(process.execPath, ['scripts/verify-brand-boundary.mjs'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    })).not.toThrow()
  })
})
