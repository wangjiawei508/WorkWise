#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const CHANNELS = new Set(['stable', 'frontier'])
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const WEBSITE_ROOT_SUFFIX = '/downloads/workwise'

function usage() {
  console.log(`Usage:
  node scripts/deploy-website-release.mjs stage --source DIR --tag vX.Y.Z --channel stable|frontier --release-prefix workwise[/acceptance/RUN_ID] --deploy-id ID [--transport scp|r2]
  node scripts/deploy-website-release.mjs promote --tag vX.Y.Z --channel stable|frontier --release-prefix workwise[/acceptance/RUN_ID] --deploy-id ID
  node scripts/deploy-website-release.mjs verify-public --source DIR --tag vX.Y.Z --channel stable|frontier --release-prefix workwise[/acceptance/RUN_ID] --target release|latest
  node scripts/deploy-website-release.mjs cleanup-acceptance --run-id RUN_ID

SSH environment:
  WORKWISE_WEBSITE_SSH_HOST
  WORKWISE_WEBSITE_SSH_PORT
  WORKWISE_WEBSITE_SSH_USER
  WORKWISE_WEBSITE_SSH_KEY_PATH
  WORKWISE_WEBSITE_SSH_KNOWN_HOSTS_PATH
  WORKWISE_WEBSITE_RELEASE_ROOT

Public verification:
  WORKWISE_PUBLIC_BASE_URL=https://www.railwise.cn/downloads

R2-accelerated website transfer:
  R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
`)
}

function parseArgs(argv) {
  const command = argv[0]
  const flags = new Map()
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    flags.set(arg.slice(2), value)
    index += 1
  }
  return { command, flags }
}

function requireFlag(flags, name) {
  const value = String(flags.get(name) || '').trim()
  if (!value) throw new Error(`Missing --${name}`)
  return value
}

function normalizeTag(value) {
  const tag = String(value || '').trim()
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Invalid release tag: ${value}`)
  return tag
}

function normalizeChannel(value) {
  const channel = String(value || '').trim()
  if (!CHANNELS.has(channel)) throw new Error(`Invalid release channel: ${value}`)
  return channel
}

function normalizeRunId(value) {
  const runId = String(value || '').trim()
  if (!/^[1-9]\d*$/.test(runId)) throw new Error('Run id must be a positive integer.')
  return runId
}

function normalizeDeployId(value) {
  const deployId = String(value || '').trim()
  if (!SAFE_TOKEN.test(deployId)) throw new Error(`Unsafe deploy id: ${value}`)
  return deployId
}

function normalizeTransport(value) {
  const transport = String(value || 'scp').trim()
  if (!['scp', 'r2'].includes(transport)) throw new Error(`Invalid website transport: ${value}`)
  return transport
}

function r2StagingPrefix(releasePrefix, deployId) {
  const normalized = normalizeReleasePrefix(releasePrefix)
  return `${normalized.prefix}/delivery-staging/${normalizeDeployId(deployId)}/`
}

function normalizeReleasePrefix(value) {
  const prefix = String(value || '').trim().replace(/^\/+|\/+$/g, '')
  if (prefix === 'workwise') return { prefix, relative: '', acceptanceRunId: '' }
  const acceptance = prefix.match(/^workwise\/acceptance\/([1-9]\d*)$/)
  if (!acceptance) {
    throw new Error('Release prefix must be workwise or workwise/acceptance/<positive-run-id>.')
  }
  return {
    prefix,
    relative: `acceptance/${acceptance[1]}`,
    acceptanceRunId: acceptance[1]
  }
}

function normalizeWebsiteRoot(value) {
  const root = String(value || '').trim().replace(/\/+$/, '')
  const parts = root.split('/').filter(Boolean)
  if (
    !root.startsWith('/') ||
    root.includes('//') ||
    parts.some((part) => part === '.' || part === '..') ||
    !root.endsWith(WEBSITE_ROOT_SUFFIX) ||
    !/^\/[A-Za-z0-9._/-]+$/.test(root)
  ) {
    throw new Error(`Unsafe website release root: ${value || '<empty>'}`)
  }
  return root
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function readSshConfig() {
  const host = String(process.env.WORKWISE_WEBSITE_SSH_HOST || '').trim()
  const port = String(process.env.WORKWISE_WEBSITE_SSH_PORT || '').trim()
  const user = String(process.env.WORKWISE_WEBSITE_SSH_USER || '').trim()
  const keyPath = resolve(String(process.env.WORKWISE_WEBSITE_SSH_KEY_PATH || ''))
  const knownHostsPath = resolve(String(process.env.WORKWISE_WEBSITE_SSH_KNOWN_HOSTS_PATH || ''))
  const root = normalizeWebsiteRoot(process.env.WORKWISE_WEBSITE_RELEASE_ROOT)

  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error('Invalid SSH host.')
  }
  const portNumber = Number.parseInt(port, 10)
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error('Invalid SSH port.')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(user)) throw new Error('Invalid SSH user.')
  for (const [label, path] of [['private key', keyPath], ['known_hosts', knownHostsPath]]) {
    if (!path || path === resolve('.') || !existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`Missing SSH ${label} file.`)
    }
  }
  return { host, port: String(portNumber), user, keyPath, knownHostsPath, root }
}

function sshOptions(config) {
  return [
    '-p', config.port,
    '-i', config.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${config.knownHostsPath}`
  ]
}

