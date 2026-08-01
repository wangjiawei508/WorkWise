#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

function argument(name, fallback = '') {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

function required(name) {
  const value = argument(name).trim()
  if (!value) throw new Error(`Missing --${name}=...`)
  return value
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`)
}

function installMac(installer, root) {
  if (!installer.toLowerCase().endsWith('.dmg')) throw new Error('macOS base installer must be a DMG.')
  const mount = join(root, 'mount')
  const applications = join(root, 'Applications')
  mkdirSync(mount, { recursive: true })
  mkdirSync(applications, { recursive: true })
  run('hdiutil', ['attach', installer, '-nobrowse', '-readonly', '-mountpoint', mount])
  try {
    const appName = readdirSync(mount).find((name) => name.endsWith('.app'))
    if (!appName) throw new Error('DMG does not contain an application bundle.')
    const destination = join(applications, 'WorkWise.app')
    run('ditto', [join(mount, appName), destination])
    run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', destination])
    run('spctl', ['--assess', '--type', 'execute', '--verbose=2', destination])
    return join(destination, 'Contents', 'MacOS', 'WorkWise')
  } finally {
    run('hdiutil', ['detach', mount])
  }
}

function installWindows(installer, root) {
  if (!installer.toLowerCase().endsWith('.exe')) throw new Error('Windows base installer must be an EXE.')
  const destination = join(root, 'app')
  mkdirSync(destination, { recursive: true })
  // NSIS requires /D to be the final argument and does not accept quotes around it.
  run(installer, ['/S', `/D=${destination}`])
  const executable = join(destination, 'WorkWise.exe')
  if (!existsSync(executable)) throw new Error(`NSIS did not install ${executable}`)
  return executable
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function waitForReport(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let latest = null
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      try {
        latest = JSON.parse(readFileSync(path, 'utf8'))
        if (latest.status === 'passed' || latest.status === 'failed') return latest
      } catch {
        // Atomic app writes can still race with antivirus/indexer visibility.
      }
    }
    await sleep(2_000)
  }
  throw new Error(`Timed out waiting for updater acceptance report. Last report: ${JSON.stringify(latest)}`)
}

function validateReport(report, expected) {
  if (report.status !== 'passed') throw new Error(`Updater acceptance failed: ${report.failure || 'unknown failure'}`)
  if (report.baseVersion !== expected.baseVersion || report.targetVersion !== expected.targetVersion) {
    throw new Error(`Acceptance version mismatch: ${report.baseVersion} -> ${report.targetVersion}`)
  }
  if (report.platform !== process.platform || report.arch !== process.arch) {
    throw new Error(`Acceptance platform mismatch: ${report.platform}-${report.arch}, runner is ${process.platform}-${process.arch}`)
  }
  if (report.browserOpened !== false) throw new Error('Acceptance report did not prove the no-browser updater path.')
  const expectedStages = [
    'base_started',
    'update_available',
    'download_completed',
    'install_requested',
    'target_relaunched'
  ]
  const stages = report.stages?.map((stage) => stage.name)
  if (JSON.stringify(stages) !== JSON.stringify(expectedStages)) {
    throw new Error(`Acceptance stages are incomplete: ${JSON.stringify(stages)}`)
  }
}

async function main() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    throw new Error(`Unsupported updater acceptance platform: ${process.platform}`)
  }
  const expectedArch = required('expected-arch')
  if (process.arch !== expectedArch) throw new Error(`Expected ${expectedArch} runner, got ${process.arch}.`)

  const installer = resolve(required('installer'))
  if (!existsSync(installer)) throw new Error(`Base installer does not exist: ${installer}`)
  const feedUrl = required('feed-url').replace(/\/+$/, '') + '/'
  if (!/^https:\/\//i.test(feedUrl)) throw new Error('Test update feed must use HTTPS.')
  const baseVersion = required('base-version')
  const targetVersion = required('target-version')
  const channel = argument('channel', 'frontier')
  if (channel !== 'stable' && channel !== 'frontier') throw new Error('Channel must be stable or frontier.')
  const timeoutMinutes = Number.parseInt(argument('timeout-minutes', '20'), 10)
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 60) {
    throw new Error('timeout-minutes must be between 1 and 60.')
  }

  const root = mkdtempSync(join(tmpdir(), 'workwise-native-updater-'))
  const reportPath = argument('report')
    ? resolve(argument('report'))
    : join(root, `updater-acceptance-${process.platform}-${process.arch}.json`)
  if (!isAbsolute(reportPath)) throw new Error('Report path must be absolute.')
  mkdirSync(dirname(reportPath), { recursive: true })
  const configPath = join(root, 'acceptance-config.json')
  writeFileSync(configPath, `${JSON.stringify({
    schemaVersion: 1,
    baseVersion,
    targetVersion,
    channel,
    feedUrl,
    reportPath
  }, null, 2)}\n`, 'utf8')

  const executable = process.platform === 'darwin'
    ? installMac(installer, root)
    : installWindows(installer, root)
  const logPath = join(dirname(reportPath), `${basename(reportPath, '.json')}.log`)
  const log = openSync(logPath, 'a')
  const child = spawn(executable, [`--workwise-updater-acceptance=${configPath}`], {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true
  })
  child.unref()
  closeSync(log)

  const report = await waitForReport(reportPath, timeoutMinutes * 60_000)
  validateReport(report, { baseVersion, targetVersion })
  console.info(`Updater acceptance passed: ${baseVersion} -> ${targetVersion} on ${process.platform}-${process.arch}`)
  console.info(`Evidence: ${reportPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
