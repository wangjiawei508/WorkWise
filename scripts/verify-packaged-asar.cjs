const { existsSync, readFileSync } = require('node:fs')
const { join, relative, resolve, sep } = require('node:path')
const asar = require('@electron/asar')

function normalizedRelative(root, path) {
  return relative(root, path).split(sep).join('/')
}

function normalizeArchiveEntry(listedPath) {
  return listedPath.split(/[\\/]+/).filter(Boolean).join(sep)
}

function collectFiles(root, current = root, result = []) {
  const { readdirSync } = require('node:fs')
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) collectFiles(root, path, result)
    else result.push(normalizedRelative(root, path))
  }
  return result
}

function verifyPackagedSourceHead(archive, expectedSourceHead) {
  if (!expectedSourceHead) return null
  if (!/^[0-9a-f]{40}$/.test(expectedSourceHead)) {
    throw new Error(`Expected source HEAD is not a 40-character lowercase Git commit: ${expectedSourceHead}`)
  }
  let metadata
  try {
    metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
  } catch (error) {
    throw new Error(`Packaged source HEAD metadata is unreadable: ${error instanceof Error ? error.message : String(error)}`)
  }
  const packagedSourceHead = metadata?.buildProvenance?.sourceHead
  if (packagedSourceHead !== expectedSourceHead) {
    throw new Error(
      `Packaged source HEAD ${String(packagedSourceHead || 'missing')} does not match expected source HEAD ${expectedSourceHead}`
    )
  }
  return packagedSourceHead
}

function verifyAsarArchive(archivePath, compiledOutputRoot, expectedSourceHead) {
  const archive = resolve(archivePath)
  if (!existsSync(archive)) throw new Error(`ASAR archive does not exist: ${archive}`)

  let files = 0
  for (const listedPath of asar.listPackage(archive)) {
    const entryPath = normalizeArchiveEntry(listedPath)
    if (!entryPath) continue
    const stat = asar.statFile(archive, entryPath)
    if (stat.files) continue
    try {
      asar.extractFile(archive, entryPath)
      files += 1
    } catch (error) {
      throw new Error(`ASAR entry is unreadable: ${entryPath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  let compiledFiles = 0
  if (compiledOutputRoot) {
    const outputRoot = resolve(compiledOutputRoot)
    for (const relativePath of collectFiles(outputRoot)) {
      const displayArchiveEntry = `out/${relativePath}`
      const archiveEntry = normalizeArchiveEntry(displayArchiveEntry)
      let packaged
      try {
        packaged = asar.extractFile(archive, archiveEntry)
      } catch (error) {
        throw new Error(`Compiled output is missing from ASAR: ${displayArchiveEntry}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const local = readFileSync(join(outputRoot, ...relativePath.split('/')))
      if (!packaged.equals(local)) throw new Error(`Compiled output differs in ASAR: ${displayArchiveEntry}`)
      compiledFiles += 1
    }
  }

  const sourceHead = verifyPackagedSourceHead(archive, expectedSourceHead)
  return { files, compiledFiles, ...(sourceHead ? { sourceHead } : {}) }
}

if (require.main === module) {
  const archivePath = process.argv[2]
  if (!archivePath) {
    console.error('Usage: node scripts/verify-packaged-asar.cjs <app.asar> [compiled-output-root] [expected-source-head]')
    process.exit(2)
  }
  const result = verifyAsarArchive(
    archivePath,
    process.argv[3],
    process.argv[4] || process.env.WORKWISE_CANDIDATE_SOURCE_HEAD
  )
  console.log(`ASAR integrity passed: ${result.files} files, ${result.compiledFiles} compiled files.`)
}

module.exports = {
  verifyAsarArchive,
  _internals: { collectFiles, normalizedRelative, normalizeArchiveEntry, verifyPackagedSourceHead }
}
