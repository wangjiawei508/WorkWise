import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type {
  GuiUpdateChannel,
  GuiUpdateDownloadResult,
  GuiUpdateInfo,
  GuiUpdateInstallResult
} from '../shared/gui-update'

const ACCEPTANCE_ARG = '--workwise-updater-acceptance='
const STATE_FILE = 'updater-acceptance-state.json'

type AcceptanceStageName =
  | 'base_started'
  | 'update_available'
  | 'download_completed'
  | 'install_requested'
  | 'target_relaunched'

type AcceptanceStage = {
  name: AcceptanceStageName
  at: string
  detail?: string
}

export type GuiUpdaterAcceptanceReport = {
  schemaVersion: 1
  status: 'running' | 'passed' | 'failed'
  platform: NodeJS.Platform
  arch: string
  baseVersion: string
  targetVersion: string
  channel: GuiUpdateChannel
  feedUrl: string
  startedAt: string
  completedAt?: string
  failure?: string
  browserOpened: false
  stages: AcceptanceStage[]
}

type AcceptanceInput = {
  schemaVersion: 1
  baseVersion: string
  targetVersion: string
  channel: GuiUpdateChannel
  feedUrl: string
  reportPath: string
}

type AcceptanceState = AcceptanceInput & {
  phase: 'checking' | 'installing'
  report: GuiUpdaterAcceptanceReport
}

export type ActiveGuiUpdaterAcceptance = {
  kind: 'active'
  statePath: string
  reportPath: string
  state: AcceptanceState
}

export type TerminalGuiUpdaterAcceptance = {
  kind: 'terminal'
  reportPath: string
  report: GuiUpdaterAcceptanceReport
}

export type GuiUpdaterAcceptance = ActiveGuiUpdaterAcceptance | TerminalGuiUpdaterAcceptance

type PrepareOptions = {
  argv: string[]
  userDataPath: string
  currentVersion: string
  platform?: NodeJS.Platform
  arch?: string
  now?: () => string
}

type UpdaterApi = {
  checkGuiUpdate(channel: GuiUpdateChannel): Promise<GuiUpdateInfo>
  downloadGuiUpdate(channel: GuiUpdateChannel): Promise<GuiUpdateDownloadResult>
  installGuiUpdate(): Promise<GuiUpdateInstallResult>
}

function semver(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.trim())) {
    throw new Error(`${label} must be an x.y.z version.`)
  }
  return value.trim()
}