function runRemote(config, script, args) {
  const remote = `bash -s -- ${args.map(shellQuote).join(' ')}`
  return execFileSync(
    'ssh',
    [...sshOptions(config), `${config.user}@${config.host}`, remote],
    { input: script, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
}

function copyDirectory(config, sourceDir, remoteDir) {
  execFileSync(
    'scp',
    [
      '-P', config.port,
      '-i', config.keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${config.knownHostsPath}`,
      '-r', `${sourceDir}/.`, `${config.user}@${config.host}:${remoteDir}/`
    ],
    { stdio: 'inherit' }
  )
}

function copyFile(config, sourcePath, remotePath) {
  execFileSync(
    'scp',
    [
      '-P', config.port,
      '-i', config.keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${config.knownHostsPath}`,
      sourcePath,
      `${config.user}@${config.host}:${remotePath}`
    ],
    { stdio: 'inherit' }
  )
}

function readR2TransportConfig() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim()
  const bucket = String(process.env.R2_BUCKET || '').trim()
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim()
  const rawEndpoint = String(process.env.R2_ENDPOINT || '').trim()
  const missing = []
  if (!accountId && !rawEndpoint) missing.push('R2_ACCOUNT_ID or R2_ENDPOINT')
  if (!bucket) missing.push('R2_BUCKET')
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY')
  if (missing.length) throw new Error(`R2 website transport is missing: ${missing.join(', ')}`)
  const endpoint = rawEndpoint || `https://${accountId}.r2.cloudflarestorage.com`
  return {
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true
    })
  }
}

async function uploadR2TransportObjects(sourceDir, releasePrefix, deployId) {
  const { bucket, client } = readR2TransportConfig()
  const prefix = r2StagingPrefix(releasePrefix, deployId)
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
  if (!files.length) throw new Error('Website release source has no files to transfer.')
  for (const name of files) {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`Unsafe website asset name: ${name}`)
  }

  const objects = files.map((name) => ({ name, key: `${prefix}${name}` }))
  const deleteObjects = () => client.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Quiet: true, Objects: objects.map(({ key }) => ({ Key: key })) }
  }))
  let downloads
  try {
    await Promise.all(objects.map(({ name, key }) => client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(resolve(sourceDir, name))
    }))))
    downloads = await Promise.all(objects.map(async ({ name, key }) => ({
      name,
      url: await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: 2 * 60 * 60
      })
    })))
  } catch (error) {
    try { await deleteObjects() } catch { /* Preserve the upload/presigning failure. */ }
    client.destroy()
    throw error
  }

  return {
    downloads,
    cleanup: async () => {
      await deleteObjects()
      client.destroy()
    }
  }
}

function parseVersion(source, fileName) {
  const value = source.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1] || ''
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`${fileName} is missing a valid version.`)
  return value
}

async function validateSourceDirectory(sourceDir, tag) {
  const entries = new Set(await readdir(sourceDir))
  for (const required of ['latest.yml', 'latest-mac.yml', 'latest.json', 'SHA256SUMS.txt']) {
    if (!entries.has(required)) throw new Error(`Release source is missing ${required}.`)
  }
  const expectedVersion = tag.slice(1)
  for (const name of ['latest.yml', 'latest-mac.yml']) {
    const version = parseVersion(await readFile(resolve(sourceDir, name), 'utf8'), name)
    if (version !== expectedVersion) throw new Error(`${name} version ${version} does not match ${tag}.`)
  }
  const latest = JSON.parse(await readFile(resolve(sourceDir, 'latest.json'), 'utf8'))
  if (latest.version !== expectedVersion || latest.tag !== tag) {
    throw new Error(`latest.json identity does not match ${tag}.`)
  }
  const checksums = await readFile(resolve(sourceDir, 'SHA256SUMS.txt'), 'utf8')
  for (const rawLine of checksums.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    if (!match) throw new Error(`Invalid checksum line: ${rawLine}`)
    const checksumName = match[2].trim()
    const name = basename(checksumName)
    if (checksumName !== name || !/^[A-Za-z0-9._-]+$/.test(name)) {
      throw new Error(`Unsafe checksum file name: ${checksumName}`)
    }
    if (!entries.has(name)) throw new Error(`Checksum references missing file: ${name}`)
    const actual = await sha256File(resolve(sourceDir, name))
    if (actual !== match[1].toLowerCase()) throw new Error(`Local SHA-256 mismatch: ${name}`)
  }
}

