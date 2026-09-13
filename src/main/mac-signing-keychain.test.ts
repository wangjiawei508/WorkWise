import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error JavaScript build helper intentionally has no declaration file.
import { withMacSigningKeychain } from '../../scripts/with-mac-signing-keychain.mjs'

describe('isolated macOS build keychain', () => {
  function fixture(failImport = false) {
    let password = ''
    let owned = ''
    let list = ['/existing/login.keychain-db']
    const security = vi.fn((args: string[]) => {
      if (args[0] === 'create-keychain') {
        password = args[2]
        owned = args[3]
      }
      if (args[0] === 'import') {
        if (failImport) throw new Error('import failed')
        expect(args[args.indexOf('-P') + 1]).toBe('certificate-password')
      }
      if (args[0] === 'set-key-partition-list') {
        // Model the real security tool: the certificate password cannot unlock
        // a keychain that was created with an independent password.
        if (args[args.indexOf('-k') + 1] !== password) throw new Error('SecKeychainUnlock')
        expect(password).not.toBe('certificate-password')
      }
      if (args[0] === 'find-identity') return `1) ${'A'.repeat(40)} "Developer ID Application: Test"`
      if (args[0] === 'list-keychains') {
        if (args[3] === '-s') list = args.slice(4)
        return list.map((path) => `"${path}"`).join('\n')
      }
      return ''
    })
    return { security, owned: () => owned, list: () => list, add: (path: string) => list.push(path) }
  }

  it('uses the keychain password, prevents reimport, and preserves other keychains after a failed build', async () => {
    const state = fixture()
    const run = vi.fn(async (_command, _args, env) => {
      expect(env.CSC_LINK).toBeUndefined()
      expect(env.CSC_KEY_PASSWORD).toBeUndefined()
      expect(env.CSC_KEYCHAIN).toBe(state.owned())
      expect(env.MAC_SIGN).toBe('1')
      expect(env.APPLE_API_KEY).toBe('/notary.p8')
      state.add('/another/new.keychain-db')
      return 7
    })
    expect(await withMacSigningKeychain('npm', ['run', 'dist:mac:signed'], {
      env: { CSC_LINK: '/certificate.p12', CSC_KEY_PASSWORD: 'certificate-password', APPLE_API_KEY: '/notary.p8' },
      security: state.security, run
    })).toBe(7)
    expect(state.list()).toEqual(['/existing/login.keychain-db', '/another/new.keychain-db'])
    expect(state.security).toHaveBeenLastCalledWith(['delete-keychain', state.owned()])
  })

  it('does not build after import fails and still removes its own keychain', async () => {
    const state = fixture(true)
    const run = vi.fn()
    await expect(withMacSigningKeychain('npm', ['run', 'dist:mac:signed'], {
      env: { CSC_LINK: '/certificate.p12', CSC_KEY_PASSWORD: 'certificate-password' },
      security: state.security, run
    })).rejects.toThrow('import failed')
    expect(run).not.toHaveBeenCalled()
    expect(state.list()).toEqual(['/existing/login.keychain-db'])
    expect(state.security).toHaveBeenLastCalledWith(['delete-keychain', state.owned()])
  })
})
