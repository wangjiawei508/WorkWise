#!/usr/bin/env node
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const { readdir, readFile, stat, writeFile } = require('node:fs/promises')
const { basename, join, resolve } = require('node:path')

function usage() {
  console.error(`Usage:
  node scripts/verify-release-assets.cjs [distDir] [--write-sha256 [file]] [--check-sha256 [file]]

Examples:
  node scripts/verify-release-assets.cjs dist
  node scripts/verify-release-assets.cjs release-artifacts --write-sha256
  node scripts/verify-release-assets.cjs downloaded-release --check-sha256 SHA256SUMS.txt
`)
}

function readArgs(argv) {
  let distDir = 'dist'
  let writeSha256 = ''
  let checkSha256 = ''

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--write-sha256') {
      const next = argv[i + 1]
      writeSha256 = next && !next.startsWith('--') ? next : 'SHA256SUMS.txt'
      if (writeSha256 === next) i += 1
      continue
    }
    if (arg === '--check-sha256') {
      const next = argv[i + 1]
      checkSha256 = next && !next.startsWith('--') ? next : 'SHA256SUMS.txt'
      if (checkSha256 === next) i += 1
      continue
    }
    if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`)
    distDir = arg
  }

  return {
    distDir: resolve(distDir),
    writeSha256,
    checkSha256
  }
}

function quoteScalar(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '')
}

function parseUpdateYml(source, fileName) {
  const version = quoteScalar(source.match(/^version:\s*(.+)$/m)?.[1] ?? '')
  const path = quoteScalar(source.match(/^path:\s*(.+)$/m)?.[1] ?? '')
  const topSha512 = quoteScalar(source.match(/^sha512:\s*(.+)$/m)?.[1] ?? '')
  const files = []
  let current = null

  for (const line of source.split(/\r?\n/)) {
    const url = line.match(/^\s*-\s+url:\s*(.+)$/)
    if (url) {
      current = { url: quoteScalar(url[1]), sha512: '', size: 0, blockMapSize: 0 }
      files.push(current)
      continue
    }
    if (!current) continue
    const prop = line.match(/^\s+(sha512|size|blockMapSize):\s*(.+)$/)
    if (!prop) continue
    const [, key, value] = prop
    current[key] = key === 'sha512' ? quoteScalar(value) : Number.parseInt(value, 10) || 0
  }

  if (!version) throw new Error(`${fileName} is missing version.`)
  if (!files.length) throw new Error(`${fileName} is missing files.`)
  return { version, path, topSha512, files }
}

function hashFile(path, algorithm, encoding) {
  const hash = createHash(algorithm)
  return new Promise((resolvePromise, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolvePromise(hash.digest(encoding)))
  })
}

async function fileInfo(path) {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`${path} is not a file.`)
  return info
}

async function assertUpdateFile(distDir, fileName) {
  const updatePath = join(distDir, fileName)
  const update = parseUpdateYml(await readFile(updatePath, 'utf8'), fileName)

  for (const file of update.files) {
    const assetName = basename(file.url)
    const assetPath = join(distDir, assetName)
    const info = await fileInfo(assetPath)
    const sha512 = await hashFile(assetPath, 'sha512', 'base64')

    if (file.size && info.size !== file.size) {
      throw new Error(`${fileName} records ${assetName} size ${file.size}, actual ${info.size}.`)
    }
    if (file.sha512 && sha512 !== file.sha512) {
      throw new Error(`${fileName} records ${assetName} sha512 ${file.sha512}, actual ${sha512}.`)
    }

    if (file.blockMapSize) {
      const blockMapPath = join(distDir, `${assetName}.blockmap`)
      const blockMapInfo = await fileInfo(blockMapPath)
      if (blockMapInfo.size !== file.blockMapSize) {
        throw new Error(
          `${fileName} records ${assetName}.blockmap size ${file.blockMapSize}, actual ${blockMapInfo.size}.`
        )
      }
    }
  }

  if (update.path && update.topSha512) {
    const assetPath = join(distDir, basename(update.path))
    const sha512 = await hashFile(assetPath, 'sha512', 'base64')
    if (sha512 !== update.topSha512) {
      throw new Error(`${fileName} top-level sha512 does not match ${basename(update.path)}.`)
    }
  }

  console.log(`✓ ${fileName} metadata matches local artifacts.`)
}

async function listChecksumTargets(distDir) {
  const entries = await readdir(distDir)
  return entries
    .filter((name) =>
      /^WorkWise-.+/.test(name) ||
      /^latest(?:-mac)?\.yml$/.test(name)
    )
    .sort()
}

async function writeSha256File(distDir, outputName) {
  const targets = await listChecksumTargets(distDir)
  if (!targets.length) throw new Error(`No release files found in ${distDir}.`)
  const lines = []
  for (const name of targets) {
    const sha256 = await hashFile(join(distDir, name), 'sha256', 'hex')
    lines.push(`${sha256}  ${name}`)
  }
  const outputPath = join(distDir, outputName)
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8')
  console.log(`✓ Wrote ${outputPath}`)
}

async function checkSha256File(distDir, inputName) {
  const checksumPath = join(distDir, inputName)
  const source = await readFile(checksumPath, 'utf8')
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)
    if (!match) throw new Error(`Invalid checksum line in ${inputName}: ${rawLine}`)
    const expected = match[1].toLowerCase()
    const name = basename(match[2].trim())
    const actual = await hashFile(join(distDir, name), 'sha256', 'hex')
    if (actual !== expected) {
      throw new Error(`${inputName} records ${name} sha256 ${expected}, actual ${actual}.`)
    }
  }
  console.log(`✓ ${inputName} matches downloaded files.`)
}

async function main() {
  const { distDir, writeSha256, checkSha256 } = readArgs(process.argv.slice(2))
  const entries = new Set(await readdir(distDir))

  if (entries.has('latest.yml')) await assertUpdateFile(distDir, 'latest.yml')
  if (entries.has('latest-mac.yml')) await assertUpdateFile(distDir, 'latest-mac.yml')
  if (!entries.has('latest.yml') && !entries.has('latest-mac.yml')) {
    throw new Error(`No latest.yml or latest-mac.yml found in ${distDir}.`)
  }

  if (writeSha256) await writeSha256File(distDir, writeSha256)
  if (checkSha256) await checkSha256File(distDir, checkSha256)
}

main().catch((error) => {
  usage()
  console.error(`[verify-release-assets] ${error.message}`)
  process.exit(1)
})