const INIT_STAGE_SCRIPT = String.raw`set -euo pipefail
root="$1"
relative="$2"
channel="$3"
deploy_id="$4"
base="$root"
if [[ -n "$relative" ]]; then base="$root/$relative"; fi
stage="$base/.deploy-$deploy_id"
case "$stage" in "$root"/*/.deploy-*|"$root"/.deploy-*) ;; *) exit 64 ;; esac
test -d "$root"
test -w "$root"
rm -rf -- "$stage"
mkdir -p -- "$stage/payload" "$base/channels/$channel/releases"
printf '%s\n' "$stage/payload"
`

const DOWNLOAD_R2_STAGE_SCRIPT = String.raw`set -euo pipefail
manifest="$1"
payload="$2"
case "$manifest" in "$payload"/.r2-downloads.json) ;; *) exit 64 ;; esac
python3 - "$manifest" "$payload" <<'PY'
import json
import os
import pathlib
import re
import shutil
import sys
import urllib.request

manifest = pathlib.Path(sys.argv[1])
payload = pathlib.Path(sys.argv[2])
downloads = json.loads(manifest.read_text(encoding='utf-8'))
if not isinstance(downloads, list) or not downloads:
    raise RuntimeError('R2 download manifest is empty')
for item in downloads:
    name = item.get('name', '') if isinstance(item, dict) else ''
    url = item.get('url', '') if isinstance(item, dict) else ''
    if not re.fullmatch(r'[A-Za-z0-9._-]+', name) or not url.startswith('https://'):
        raise RuntimeError('R2 download manifest contains an unsafe entry')
    destination = payload / name
    temporary = payload / f'.download-{name}'
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'WorkWise-release-delivery/1'})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f'R2 download failed for {name}') from None
manifest.unlink()
PY
`

const CLEAN_STAGE_SCRIPT = String.raw`set -euo pipefail
root="$1"
relative="$2"
deploy_id="$3"
base="$root"
if [[ -n "$relative" ]]; then base="$root/$relative"; fi
stage="$base/.deploy-$deploy_id"
case "$stage" in "$root"/*/.deploy-*|"$root"/.deploy-*) ;; *) exit 64 ;; esac
if [[ -e "$stage" ]]; then rm -rf -- "$stage"; fi
`

const FINALIZE_STAGE_SCRIPT = String.raw`set -euo pipefail
root="$1"
relative="$2"
channel="$3"
tag="$4"
version="$5"
deploy_id="$6"
base="$root"
if [[ -n "$relative" ]]; then base="$root/$relative"; fi
stage="$base/.deploy-$deploy_id"
payload="$stage/payload"
release="$base/channels/$channel/releases/$tag"
case "$stage" in "$root"/*/.deploy-*|"$root"/.deploy-*) ;; *) exit 64 ;; esac
test -f "$payload/SHA256SUMS.txt"
cd "$payload"
sha256sum -c SHA256SUMS.txt
grep -Eq "^version:[[:space:]]*['\"]?$version['\"]?[[:space:]]*$" latest.yml
grep -Eq "^version:[[:space:]]*['\"]?$version['\"]?[[:space:]]*$" latest-mac.yml
if [[ -e "$release" ]]; then
  test -f "$release/SHA256SUMS.txt"
  cmp -s SHA256SUMS.txt "$release/SHA256SUMS.txt"
  cd "$release"
  sha256sum -c SHA256SUMS.txt
  rm -rf -- "$stage"
else
  mv -- "$payload" "$release"
  rmdir -- "$stage"
fi
printf '%s\n' "$release"
`

