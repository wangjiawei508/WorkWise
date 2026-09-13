#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function security(args) {
  const result = spawnSync('/usr/bin/security', args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    // Never print command arguments: import and keychain commands contain secrets.
    throw new Error(`security ${args[0]} failed (exit ${result.status ?? 'unknown'}).`)
  }
  return result.stdout
}

function keychains(output) {
  return output.split('\n').map((line) => line.trim().replace(/^"|"$/g, '')).filter(Boolean)
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })
}

export async function withMacSigningKeychain(command, args, options = {}) {
  const env = options.env ?? process.env
  const executeSecurity = options.security ?? security
  const executeBuild = options.run ?? run
  if (!command) throw new Error('Usage: with-mac-signing-keychain.mjs <command> [args...]')
  if (!env.CSC_LINK || !env.CSC_KEY_PASSWORD) {
    throw new Error('CSC_LINK and CSC_KEY_PASSWORD are required for signed packaging.')
  }
  const root = mkdtempSync(join(tmpdir(), 'workwise-signing-'))
  const keychain = join(root, 'build.keychain-db')
  const keychainPassword = randomBytes(32).toString('hex')
  let created = false
  try {
    executeSecurity(['create-keychain', '-p', keychainPassword, keychain])
    created = true
    executeSecurity(['unlock-keychain', '-p', keychainPassword, keychain])
    executeSecurity(['set-keychain-settings', '-lut', '21600', keychain])
    executeSecurity(['import', env.CSC_LINK, '-k', keychain, '-P', env.CSC_KEY_PASSWORD,
      '-T', '/usr/bin/codesign', '-T', '/usr/bin/productbuild'])
    // electron-builder 26.8.1 passes the P12 password here. This command needs
    // the independently generated KEYCHAIN password, not the certificate password.
    executeSecurity(['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', keychainPassword, keychain])
    const identities = executeSecurity(['find-identity', '-v', '-p', 'codesigning', keychain])
    if (!/\b[0-9A-Fa-f]{40}\s+"Developer ID Application:/.test(identities)) {
      throw new Error('The build keychain has no valid Developer ID Application identity.')
    }
    const previous = keychains(executeSecurity(['list-keychains', '-d', 'user']))
    executeSecurity(['list-keychains', '-d', 'user', '-s', keychain, ...previous])
    const buildEnv = { ...env, CSC_KEYCHAIN: keychain, MAC_SIGN: '1' }
    // Select electron-builder's existing-keychain path; do not import again.
    delete buildEnv.CSC_LINK
    delete buildEnv.CSC_KEY_PASSWORD
    console.log('[mac-signing] Dedicated keychain ready; Developer ID identity verified.')
    return await executeBuild(command, args, buildEnv)
  } finally {
    if (created) {
      try {
        const current = keychains(executeSecurity(['list-keychains', '-d', 'user']))
        executeSecurity(['list-keychains', '-d', 'user', '-s', ...current.filter((path) => path !== keychain)])
      } finally {
        executeSecurity(['delete-keychain', keychain])
      }
    }
    rmSync(root, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  withMacSigningKeychain(process.argv[2], process.argv.slice(3)).then((code) => {
    process.exitCode = code
  }).catch((error) => {
    console.error(`[mac-signing] ${error.message}`)
    process.exitCode = 1
  })
}
