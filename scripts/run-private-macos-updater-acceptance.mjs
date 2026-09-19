#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { startPrivateUpdaterFeed } from './private-updater-feed.mjs'
import packagedAsar from './verify-packaged-asar.cjs'

const BASE_VERSION = '0.0.0'
const scriptRoot = dirname(fileURLToPath(import.meta.url))

function execute(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    // Keychain command arguments contain temporary passwords. Never echo them.
    throw new Error(`${basename(command)} ${args[0] ?? ''} failed (exit ${result.status ?? 'unknown'}): ${result.stderr || result.error?.message || ''}`)
  }
  return result.stdout
}

export function requirePrivateRunner(env = process.env, platform = process.platform) {
  if (platform !== 'darwin' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_OS !== 'macOS' || !env.RUNNER_TEMP?.startsWith('/')) {
    throw new Error('Private updater TLS trust may run only on an ephemeral macOS Actions runner.')
  }
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('Self-hosted machines are excluded from temporary TLS trust setup.')
}

function keychains(text) {
  return text.split('\n').map(line => line.trim().replace(/^"|"$/g, '')).filter(Boolean)
}

export async function withPrivateTlsTrust(root, certificate, operation, run = execute) {
  const keychain = join(root, 'tls-test.keychain-db')
  const password = randomBytes(32).toString('hex')
  const previous = keychains(run('/usr/bin/security', ['list-keychains', '-d', 'user']))
  let created = false; let trustAttempted = false
  let value; let failure
  const cleanupFailures = []
  try {
    run('/usr/bin/security', ['create-keychain', '-p', password, keychain]); created = true
    run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain])
    run('/usr/bin/security', ['set-keychain-settings', '-lut', '1800', keychain])
    run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', keychain, ...previous])
    // Trust only this one-day leaf for loopback SSL, in the runner's user domain.
    // No admin/system keychain, allowedError, TLS bypass, or signing trust changes.
    trustAttempted = true
    run('/usr/bin/security', ['add-trusted-cert', '-r', 'trustRoot', '-p', 'ssl', '-s', '127.0.0.1', '-k', keychain, certificate])
    value = await operation()
  } catch (error) {
    failure = error
  } finally {
    const clean = (args) => { try { run('/usr/bin/security', args) } catch (error) { cleanupFailures.push(error.message) } }
    if (trustAttempted) clean(['remove-trusted-cert', certificate])
    if (created) {
      clean(['list-keychains', '-d', 'user', '-s', ...previous])
      clean(['delete-keychain', keychain])
    }
  }
  if (cleanupFailures.length) throw new Error(`Private TLS cleanup failed: ${cleanupFailures.join('; ')}${failure ? `; original failure: ${failure.message}` : ''}`)
  if (failure) throw failure
  return value
}

function required(name) {
  const value = process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (!value) throw new Error(`Missing --${name}=...`)
  return value
}

function soleFile(directory, predicate) {
  const found = readdirSync(directory).filter(predicate)
  if (found.length !== 1) throw new Error(`Expected one candidate artifact in ${directory}; found ${found.length}.`)
  return join(directory, found[0])
}

export function validateBundleIdentity(info, head, version) {
  if (!/^[a-f0-9]{40}$/.test(head)
    || info.CFBundleIdentifier !== `com.wangjiawei508.workwise.candidate.head${head.slice(0, 12)}`
    || info.CFBundleExecutable !== `RAILWISE AI Candidate ${head.slice(0, 12)}`
    || info.CFBundleShortVersionString !== version) {
    throw new Error('Candidate bundle identity, source HEAD or version mismatch.')
  }
}

export function validatePrivateUpdateMetadata(text, head) {
  const metadata = parse(text)
  if (!metadata || Array.isArray(metadata) || metadata.provider !== 'generic'
    || metadata.url !== 'https://127.0.0.1/'
    || metadata.updaterCacheDirName !== `workwise-private-updater-${head.slice(0, 12)}-updater`) {
    throw new Error('Candidate package must use the exact loopback generic feed and its own updater cache.')
  }
  return metadata
}