const PROMOTE_SCRIPT = String.raw`set -euo pipefail
root="$1"
relative="$2"
channel="$3"
tag="$4"
deploy_id="$5"
base="$root"
if [[ -n "$relative" ]]; then base="$root/$relative"; fi
channel_dir="$base/channels/$channel"
release="$channel_dir/releases/$tag"
test -d "$release"
test -f "$release/SHA256SUMS.txt"
cd "$release"
sha256sum -c SHA256SUMS.txt

atomic_latest() {
  local destination="$1"
  local stage="$2"
  case "$stage" in "$root"/*/.latest-*|"$root"/.latest-*) ;; *) exit 64 ;; esac
  rm -rf -- "$stage"
  cp -al -- "$release" "$stage"
  if [[ -e "$destination" || -L "$destination" ]]; then
    python3 - "$destination" "$stage" <<'PY'
import ctypes
import os
import sys

destination = os.fsencode(sys.argv[1])
stage = os.fsencode(sys.argv[2])
libc = ctypes.CDLL(None, use_errno=True)
renameat2 = libc.renameat2
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(-100, destination, -100, stage, 2) != 0:
    errno = ctypes.get_errno()
    raise OSError(errno, os.strerror(errno))
PY
    rm -rf -- "$stage"
  else
    mv -- "$stage" "$destination"
  fi
}

atomic_latest "$channel_dir/latest" "$channel_dir/.latest-$deploy_id"
if [[ -z "$relative" && "$channel" == stable ]]; then
  atomic_latest "$root/latest" "$root/.latest-$deploy_id"
fi

python3 - "$channel_dir/releases" <<'PY'
import pathlib
import re
import shutil
import sys

root = pathlib.Path(sys.argv[1])
versions = []
for path in root.iterdir():
    match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', path.name)
    if path.is_dir() and match:
        versions.append((tuple(map(int, match.groups())), path))
for _, path in sorted(versions, reverse=True)[3:]:
    shutil.rmtree(path)
PY
printf '%s\n' "$channel_dir/latest"
`

const CLEANUP_ACCEPTANCE_SCRIPT = String.raw`set -euo pipefail
root="$1"
run_id="$2"
target="$root/acceptance/$run_id"
case "$target" in "$root"/acceptance/[1-9][0-9]*) ;; *) exit 64 ;; esac
if [[ -e "$target" ]]; then rm -rf -- "$target"; fi
printf '%s\n' "$target"
`

async function stageRelease(flags) {
  const sourceDir = resolve(requireFlag(flags, 'source'))
  const tag = normalizeTag(requireFlag(flags, 'tag'))
  const channel = normalizeChannel(requireFlag(flags, 'channel'))
  const releasePrefix = normalizeReleasePrefix(requireFlag(flags, 'release-prefix'))
  const deployId = normalizeDeployId(requireFlag(flags, 'deploy-id'))
  const transport = normalizeTransport(flags.get('transport'))
  if (releasePrefix.acceptanceRunId && !deployId.includes(releasePrefix.acceptanceRunId)) {
    throw new Error('Acceptance deploy id must include its GitHub run id.')
  }
  await validateSourceDirectory(sourceDir, tag)
  const config = readSshConfig()
  const output = runRemote(config, INIT_STAGE_SCRIPT, [
    config.root,
    releasePrefix.relative,
    channel,
    deployId
  ])
  const remoteDir = output.trim().split(/\r?\n/).at(-1)
  if (!remoteDir?.endsWith(`/payload`)) throw new Error('Remote staging directory was not created.')
  let r2Transfer
  try {
    if (transport === 'r2') {
      r2Transfer = await uploadR2TransportObjects(sourceDir, releasePrefix.prefix, deployId)
      const temporaryDirectory = await mkdtemp(join(tmpdir(), 'workwise-r2-transfer-'))
      const manifestPath = join(temporaryDirectory, 'downloads.json')
      const remoteManifest = `${remoteDir}/.r2-downloads.json`
      try {
        await writeFile(manifestPath, JSON.stringify(r2Transfer.downloads), { mode: 0o600 })
        copyFile(config, manifestPath, remoteManifest)
        runRemote(config, DOWNLOAD_R2_STAGE_SCRIPT, [remoteManifest, remoteDir])
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true })
      }
    } else {
      copyDirectory(config, sourceDir, remoteDir)
    }
    process.stdout.write(runRemote(config, FINALIZE_STAGE_SCRIPT, [
      config.root,
      releasePrefix.relative,
      channel,
      tag,
      tag.slice(1),
      deployId
    ]))
  } catch (error) {
    try {
      runRemote(config, CLEAN_STAGE_SCRIPT, [config.root, releasePrefix.relative, deployId])
    } catch {
      // Preserve the original transfer/finalization failure.
    }
    throw error
  } finally {
    await r2Transfer?.cleanup()
  }
}