function parseInput(value: unknown): AcceptanceInput {
  if (!value || typeof value !== 'object') throw new Error('Updater acceptance config must be an object.')
  const input = value as Partial<AcceptanceInput>
  if (input.schemaVersion !== 1) throw new Error('Updater acceptance config schemaVersion must be 1.')
  const baseVersion = semver(input.baseVersion, 'baseVersion')
  const targetVersion = semver(input.targetVersion, 'targetVersion')
  if (baseVersion === targetVersion) throw new Error('targetVersion must differ from baseVersion.')
  if (input.channel !== 'stable' && input.channel !== 'frontier') {
    throw new Error('channel must be stable or frontier.')
  }
  if (typeof input.feedUrl !== 'string' || !/^https:\/\//i.test(input.feedUrl.trim())) {
    throw new Error('feedUrl must use HTTPS.')
  }
  if (typeof input.reportPath !== 'string' || !isAbsolute(input.reportPath)) {
    throw new Error('reportPath must be absolute.')
  }
  return {
    schemaVersion: 1,
    baseVersion,
    targetVersion,
    channel: input.channel,
    feedUrl: `${input.feedUrl.trim().replace(/\/+$/, '')}/`,
    reportPath: input.reportPath
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

function stage(report: GuiUpdaterAcceptanceReport, name: AcceptanceStageName, at: string, detail?: string): void {
  report.stages.push({ name, at, ...(detail ? { detail } : {}) })
}

async function persistActive(acceptance: ActiveGuiUpdaterAcceptance): Promise<void> {
  await writeJsonAtomic(acceptance.statePath, acceptance.state)
  await writeJsonAtomic(acceptance.reportPath, acceptance.state.report)
}

async function failActive(
  acceptance: ActiveGuiUpdaterAcceptance,
  error: unknown,
  now: () => string
): Promise<TerminalGuiUpdaterAcceptance> {
  const message = error instanceof Error ? error.message : String(error)
  acceptance.state.report.status = 'failed'
  acceptance.state.report.failure = message
  acceptance.state.report.completedAt = now()
  await writeJsonAtomic(acceptance.reportPath, acceptance.state.report)
  await unlink(acceptance.statePath).catch(() => undefined)
  return { kind: 'terminal', reportPath: acceptance.reportPath, report: acceptance.state.report }
}

export function configureGuiUpdaterAcceptance(acceptance: ActiveGuiUpdaterAcceptance): void {
  process.env.WORKWISE_UPDATE_PROVIDER = 'generic'
  process.env.WORKWISE_UPDATE_URL = acceptance.state.feedUrl
  process.env.WORKWISE_UPDATE_CHANNEL = acceptance.state.channel
}

export async function prepareGuiUpdaterAcceptance(
  options: PrepareOptions
): Promise<GuiUpdaterAcceptance | null> {
  const now = options.now ?? (() => new Date().toISOString())
  const statePath = join(options.userDataPath, STATE_FILE)
  const configArgument = options.argv.find((argument) => argument.startsWith(ACCEPTANCE_ARG))

  if (configArgument) {
    const configPath = configArgument.slice(ACCEPTANCE_ARG.length)
    if (!isAbsolute(configPath)) throw new Error('Updater acceptance config path must be absolute.')
    const input = parseInput(await readJson(configPath))
    if (options.currentVersion !== input.baseVersion) {
      throw new Error(`Updater acceptance expected base ${input.baseVersion}, got ${options.currentVersion}.`)
    }
    const startedAt = now()
    const report: GuiUpdaterAcceptanceReport = {
      schemaVersion: 1,
      status: 'running',
      platform: options.platform ?? process.platform,
      arch: options.arch ?? process.arch,
      baseVersion: input.baseVersion,
      targetVersion: input.targetVersion,
      channel: input.channel,
      feedUrl: input.feedUrl,
      startedAt,
      browserOpened: false,
      stages: [{ name: 'base_started', at: startedAt }]
    }
    const acceptance: ActiveGuiUpdaterAcceptance = {
      kind: 'active',
      statePath,
      reportPath: input.reportPath,
      state: { ...input, phase: 'checking', report }
    }
    await persistActive(acceptance)
    return acceptance
  }

  let state: AcceptanceState
  let input: AcceptanceInput
  try {
    state = (await readJson(statePath)) as AcceptanceState
    input = parseInput(state)
  } catch {
    await unlink(statePath).catch(() => undefined)
    return null
  }
  const acceptance: ActiveGuiUpdaterAcceptance = {
    kind: 'active',
    statePath,
    reportPath: input.reportPath,
    state: { ...state, ...input }
  }
  if (state.phase !== 'installing') {
    return failActive(acceptance, 'Updater acceptance restarted before installation was requested.', now)
  }
  if (options.currentVersion !== input.targetVersion) {
    return failActive(
      acceptance,
      `Platform updater relaunched version ${options.currentVersion}; expected ${input.targetVersion}.`,
      now
    )
  }

  stage(acceptance.state.report, 'target_relaunched', now(), options.currentVersion)
  acceptance.state.report.status = 'passed'
  acceptance.state.report.completedAt = now()
  await writeJsonAtomic(acceptance.reportPath, acceptance.state.report)
  await unlink(statePath).catch(() => undefined)
  return { kind: 'terminal', reportPath: acceptance.reportPath, report: acceptance.state.report }
}

export async function failGuiUpdaterAcceptance(
  acceptance: ActiveGuiUpdaterAcceptance,
  error: unknown,
  now: () => string = () => new Date().toISOString()
): Promise<TerminalGuiUpdaterAcceptance> {
  return failActive(acceptance, error, now)
}

export async function runGuiUpdaterAcceptance(
  acceptance: ActiveGuiUpdaterAcceptance,
  updater: UpdaterApi,
  now: () => string = () => new Date().toISOString()
): Promise<void> {
  try {
    const checked = await updater.checkGuiUpdate(acceptance.state.channel)
    if (!checked.ok) throw new Error(`Update check failed: ${checked.message}`)
    if (!checked.hasUpdate) throw new Error('Update check did not find a newer version.')
    if (checked.manualOnly) throw new Error('Update source was available only as a manual download.')
    if (checked.currentVersion !== acceptance.state.baseVersion) {
      throw new Error(`Updater reported base ${checked.currentVersion}; expected ${acceptance.state.baseVersion}.`)
    }
    if (checked.latestVersion !== acceptance.state.targetVersion) {
      throw new Error(`Updater reported target ${checked.latestVersion}; expected ${acceptance.state.targetVersion}.`)
    }
    stage(acceptance.state.report, 'update_available', now(), checked.latestVersion)
    await persistActive(acceptance)

    const downloaded = await updater.downloadGuiUpdate(acceptance.state.channel)
    if (!downloaded.ok) throw new Error(`Update download failed: ${downloaded.message}`)
    stage(acceptance.state.report, 'download_completed', now(), `${downloaded.paths.length} artifact(s)`)
    await persistActive(acceptance)

    acceptance.state.phase = 'installing'
    stage(acceptance.state.report, 'install_requested', now())
    await persistActive(acceptance)
    const installed = await updater.installGuiUpdate()
    if (!installed.ok) throw new Error(`Update install failed: ${installed.message}`)
  } catch (error) {
    await failActive(acceptance, error, now)
  }
}

export const _internals = { parseInput, STATE_FILE, ACCEPTANCE_ARG }
