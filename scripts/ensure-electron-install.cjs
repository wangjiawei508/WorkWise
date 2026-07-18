const { spawnSync } = require('node:child_process')
const { existsSync, readFileSync, statSync } = require('node:fs')
const { dirname, isAbsolute, join, relative, resolve } = require('node:path')

function expectedPlatformPath(platform = process.platform) {
  switch (platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'electron'
    case 'win32':
      return 'electron.exe'
    default:
      throw new Error(`Electron builds are unavailable for ${platform}`)
  }
}

function inspectElectronInstall(electronDir, expectedVersion, platform = process.platform) {
  const distDir = join(electronDir, 'dist')
  const configuredPathFile = join(electronDir, 'path.txt')
  const versionFile = join(distDir, 'version')

  if (!existsSync(configuredPathFile) || !existsSync(versionFile)) {
    return { ready: false, reason: 'Electron metadata is missing' }
  }

  const configuredPath = readFileSync(configuredPathFile, 'utf8').trim()
  const expectedPath = expectedPlatformPath(platform)
  if (configuredPath !== expectedPath) {
    return { ready: false, reason: `Electron path is for another platform: ${configuredPath}` }
  }

  const installedVersion = readFileSync(versionFile, 'utf8').trim().replace(/^v/, '')
  if (installedVersion !== expectedVersion) {
    return { ready: false, reason: `Electron version mismatch: ${installedVersion}` }
  }

  const executable = resolve(distDir, configuredPath)
  const relativePath = relative(distDir, executable)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { ready: false, reason: 'Electron executable escapes its package directory' }
  }

  try {
    if (!statSync(executable).isFile()) {
      return { ready: false, reason: 'Electron executable is not a regular file' }
    }
  } catch {
    return { ready: false, reason: 'Electron executable is missing' }
  }

  return { ready: true, executable, installedVersion }
}

function ensureElectronInstall() {
  const packageJsonPath = require.resolve('electron/package.json')
  const electronDir = dirname(packageJsonPath)
  const { version } = require(packageJsonPath)
  const current = inspectElectronInstall(electronDir, version)

  if (current.ready) {
    console.log(`[electron] runtime ${version} ready: ${current.executable}`)
    return current
  }

  console.log(`[electron] preparing runtime ${version}: ${current.reason}`)
  const installerEnvironment = {
    ...process.env,
    ELECTRON_INSTALL_PLATFORM: process.platform,
    ELECTRON_INSTALL_ARCH: process.arch
  }

  // Force the official installer to verify against the checksums bundled in
  // the audited Electron npm package. These optional variables would make the
  // installer trust a remote checksum source instead.
  delete installerEnvironment.ELECTRON_OVERRIDE_DIST_PATH
  delete installerEnvironment.electron_use_remote_checksums
  delete installerEnvironment.npm_config_electron_use_remote_checksums

  const result = spawnSync(process.execPath, [join(electronDir, 'install.js')], {
    env: installerEnvironment,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Electron installer exited with status ${result.status ?? 'unknown'}`)
  }

  const installed = inspectElectronInstall(electronDir, version)
  if (!installed.ready) {
    throw new Error(`Electron installation did not produce a valid runtime: ${installed.reason}`)
  }

  console.log(`[electron] runtime ${version} installed and verified: ${installed.executable}`)
  return installed
}

if (require.main === module) {
  try {
    ensureElectronInstall()
  } catch (error) {
    console.error(`[electron] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

module.exports = {
  ensureElectronInstall,
  expectedPlatformPath,
  inspectElectronInstall
}
