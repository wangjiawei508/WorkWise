#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const RELEASE_ROOT_SUFFIX = '/downloads/workwise'
const PRODUCT_URL = 'https://www.railwise.cn/products/workwise/'

function parseArgs(argv) {
  const command = argv[0]
  const flags = new Map()
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (!name?.startsWith('--') || !value) throw new Error(`Invalid argument: ${name || '<empty>'}`)
    flags.set(name.slice(2), value)
  }
  return { command, flags }
}

function requireFlag(flags, name) {
  const value = String(flags.get(name) || '').trim()
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function normalizeVersion(value) {
  const version = String(value || '').trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid version: ${value}`)
  return version
}

function normalizeToken(value, label) {
  const token = String(value || '').trim()
  if (!SAFE_TOKEN.test(token)) throw new Error(`Invalid ${label}: ${value}`)
  return token
}

function sourceFiles(sourceDirectory) {
  const source = resolve(sourceDirectory)
  return [
    { source: resolve(source, 'products/workwise/index.php'), relative: 'products/workwise/index.php' },
    { source: resolve(source, 'includes/workwise_product.php'), relative: 'includes/workwise_product.php' },
    { source: resolve(source, 'data/workwise-product.json'), relative: 'data/workwise-product.json' }
  ]
}

function validateSource(sourceDirectory, version) {
  const files = sourceFiles(sourceDirectory)
  for (const file of files) {
    if (!existsSync(file.source) || !statSync(file.source).isFile() || statSync(file.source).size === 0) {
      throw new Error(`Missing website source file: ${file.relative}`)
    }
  }

  const combined = files.map((file) => readFileSync(file.source, 'utf8')).join('\n')
  if (combined.includes('0.4.0')) throw new Error('Website source still contains withdrawn version 0.4.0.')

  const manifest = JSON.parse(readFileSync(files[2].source, 'utf8'))
  if (manifest.version !== version) throw new Error(`Manifest version is ${manifest.version}, expected ${version}.`)
  if (manifest.releaseUrl !== `https://github.com/wangjiawei508/WorkWise/releases/tag/v${version}`) {
    throw new Error('Manifest Release URL does not match the requested version.')
  }

  const expectedFiles = [
    `WorkWise-${version}-mac-Apple-Silicon.dmg`,
    `WorkWise-${version}-mac-Intel.dmg`,
    `WorkWise-${version}-win-x64.exe`
  ]
  const platforms = Array.isArray(manifest.platforms) ? manifest.platforms : []
  if (platforms.length !== expectedFiles.length) throw new Error('Website manifest must expose exactly three installers.')
  for (const name of expectedFiles) {
    const entry = platforms.find((item) => item?.file === name)
    if (!entry || !String(entry.url || '').includes(`/stable/releases/v${version}/${name}`)) {
      throw new Error(`Missing immutable website installer entry: ${name}`)
    }
    if (!/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error(`Invalid SHA-256 for website installer entry: ${name}`)
    }
  }
  return { files, manifest }
}

function normalizeReleaseRoot(value) {
  const root = String(value || '').trim().replace(/\/+$/, '')
  const parts = root.split('/').filter(Boolean)
  if (
    !root.startsWith('/') ||
    !root.endsWith(RELEASE_ROOT_SUFFIX) ||
    root.includes('//') ||
    parts.some((part) => part === '.' || part === '..') ||
    !/^\/[A-Za-z0-9._/-]+$/.test(root)
  ) {
    throw new Error('Unsafe website release root.')
  }
  return root
}

function readSshConfig() {
  const host = String(process.env.WORKWISE_WEBSITE_SSH_HOST || '').trim()
  const port = String(process.env.WORKWISE_WEBSITE_SSH_PORT || '').trim()
  const user = String(process.env.WORKWISE_WEBSITE_SSH_USER || '').trim()
  const keyPath = resolve(String(process.env.WORKWISE_WEBSITE_SSH_KEY_PATH || ''))
  const knownHostsPath = resolve(String(process.env.WORKWISE_WEBSITE_SSH_KNOWN_HOSTS_PATH || ''))
  const releaseRoot = normalizeReleaseRoot(process.env.WORKWISE_WEBSITE_RELEASE_ROOT)

  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error('Invalid website SSH host.')
  }
  const portNumber = Number.parseInt(port, 10)
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error('Invalid website SSH port.')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(user)) throw new Error('Invalid website SSH user.')
  for (const [label, path] of [['private key', keyPath], ['known_hosts', knownHostsPath]]) {
    if (!path || !existsSync(path) || !statSync(path).isFile()) throw new Error(`Missing SSH ${label}.`)
  }
  return { host, port: String(portNumber), user, keyPath, knownHostsPath, releaseRoot }
}

