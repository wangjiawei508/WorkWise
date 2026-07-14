import { describe, expect, it } from 'vitest'
import { _internals } from './managed-tool-service'

describe('managed-tool-service', () => {
  it('selects the current platform asset with an explicit architecture name', () => {
    expect(_internals.platformAsset('officecli', '1.2.3', 'darwin', 'arm64')).toBe('officecli-mac-arm64')
    expect(_internals.platformAsset('officecli', '1.2.3', 'win32', 'x64')).toBe('officecli-win-x64.exe')
    expect(_internals.platformAsset('lark-cli', '1.2.3', 'darwin', 'x64')).toBe(
      'lark-cli-1.2.3-darwin-amd64.tar.gz'
    )
    expect(_internals.platformAsset('lark-cli', '1.2.3', 'win32', 'arm64')).toBe(
      'lark-cli-1.2.3-windows-arm64.zip'
    )
    expect(() => _internals.platformAsset('officecli', '1.2.3', 'linux', 'x64')).toThrow(
      'officecli is not supported on linux/x64'
    )
  })

  it('reads only the checksum belonging to the selected asset', () => {
    const wanted = 'a'.repeat(64)
    const other = 'b'.repeat(64)
    expect(_internals.checksumFor(`${other}  other.zip\n${wanted} *wanted.zip`, 'wanted.zip')).toBe(wanted)
    expect(() => _internals.checksumFor(`${other}  other.zip`, 'wanted.zip')).toThrow('Checksum is missing')
  })

  it('resolves official release versions and download URLs without the GitHub API', () => {
    expect(_internals.releaseVersionFromUrl('https://github.com/larksuite/cli/releases/tag/v1.0.68')).toBe('1.0.68')
    expect(_internals.releaseVersionFromHtml('<a href="/larksuite/cli/releases/tag/v1.0.68">latest</a>')).toBe('1.0.68')
    expect(_internals.releaseAssetUrl('larksuite/cli', '1.0.68', 'checksums.txt')).toBe(
      'https://github.com/larksuite/cli/releases/download/v1.0.68/checksums.txt'
    )
    expect(() => _internals.releaseVersionFromUrl('https://github.com/larksuite/cli/releases/latest')).toThrow('invalid')
  })

  it('rejects path traversal and absolute paths in release archives', () => {
    expect(_internals.archiveEntryIsSafe('lark-cli/bin/lark-cli')).toBe(true)
    expect(_internals.archiveEntryIsSafe('../outside')).toBe(false)
    expect(_internals.archiveEntryIsSafe('folder/../../outside')).toBe(false)
    expect(_internals.archiveEntryIsSafe('C:\\outside.exe')).toBe(false)
    expect(() => _internals.assertSafeArchiveListing('bin/lark-cli\n../outside')).toThrow('unsafe path')
  })
})
