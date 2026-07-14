#!/usr/bin/env node
const { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync, chmodSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { homedir } = require('node:os')

const root = resolve(__dirname, '..')
const downloadsDir = resolve(
  process.env.WORKWISE_CONVERTER_ZIP_DIR ||
    (process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : join(homedir(), 'Downloads'))
)

const convertersDir = join(root, 'converters')
const macZip = join(downloadsDir, 'md2docx_macos.zip')
const winZip = existsSync(join(downloadsDir, 'md2docx_winV2.zip'))
  ? join(downloadsDir, 'md2docx_winV2.zip')
  : join(downloadsDir, 'md2docx_win.zip')

function info(message) {
  process.stdout.write(`${message}\n`)
}

function warn(message) {
  process.stderr.write(`[WARN] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[ERROR] ${message}\n`)
  process.exitCode = 1
}

function extractZipEntry(zipPath, entryName, targetPath, executable = false) {
  if (!existsSync(zipPath)) {
    warn(`Missing ZIP: ${zipPath}`)
    return false
  }

  mkdirSync(dirname(targetPath), { recursive: true })
  const fd = openSync(targetPath, 'w')
  const result = spawnSync('unzip', ['-p', zipPath, entryName], {
    stdio: ['ignore', fd, 'pipe']
  })
  closeSync(fd)

  if (result.status !== 0) {
    unlinkSync(targetPath)
    warn(`Could not extract ${entryName} from ${zipPath}: ${result.stderr?.toString('utf8').trim()}`)
    return false
  }

  const size = statSync(targetPath).size
  if (size === 0) {
    unlinkSync(targetPath)
    warn(`Extracted empty file for ${entryName}`)
    return false
  }

  if (executable) chmodSync(targetPath, 0o755)
  info(`✓ ${entryName} -> ${targetPath} (${Math.round(size / 1024 / 1024)} MB)`)
  return true
}

function main() {
  info(`Reading converter ZIPs from: ${downloadsDir}`)
  mkdirSync(convertersDir, { recursive: true })

  let copied = 0

  if (extractZipEntry(macZip, 'md2docx_macos/pandoc', join(convertersDir, 'darwin-arm64', 'pandoc'), true)) copied += 1
  if (extractZipEntry(macZip, 'md2docx_macos/md2docx.bin', join(convertersDir, 'darwin-arm64', 'md2docx.bin'), true)) copied += 1

  if (extractZipEntry(winZip, 'pandoc.exe', join(convertersDir, 'win32-x64', 'pandoc.exe'))) copied += 1
  if (extractZipEntry(winZip, 'md2docx.exe', join(convertersDir, 'win32-x64', 'md2docx.exe'))) copied += 1

  if (!existsSync(join(convertersDir, 'darwin-x64', 'pandoc'))) {
    warn('No darwin-x64 pandoc was found in the provided ZIPs. Intel macOS builds will use WorkWise built-in DOCX export unless you add converters/darwin-x64/pandoc.')
  }

  if (copied === 0) {
    fail('No converters were prepared. Put the ZIP files in ~/Downloads or pass their directory as the first argument.')
    return
  }

  info('Converter preparation complete.')
}

main()