function sshOptions(config) {
  return [
    '-p', config.port,
    '-i', config.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'ConnectTimeout=15',
    '-o', 'ConnectionAttempts=2',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${config.knownHostsPath}`
  ]
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function runRemote(config, script, args) {
  const remote = `bash -s -- ${args.map(shellQuote).join(' ')}`
  return execFileSync('ssh', [...sshOptions(config), `${config.user}@${config.host}`, remote], {
    input: script,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 5 * 60_000,
    killSignal: 'SIGKILL'
  })
}

const PREPARE_SCRIPT = String.raw`
set -euo pipefail
release_root="$1"
deploy_id="$2"
case "$release_root" in /*/downloads/workwise) ;; *) exit 64 ;; esac
stage="/tmp/workwise-product-deploy-$deploy_id/payload"
case "$stage" in /tmp/workwise-product-deploy-*/payload) ;; *) exit 64 ;; esac
install -d -m 700 "$stage/products/workwise" "$stage/includes" "$stage/data"
printf '%s\n' "$stage"
`

const DEPLOY_SCRIPT = String.raw`
set -euo pipefail
fail() { printf 'WorkWise product page deploy error: %s\n' "$1" >&2; exit 1; }
release_root="$1"
version="$2"
deploy_id="$3"
case "$release_root" in /*/downloads/workwise) ;; *) exit 64 ;; esac
stage="/tmp/workwise-product-deploy-$deploy_id/payload"
targets="products/workwise/index.php includes/workwise_product.php data/workwise-product.json"
case "$stage" in /tmp/workwise-product-deploy-*/payload) ;; *) exit 64 ;; esac

site_root=""
search_root="$(dirname "$(dirname "$(dirname "$release_root")")")"
candidate_count=0
while IFS= read -r candidate; do
  test -n "$candidate" || continue
  root="\${candidate%/products/workwise/index.php}"
  if [ -f "$root/includes/workwise_product.php" ] && [ -f "$root/data/workwise-product.json" ]; then
    site_root="$root"
    candidate_count=$((candidate_count + 1))
  fi
done < <(find "$search_root" -maxdepth 7 -type f -path '*/products/workwise/index.php' -print 2>/dev/null)
[ "$candidate_count" -eq 1 ] || fail "expected one WorkWise site root under $search_root, found $candidate_count"
case "$site_root" in "$search_root"/*) ;; *) fail 'discovered site root escaped the search boundary' ;; esac
backup="$site_root/.workwise-product-backups/$deploy_id"
case "$backup" in "$site_root"/.workwise-product-backups/*) ;; *) exit 64 ;; esac

for relative in $targets; do
  test -s "$stage/$relative" || fail "missing staged file: $relative"
  test -f "$site_root/$relative" || fail "missing live target: $relative"
done
printf 'Validated staged and live WorkWise website paths.\n'
printf 'Discovered WorkWise site root from existing targets.\n'

php_bin="$(command -v php || true)"
if [ -z "$php_bin" ]; then
  for candidate in /www/server/php/*/bin/php; do
    if [ -x "$candidate" ]; then php_bin="$candidate"; fi
  done
fi
test -n "$php_bin" || fail 'PHP CLI was not found'
"$php_bin" -l "$stage/products/workwise/index.php" >/dev/null || fail 'product page PHP lint failed'
"$php_bin" -l "$stage/includes/workwise_product.php" >/dev/null || fail 'product include PHP lint failed'
"$php_bin" -r '$p=json_decode(file_get_contents($argv[1]), true); if (!is_array($p) || ($p["version"] ?? "") !== $argv[2]) { exit(65); }' "$stage/data/workwise-product.json" "$version" || fail 'product manifest JSON/version validation failed'
if grep -R -n -F '0.4.0' "$stage"; then fail 'staged website still contains withdrawn version 0.4.0'; fi
printf 'Validated PHP syntax, JSON and exact WorkWise version.\n'

install -d -m 700 "$backup/products/workwise" "$backup/includes" "$backup/data" || fail 'could not create backup directory'
for relative in $targets; do
  cp -p "$site_root/$relative" "$backup/$relative" || fail "could not back up: $relative"
  install -m 0644 "$stage/$relative" "$site_root/$relative.workwise-next" || fail "could not stage replacement: $relative"
done
printf 'Created server backup and next-version files.\n'

