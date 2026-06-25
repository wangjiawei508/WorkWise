#!/usr/bin/env node

const { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { basename, join, resolve } = require('node:path')

function usage() {
  console.error('Usage: node scripts/prepare-website-release-assets.cjs <inputDir> <outputDir> <version>')
}

function die(message) {
  console.error(`[prepare-website-release-assets] ${message}`)
  process.exit(1)
}

function findOne(entries, pattern, label) {
  const matches = entries.filter((name) => pattern.test(name))
  if (matches.length !== 1) {
    die(`Expected exactly one ${label}, found ${matches.length}: ${matches.join(', ') || '<none>'}`)
  }
  return matches[0]
}

function copyMapped(inputDir, outputDir, fromName, toName, fileMap) {
  const source = join(inputDir, fromName)
  if (!existsSync(source)) die(`Missing input file: ${fromName}`)
  copyFileSync(source, join(outputDir, toName))
  fileMap.set(fromName, toName)
}

function rewriteUpdateMetadata(inputDir, outputDir, fileName, fileMap) {
  const inputPath = join(inputDir, fileName)
  if (!existsSync(inputPath)) die(`Missing update metadata: ${fileName}`)
  let text = readFileSync(inputPath, 'utf8')
  for (const [fromName, toName] of fileMap.entries()) {
    text = text.split(fromName).join(toName)
  }
  writeFileSync(join(outputDir, fileName), text, 'utf8')
}

function main() {
  const inputDir = resolve(process.argv[2] || '')
  const outputDir = resolve(process.argv[3] || '')
  const version = String(process.argv[4] || '').trim()
  if (!inputDir || !outputDir || !/^\d+\.\d+\.\d+$/.test(version)) {
    usage()
    die(`Invalid arguments: input=${process.argv[2] || ''}, output=${process.argv[3] || ''}, version=${version}`)
  }

  if (!existsSync(inputDir)) die(`Input directory does not exist: ${inputDir}`)
  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })

  const entries = readdirSync(inputDir)
  const arm64Dmg = findOne(entries, /^WorkWise-.+-mac-arm64\.dmg$/, 'macOS arm64 dmg')
  const x64Dmg = findOne(entries, /^WorkWise-.+-mac-x64\.dmg$/, 'macOS x64 dmg')
  const winExe = findOne(entries, /^WorkWise-.+-win-x64\.exe$/, 'Windows x64 exe')

  const fileMap = new Map()
  copyMapped(inputDir, outputDir, arm64Dmg, `WorkWise-${version}-mac-Apple-Silicon.dmg`, fileMap)
  copyMapped(inputDir, outputDir, x64Dmg, `WorkWise-${version}-mac-Intel.dmg`, fileMap)
  copyMapped(inputDir, outputDir, winExe, `WorkWise-${version}-win-x64.exe`, fileMap)

  const winBlockMap = `${winExe}.blockmap`
  if (existsSync(join(inputDir, winBlockMap))) {
    copyMapped(inputDir, outputDir, winBlockMap, `WorkWise-${version}-win-x64.exe.blockmap`, fileMap)
  }

  rewriteUpdateMetadata(inputDir, outputDir, 'latest-mac.yml', fileMap)
  rewriteUpdateMetadata(inputDir, outputDir, 'latest.yml', fileMap)

  const output = readdirSync(outputDir).map((name) => basename(name)).sort()
  for (const name of output) console.log(name)
}

main()