function promoteRelease(flags) {
  const tag = normalizeTag(requireFlag(flags, 'tag'))
  const channel = normalizeChannel(requireFlag(flags, 'channel'))
  const releasePrefix = normalizeReleasePrefix(requireFlag(flags, 'release-prefix'))
  const deployId = normalizeDeployId(requireFlag(flags, 'deploy-id'))
  if (releasePrefix.acceptanceRunId && !deployId.includes(releasePrefix.acceptanceRunId)) {
    throw new Error('Acceptance deploy id must include its GitHub run id.')
  }
  const config = readSshConfig()
  process.stdout.write(runRemote(config, PROMOTE_SCRIPT, [
    config.root,
    releasePrefix.relative,
    channel,
    tag,
    deployId
  ]))
}

function cleanupAcceptance(flags) {
  const runId = normalizeRunId(requireFlag(flags, 'run-id'))
  const config = readSshConfig()
  process.stdout.write(runRemote(config, CLEANUP_ACCEPTANCE_SCRIPT, [config.root, runId]))
}

function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest('hex')))
  })
}

async function verifyPublic(flags) {
  const sourceDir = resolve(requireFlag(flags, 'source'))
  const tag = normalizeTag(requireFlag(flags, 'tag'))
  const channel = normalizeChannel(requireFlag(flags, 'channel'))
  const releasePrefix = normalizeReleasePrefix(requireFlag(flags, 'release-prefix'))
  const target = requireFlag(flags, 'target')
  if (!['release', 'latest'].includes(target)) throw new Error('--target must be release or latest.')
  await validateSourceDirectory(sourceDir, tag)

  const publicBase = String(process.env.WORKWISE_PUBLIC_BASE_URL || 'https://www.railwise.cn/downloads')
    .trim()
    .replace(/\/+$/, '')
  if (!publicBase.startsWith('https://')) throw new Error('Public verification requires HTTPS.')
  const suffix = target === 'release' ? `releases/${tag}` : 'latest'
  const urlBase = `${publicBase}/${releasePrefix.prefix}/channels/${channel}/${suffix}/`
  const checksumSource = readFileSync(resolve(sourceDir, 'SHA256SUMS.txt'), 'utf8')
  for (const rawLine of checksumSource.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    if (!match) throw new Error(`Invalid checksum line: ${rawLine}`)
    const expected = match[1].toLowerCase()
    const name = basename(match[2].trim())
    const url = new URL(encodeURIComponent(name), urlBase)
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`Public download failed ${response.status}: ${name}`)
    const hash = createHash('sha256')
    let size = 0
    for await (const chunk of response.body) {
      hash.update(chunk)
      size += chunk.byteLength
    }
    if (hash.digest('hex') !== expected) throw new Error(`Public SHA-256 mismatch: ${name}`)
    const localSize = statSync(resolve(sourceDir, name)).size
    if (size !== localSize) throw new Error(`Public size mismatch: ${name}`)
    const range = await fetch(url, { headers: { Range: 'bytes=0-1023' }, redirect: 'follow' })
    if (range.status !== 206 || !/^bytes 0-\d+\/\d+$/i.test(range.headers.get('content-range') || '')) {
      throw new Error(`Public Range verification failed ${range.status}: ${name}`)
    }
    await range.arrayBuffer()
    console.log(`Verified public HTTPS, Range and SHA-256: ${name}`)
  }
  const localLatest = await sha256File(resolve(sourceDir, 'latest.json'))
  if (!localLatest) throw new Error('latest.json hash verification failed.')
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))
  if (!command || command === 'help') {
    usage()
    return
  }
  if (command === 'stage') return stageRelease(flags)
  if (command === 'promote') return promoteRelease(flags)
  if (command === 'verify-public') return verifyPublic(flags)
  if (command === 'cleanup-acceptance') return cleanupAcceptance(flags)
  throw new Error(`Unknown command: ${command}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[deploy-website-release] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

export const _internals = {
  normalizeTag,
  normalizeChannel,
  normalizeRunId,
  normalizeDeployId,
  normalizeTransport,
  normalizeReleasePrefix,
  r2StagingPrefix,
  normalizeWebsiteRoot,
  parseVersion,
  validateSourceDirectory,
  INIT_STAGE_SCRIPT,
  DOWNLOAD_R2_STAGE_SCRIPT,
  CLEAN_STAGE_SCRIPT,
  FINALIZE_STAGE_SCRIPT,
  PROMOTE_SCRIPT,
  CLEANUP_ACCEPTANCE_SCRIPT
}
