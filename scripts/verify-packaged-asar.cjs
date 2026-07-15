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

function verifyAsarArchive(archivePath, compiledOutputRoot) {
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
      const archiveEntry = `out/${relativePath}`
      let packaged
      try {
        packaged = asar.extractFile(archive, archiveEntry)
      } catch (error) {
        throw new Error(`Compiled output is missing from ASAR: ${archiveEntry}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const local = readFileSync(join(outputRoot, ...relativePath.split('/')))
      if (!packaged.equals(local)) throw new Error(`Compiled output differs in ASAR: ${archiveEntry}`)
      compiledFiles += 1
    }
  }

  return { files, compiledFiles }
}

if (require.main === module) {
  const archivePath = process.argv[2]
  if (!archivePath) {
    console.error('Usage: node scripts/verify-packaged-asar.cjs <app.asar> [compiled-output-root]')
    process.exit(2)
  }
  const result = verifyAsarArchive(archivePath, process.argv[3])
  console.log(`ASAR integrity passed: ${result.files} files, ${result.compiledFiles} compiled files.`)
}

module.exports = { verifyAsarArchive, _internals: { collectFiles, normalizedRelative, normalizeArchiveEntry } }