committed=0
rollback() {
  if [ "$committed" -eq 0 ]; then
    for relative in $targets; do
      if [ -f "$backup/$relative" ]; then cp -p "$backup/$relative" "$site_root/$relative"; fi
      rm -f "$site_root/$relative.workwise-next"
    done
  fi
}
trap rollback EXIT HUP INT TERM
for relative in $targets; do mv -f "$site_root/$relative.workwise-next" "$site_root/$relative"; done
committed=1
trap - EXIT HUP INT TERM
printf 'Deployed WorkWise product page %s with backup %s\n' "$version" "$backup"
`

const ROLLBACK_SCRIPT = String.raw`
set -euo pipefail
release_root="$1"
deploy_id="$2"
case "$release_root" in /*/downloads/workwise) ;; *) exit 64 ;; esac
targets="products/workwise/index.php includes/workwise_product.php data/workwise-product.json"
search_root="$(dirname "$(dirname "$(dirname "$release_root")")")"
site_root=""
candidate_count=0
while IFS= read -r candidate; do
  test -n "$candidate" || continue
  root="\${candidate%/products/workwise/index.php}"
  if [ -f "$root/includes/workwise_product.php" ] && [ -f "$root/data/workwise-product.json" ]; then
    site_root="$root"
    candidate_count=$((candidate_count + 1))
  fi
done < <(find "$search_root" -maxdepth 7 -type f -path '*/products/workwise/index.php' -print 2>/dev/null)
[ "$candidate_count" -eq 1 ] || exit 65
case "$site_root" in "$search_root"/*) ;; *) exit 64 ;; esac
backup="$site_root/.workwise-product-backups/$deploy_id"
case "$backup" in "$site_root"/.workwise-product-backups/*) ;; *) exit 64 ;; esac
for relative in $targets; do test -s "$backup/$relative"; done
for relative in $targets; do cp -p "$backup/$relative" "$site_root/$relative"; done
printf 'Rolled back WorkWise product page from %s\n' "$backup"
`

function copyToStage(config, localPath, remotePath) {
  execFileSync('scp', [
    '-P', config.port,
    '-i', config.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'ConnectTimeout=15',
    '-o', 'ConnectionAttempts=2',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${config.knownHostsPath}`,
    localPath,
    `${config.user}@${config.host}:${remotePath}`
  ], { stdio: 'inherit', timeout: 5 * 60_000, killSignal: 'SIGKILL' })
}

function deploy(sourceDirectory, version, deployId) {
  const validated = validateSource(sourceDirectory, version)
  const config = readSshConfig()
  const stage = runRemote(config, PREPARE_SCRIPT, [config.releaseRoot, deployId]).trim()
  if (stage !== `/tmp/workwise-product-deploy-${deployId}/payload`) {
    throw new Error('Remote deployment stage was not recognized.')
  }
  for (const file of validated.files) copyToStage(config, file.source, `${stage}/${file.relative}`)
  process.stdout.write(runRemote(config, DEPLOY_SCRIPT, [config.releaseRoot, version, deployId]))
}

function rollback(deployId) {
  const config = readSshConfig()
  process.stdout.write(runRemote(config, ROLLBACK_SCRIPT, [config.releaseRoot, deployId]))
}

async function verifyPublic(sourceDirectory, version) {
  const { manifest } = validateSource(sourceDirectory, version)
  const response = await fetch(`${PRODUCT_URL}?release=${encodeURIComponent(version)}&t=${Date.now()}`, {
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new Error(`Product page returned HTTP ${response.status}.`)
  const html = await response.text()
  const required = [
    `softwareVersion":"v${version}`,
    `WorkWise v${version} 已发布`,
    `releases/tag/v${version}`,
    ...manifest.platforms.map((item) => item.url)
  ]
  for (const text of required) {
    if (!html.includes(text)) throw new Error(`Product page is missing expected content: ${text}`)
  }
  if (html.includes('0.4.0')) throw new Error('Public product page still contains withdrawn version 0.4.0.')

  for (const item of manifest.platforms) {
    const url = new URL(item.url, PRODUCT_URL)
    const range = await fetch(url, {
      headers: { Range: 'bytes=0-1023' },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000)
    })
    if (range.status !== 206 || !/^bytes 0-\d+\/\d+$/i.test(range.headers.get('content-range') || '')) {
      throw new Error(`Installer Range verification failed for ${basename(url.pathname)}.`)
    }
    await range.arrayBuffer()
  }
  console.log(`Verified public WorkWise product page and three immutable ${version} installers.`)
}

const { command, flags } = parseArgs(process.argv.slice(2))
const source = requireFlag(flags, 'source')
const version = normalizeVersion(requireFlag(flags, 'version'))

if (command === 'validate') {
  validateSource(source, version)
  console.log(`Validated WorkWise website source for ${version}.`)
} else if (command === 'deploy') {
  deploy(source, version, normalizeToken(requireFlag(flags, 'deploy-id'), 'deploy id'))
} else if (command === 'rollback') {
  rollback(normalizeToken(requireFlag(flags, 'deploy-id'), 'deploy id'))
} else if (command === 'verify-public') {
  await verifyPublic(source, version)
} else {
  throw new Error(`Unknown command: ${command || '<empty>'}`)
}
