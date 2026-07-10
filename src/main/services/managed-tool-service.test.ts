import { describe, expect, it } from 'vitest'
import { _internals } from './managed-tool-service'

describe('managed-tool-service', () => {
  it('selects the current platform asset with an explicit architecture name', () => {
    const office = _internals.platformAsset('officecli', '1.2.3')
    const lark = _internals.platformAsset('lark-cli', '1.2.3')
    expect(office).toMatch(/^officecli-(mac|win)-(arm64|x64)(\.exe)?$/)
    expect(lark).toMatch(/^lark-cli-1\.2\.3-(darwin|windows)-(arm64|amd64)\.(tar\.gz|zip)$/)
  })

  it('reads only the checksum belonging to the selected asset', () => {
    const wanted = 'a'.repeat(64)
    const other = 'b'.repeat(64)
    expect(_internals.checksumFor(`${other}  other.zip\n${wanted} *wanted.zip`, 'wanted.zip')).toBe(wanted)
    expect(() => _internals.checksumFor(`${other}  other.zip`, 'wanted.zip')).toThrow('Checksum is missing')
  })

  it('rejects path traversal and absolute paths in release archives', () => {
    expect(_internals.archiveEntryIsSafe('lark-cli/bin/lark-cli')).toBe(true)
    expect(_internals.archiveEntryIsSafe('../outside')).toBe(false)
    expect(_internals.archiveEntryIsSafe('folder/../../outside')).toBe(false)
    expect(_internals.archiveEntryIsSafe('C:\\outside.exe')).toBe(false)
    expect(() => _internals.assertSafeArchiveListing('bin/lark-cli\n../outside')).toThrow('unsafe path')
  })
})
