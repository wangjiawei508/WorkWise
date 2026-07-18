import { describe, expect, it } from 'vitest'
import { MINERU_VERSION, MINERU_WHEEL, validateMineruResources } from './mineru-installer-service'

describe('MinerU installer policy', () => {
  it('pins the audited package and SHA-256', () => {
    expect(MINERU_VERSION).toBe('3.4.4')
    expect(MINERU_WHEEL.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(new URL(MINERU_WHEEL.url).hostname).toBe('files.pythonhosted.org')
  })

  it('blocks machines below the memory or disk requirements', () => {
    expect(validateMineruResources({ platform: 'darwin', memoryBytes: 8 * 1024 ** 3, freeDiskBytes: 10 * 1024 ** 3, pythonVersion: 'Python 3.12.4' })).toEqual([
      'MinerU requires at least 16 GB of memory.',
      'MinerU requires at least 20 GB of free disk space.'
    ])
  })

  it('rejects Python 3.13 on Windows but accepts it on macOS', () => {
    const input = { memoryBytes: 32 * 1024 ** 3, freeDiskBytes: 40 * 1024 ** 3, pythonVersion: 'Python 3.13.1' }
    expect(validateMineruResources({ platform: 'win32', ...input })).toContain('Windows requires Python 3.10–3.12.')
    expect(validateMineruResources({ platform: 'darwin', ...input })).toEqual([])
  })
})
