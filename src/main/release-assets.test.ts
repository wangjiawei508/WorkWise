import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempRoots: string[] = []

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('GitHub release asset preparation', () => {
  it('keeps updater ZIP architecture names and rewrites public installer names', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-release-assets-'))
    tempRoots.push(root)
    const input = join(root, 'input')
    const output = join(root, 'output')
    const files = new Map<string, string>([
      ['WorkWise-0.2.6-mac-arm64.dmg', 'arm dmg'],
      ['WorkWise-0.2.6-mac-x64.dmg', 'x64 dmg'],
      ['WorkWise-0.2.6-mac-arm64.zip', 'arm zip'],
      ['WorkWise-0.2.6-mac-x64.zip', 'x64 zip'],
      ['WorkWise-0.2.6-win-x64.exe', 'win exe'],
      ['WorkWise-0.2.6-win-x64.exe.blockmap', 'blockmap'],
      [
        'latest-mac.yml',
        [
          'version: 0.2.6',
          'files:',
          '  - url: WorkWise-0.2.6-mac-x64.zip',
          '  - url: WorkWise-0.2.6-mac-arm64.zip',
          '  - url: WorkWise-0.2.6-mac-x64.dmg',
          '  - url: WorkWise-0.2.6-mac-arm64.dmg',
          'path: WorkWise-0.2.6-mac-x64.zip',
          ''
        ].join('\n')
      ],
      [
        'latest.yml',
        [
          'version: 0.2.6',
          'files:',
          '  - url: WorkWise-0.2.6-win-x64.exe',
          'path: WorkWise-0.2.6-win-x64.exe',
          ''
        ].join('\n')
      ]
    ])

    mkdirSync(input, { recursive: true })
    for (const [name, contents] of files) writeFileSync(join(input, name), contents)

    execFileSync(
      process.execPath,
      [resolve('scripts/prepare-website-release-assets.cjs'), input, output, '0.2.6'],
      { stdio: 'pipe' }
    )

    expect(readdirSync(output).sort()).toEqual([
      'WorkWise-0.2.6-mac-Apple-Silicon.dmg',
      'WorkWise-0.2.6-mac-Intel.dmg',
      'WorkWise-0.2.6-mac-arm64.zip',
      'WorkWise-0.2.6-mac-x64.zip',
      'WorkWise-0.2.6-win-x64.exe',
      'WorkWise-0.2.6-win-x64.exe.blockmap',
      'latest-mac.yml',
      'latest.yml'
    ])

    const macMetadata = readFileSync(join(output, 'latest-mac.yml'), 'utf8')
    expect(macMetadata).toContain('WorkWise-0.2.6-mac-arm64.zip')
    expect(macMetadata).toContain('WorkWise-0.2.6-mac-x64.zip')
    expect(macMetadata).toContain('WorkWise-0.2.6-mac-Apple-Silicon.dmg')
    expect(macMetadata).toContain('WorkWise-0.2.6-mac-Intel.dmg')
  })
})