export function verifyBundle(app, head, version) {
  const info = JSON.parse(execute('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]))
  validateBundleIdentity(info, head, version)
  execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
  execute('/usr/bin/xcrun', ['stapler', 'validate', app])
  execute('/usr/sbin/spctl', ['--assess', '--type', 'execute', app])
  validatePrivateUpdateMetadata(readFileSync(join(app, 'Contents/Resources/app-update.yml'), 'utf8'), head)
  packagedAsar._internals.verifyPackagedSourceHead(join(app, 'Contents/Resources/app.asar'), head)
  const identity = spawnSync('/usr/bin/codesign', ['-d', '-r-', app], { encoding: 'utf8' })
  const requirement = identity.stderr?.split('\n').find(line => line.startsWith('designated =>'))
  if (identity.status !== 0 || !requirement) throw new Error('Candidate signing requirement unavailable.')
  return { bundleId: info.CFBundleIdentifier, version, designatedRequirement: requirement }
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function runHarness(args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [join(scriptRoot, 'run-native-updater-acceptance.mjs'), ...args], { env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`Native updater harness failed (exit ${code}).`)))
  })
}

function stopCandidateProcesses(root) {
  const prefix = join(root, 'Applications') + '/'
  const lines = execute('/bin/ps', ['-axo', 'pid=,command=']).split('\n')
  for (const line of lines) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (match?.[2].startsWith(prefix)) {
      try { process.kill(Number(match[1]), 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
}

async function main() {
  requirePrivateRunner()
  const head = required('source-head')
  const targetVersion = required('target-version')
  if (!/^\d+\.\d+\.\d+$/.test(targetVersion) || targetVersion === BASE_VERSION) throw new Error('Target must be newer than the internal 0.0.0 baseline.')
  const baseDist = realpathSync(required('base-dist')); const targetDist = realpathSync(required('target-dist'))
  const evidence = resolve(required('evidence-dir'))
  const runnerTemp = realpathSync(process.env.RUNNER_TEMP)
  if (![baseDist, targetDist, evidence].every(path => path.startsWith(`${runnerTemp}/`))) throw new Error('Artifacts and evidence must stay inside RUNNER_TEMP.')
  mkdirSync(evidence, { recursive: true, mode: 0o700 })
  const root = mkdtempSync(join(runnerTemp, 'workwise-private-updater-'))
  const report = { schemaVersion: 1, status: 'running', sourceHead: head, baseVersion: BASE_VERSION, targetVersion, platform: 'darwin', arch: process.arch, productionTouched: false, publicFeedUploaded: false, privateTransport: 'loopback-https', baselinePurpose: 'same-source isolated updater probe; not a historical-data migration', tlsTrustCleaned: false }
  let feed
  let ownedUpdaterCache
  try {
    const appDirectory = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
    const baseApp = soleFile(join(baseDist, appDirectory), name => name.endsWith('.app'))
    const targetApp = soleFile(join(targetDist, appDirectory), name => name.endsWith('.app'))
    const base = verifyBundle(baseApp, head, BASE_VERSION)
    const target = verifyBundle(targetApp, head, targetVersion)
    if (base.designatedRequirement !== target.designatedRequirement) throw new Error('Baseline and target signing identities differ.')
    const updaterCache = join(homedir(), 'Library/Caches', `workwise-private-updater-${head.slice(0, 12)}-updater`)
    if (existsSync(updaterCache)) throw new Error('Private updater cache already exists; refusing to reuse or delete prior data.')
    ownedUpdaterCache = updaterCache
    const gatekeeper = spawnSync('/usr/sbin/spctl', ['--status'], { encoding: 'utf8' })
    Object.assign(report, { bundleId: target.bundleId, signature: 'verified', stapledNotarization: 'verified', gatekeeperStatus: `${gatekeeper.stdout ?? ''}${gatekeeper.stderr ?? ''}`.trim(), gatekeeperStatusExitCode: gatekeeper.status })
    const installer = soleFile(baseDist, name => name.endsWith('.dmg'))
    const zip = soleFile(targetDist, name => name.endsWith(`-mac-${process.arch}.zip`))
    report.baseDmgSha256 = await sha256(installer); report.targetZipSha256 = await sha256(zip)
    report.targetAsarSha256 = await sha256(join(targetApp, 'Contents/Resources/app.asar'))

    for (const directory of ['user-data', 'cache', 'logs', 'home']) mkdirSync(join(root, directory), { mode: 0o700 })
    const candidate = {
      WORKWISE_CANDIDATE: '1', WORKWISE_CANDIDATE_ROOT: root,
      WORKWISE_CANDIDATE_USER_DATA: join(root, 'user-data'), WORKWISE_CANDIDATE_CACHE: join(root, 'cache'),
      WORKWISE_CANDIDATE_LOGS: join(root, 'logs'), WORKWISE_CANDIDATE_HOME: join(root, 'home'),
      WORKWISE_TOOLS_ROOT: join(root, 'home/.workwise/tools'),
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '1', WORKWISE_CANDIDATE_INBOUND_DISABLED: '1', WORKWISE_CANDIDATE_CREDENTIAL_ACCESS: '0'
    }
    writeFileSync(join(root, 'candidate.env'), Object.entries(candidate).map(([key, value]) => `export ${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
    const sentinelPath = join(root, 'user-data/private-updater-sentinel.json')
    const sentinel = JSON.stringify({ sourceHead: head, nonce: randomBytes(32).toString('hex') })
    writeFileSync(sentinelPath, sentinel, { mode: 0o600 })

    const certificate = join(root, 'loopback.pem'); const key = join(root, 'loopback.key')
    const config = join(root, 'openssl.cnf')
    writeFileSync(config, '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=127.0.0.1\n[ext]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n', { mode: 0o600 })
    execute('/usr/bin/openssl', ['req', '-new', '-newkey', 'rsa:2048', '-x509', '-nodes', '-days', '1', '-keyout', key, '-out', certificate, '-config', config])
    const env = { ...process.env, ...candidate }
    for (const name of Object.keys(env)) {
      if (/^(?:CSC_|APPLE_|MAC_CODESIGN_|R2_|S3_|WORKWISE_WEBSITE_)/.test(name) || /^WORKWISE_UPDATE_/.test(name) || name === 'RELEASE_CHANNEL' || name === 'WORKWISE_PUBLIC_BASE_URL') delete env[name]
    }
    await withPrivateTlsTrust(root, certificate, async () => {
      feed = await startPrivateUpdaterFeed({ key, cert: certificate, zipPath: zip, version: targetVersion })
      await runHarness([
        `--installer=${installer}`, `--feed-url=${feed.url}`, `--base-version=${BASE_VERSION}`, `--target-version=${targetVersion}`,
        '--channel=frontier', `--expected-arch=${process.arch}`, `--report=${join(evidence, 'native-updater.json')}`,
        `--candidate-root=${root}`, `--candidate-source-head=${head}`
      ], env)
      if (feed.requests.manifest < 1 || feed.requests.zip < 1 || feed.requests.bytesServed === 0) throw new Error('Native updater did not fetch the real private manifest and ZIP.')
      const installed = join(root, 'Applications', basename(targetApp))
      verifyBundle(installed, head, targetVersion)
      const installedHash = await sha256(join(installed, 'Contents/Resources/app.asar'))
      if (installedHash !== report.targetAsarSha256) throw new Error('Relaunched package differs from the signed target.')
      if (readFileSync(sentinelPath, 'utf8') !== sentinel) throw new Error('Isolated data sentinel changed during native installation.')
      Object.assign(report, { installedAsarSha256: installedHash, userDataSentinelPreserved: true, feedRequests: feed.requests, manifestSha256: feed.manifestSha256 })
    })
    report.tlsTrustCleaned = true
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.failure = error.message
  } finally {
    const cleanup = [() => feed?.close(), () => stopCandidateProcesses(root), () => rmSync(root, { recursive: true, force: true }), () => { if (ownedUpdaterCache) rmSync(ownedUpdaterCache, { recursive: true, force: true }) }]
    for (const action of cleanup) {
      try { await action() } catch (error) {
        report.status = 'failed'; report.failure = `${report.failure ?? ''} Cleanup: ${error.message}`.trim()
      }
    }
    // Only the explicit evidence files are uploaded; no key, environment or user data.
    writeFileSync(join(evidence, 'private-updater.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  }
  if (report.status !== 'passed') throw new Error(report.failure)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(`[private-native-updater] ${error.message}`); process.exitCode = 1 })
}
