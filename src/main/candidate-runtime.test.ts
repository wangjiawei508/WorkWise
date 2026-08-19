import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  configureCandidateApplicationPaths,
  candidateProcessUserDataPath,
  candidateEnvironmentFromArgv,
  isCandidateHeadless,
  isCandidateInboundAllowed,
  isCandidateOutboundDisabled,
  isCandidateRuntimeProbe,
  isUnconfiguredRecoveryCandidate,
  resolveCandidateRuntimePaths,
  runCandidateRuntimeProbe,
  sanitizeCandidateProcessEnvironment,
  UNCONFIGURED_RECOVERY_CANDIDATE_EXIT_CODE
} from './candidate-runtime'

describe('resolveCandidateRuntimePaths', () => {
  it('enables headless diagnostics only inside explicit candidate mode', () => {
    expect(isCandidateHeadless({ WORKWISE_CANDIDATE: '1', WORKWISE_CANDIDATE_HEADLESS: '1' })).toBe(true)
    expect(isCandidateHeadless({ WORKWISE_CANDIDATE_HEADLESS: '1' })).toBe(false)
    expect(isCandidateHeadless({ WORKWISE_CANDIDATE: '1' })).toBe(false)
  })

  it('enables the Runtime probe only for an explicit headless candidate', () => {
    expect(isCandidateRuntimeProbe({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_HEADLESS: '1',
      WORKWISE_CANDIDATE_RUNTIME_PROBE: '1'
    })).toBe(true)
    expect(isCandidateRuntimeProbe({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_RUNTIME_PROBE: '1'
    })).toBe(false)
    expect(isCandidateRuntimeProbe({
      WORKWISE_CANDIDATE_HEADLESS: '1',
      WORKWISE_CANDIDATE_RUNTIME_PROBE: '1'
    })).toBe(false)
  })

  it('disables candidate IM outbound by default and leaves production enabled', () => {
    expect(isCandidateOutboundDisabled({ WORKWISE_CANDIDATE: '1' })).toBe(true)
    expect(isCandidateOutboundDisabled({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '1'
    })).toBe(true)
    expect(isCandidateOutboundDisabled({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0'
    })).toBe(true)
    expect(isCandidateOutboundDisabled('feishu', 'oc_self_test', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_OUTBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test'
    })).toBe(false)
    expect(isCandidateOutboundDisabled('feishu', 'oc_other', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_OUTBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test'
    })).toBe(true)
    expect(isCandidateOutboundDisabled('weixin', 'wx_self_test', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_OUTBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_WEIXIN_CHAT_ID: 'wx_self_test'
    })).toBe(true)
    expect(isCandidateOutboundDisabled('feishu', 'oc_self_test', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_OUTBOUND_PROVIDER: 'feishu'
    })).toBe(true)
    expect(isCandidateOutboundDisabled('feishu', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_OUTBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test'
    })).toBe(true)
    expect(isCandidateOutboundDisabled({})).toBe(false)
  })

  it('allows candidate inbound only for an explicit provider, chat and command', () => {
    const env = {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_INBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_INBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_COMMAND: '/status'
    }
    expect(isCandidateInboundAllowed('feishu', 'oc_self_test', '/status', env)).toBe(true)
    expect(isCandidateInboundAllowed('feishu', 'oc_self_test', 'make a presentation', env)).toBe(false)
    expect(isCandidateInboundAllowed('feishu', 'oc_other', '/status', env)).toBe(false)
    expect(isCandidateInboundAllowed('weixin', 'oc_self_test', '/status', env)).toBe(false)
    expect(isCandidateInboundAllowed('feishu', 'oc_self_test', '/status', { WORKWISE_CANDIDATE: '1' })).toBe(false)
    expect(isCandidateInboundAllowed('feishu', 'oc_self_test', '/status', {})).toBe(true)
  })

  it('stops managed services and exits zero after a successful Runtime probe', async () => {
    const calls: string[] = []

    await runCandidateRuntimeProbe({
      ensureRuntime: async () => { calls.push('ensure') },
      reportReady: () => { calls.push('report') },
      stop: async () => { calls.push('stop') },
      exit: (code) => { calls.push(`exit:${code}`) }
    })

    expect(calls).toEqual(['ensure', 'report', 'stop', 'exit:0'])
  })

  it('does not report success or exit zero when the Runtime probe fails', async () => {
    const reportReady = vi.fn()
    const stop = vi.fn(async () => undefined)
    const exit = vi.fn()

    await expect(runCandidateRuntimeProbe({
      ensureRuntime: async () => { throw new Error('runtime unavailable') },
      reportReady,
      stop,
      exit
    })).rejects.toThrow('runtime unavailable')
    expect(reportReady).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })

  it('blocks a recovery candidate executable that lost its isolation environment', () => {
    const executable = '/private/tmp/check/WorkWise IM Recovery Candidate.app/Contents/MacOS/WorkWise IM Recovery Candidate'
    expect(isUnconfiguredRecoveryCandidate(executable, {})).toBe(true)
    expect(isUnconfiguredRecoveryCandidate(executable, { WORKWISE_CANDIDATE: '1' })).toBe(false)
    expect(isUnconfiguredRecoveryCandidate('/Applications/WorkWise.app/Contents/MacOS/WorkWise', {})).toBe(false)
    expect(UNCONFIGURED_RECOVERY_CANDIDATE_EXIT_CODE).toBe(78)
  })

  it('loads a recovery candidate environment from its in-root launch file', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-launch-'))
    const file = join(root, 'candidate.env')
    try {
      writeFileSync(file, [
        'WORKWISE_CANDIDATE=1',
        `WORKWISE_CANDIDATE_ROOT=${root}`,
        `WORKWISE_CANDIDATE_USER_DATA=${join(root, 'user-data')}`,
        `WORKWISE_CANDIDATE_CREDENTIAL_HELPER=${join(root, 'authorized', 'WorkWise')}`,
        'WORKWISE_CANDIDATE_OUTBOUND_DISABLED=1',
        'UNRELATED_SECRET=must-not-be-loaded'
      ].join('\n'))
      const env = candidateEnvironmentFromArgv(
        '/private/tmp/WorkWise IM Recovery Candidate.app/Contents/MacOS/WorkWise IM Recovery Candidate',
        [`--workwise-candidate-env-file=${file}`],
        {}
      )
      expect(env).toMatchObject({
        WORKWISE_CANDIDATE: '1',
        WORKWISE_CANDIDATE_ROOT: root,
        WORKWISE_CANDIDATE_CREDENTIAL_HELPER: join(root, 'authorized', 'WorkWise'),
        WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '1'
      })
      expect(env.UNRELATED_SECRET).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('decodes shell-escaped paths emitted by the candidate authorization script', () => {
    const parent = mkdtempSync(join(tmpdir(), 'workwise-candidate-launch-'))
    const root = join(parent, 'root with spaces')
    mkdirSync(root, { recursive: true })
    const file = join(root, 'candidate.env')
    try {
      const escaped = (value: string): string => value.replace(/ /g, '\\ ')
      writeFileSync(file, [
        'WORKWISE_CANDIDATE=1',
        `WORKWISE_CANDIDATE_ROOT=${escaped(root)}`,
        `WORKWISE_CANDIDATE_USER_DATA=${escaped(join(root, 'user-data'))}`
      ].join('\n'))
      const env = candidateEnvironmentFromArgv(
        '/private/tmp/WorkWise IM Recovery Candidate.app/Contents/MacOS/WorkWise IM Recovery Candidate',
        [`--workwise-candidate-env-file=${file}`],
        {}
      )
      expect(env.WORKWISE_CANDIDATE_ROOT).toBe(root)
      expect(env.WORKWISE_CANDIDATE_USER_DATA).toBe(join(root, 'user-data'))
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('uses the launch file to complete a partially inherited candidate environment', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-launch-'))
    const file = join(root, 'candidate.env')
    try {
      const stableHelper = join(root, 'authorized helper', 'WorkWise')
      writeFileSync(file, [
        'WORKWISE_CANDIDATE=1',
        `WORKWISE_CANDIDATE_ROOT=${root}`,
        `WORKWISE_CANDIDATE_CREDENTIAL_HELPER='${stableHelper}'`
      ].join('\n'))
      const env = candidateEnvironmentFromArgv(
        '/private/tmp/WorkWise IM Recovery Candidate.app/Contents/MacOS/WorkWise IM Recovery Candidate',
        [`--workwise-candidate-env-file=${file}`],
        {
          WORKWISE_CANDIDATE: '1',
          WORKWISE_CANDIDATE_CREDENTIAL_HELPER: join(root, 'current', 'WorkWise')
        }
      )
      expect(env.WORKWISE_CANDIDATE_CREDENTIAL_HELPER).toBe(stableHelper)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails closed when a production executable receives a candidate environment argument', () => {
    expect(() => candidateEnvironmentFromArgv(
      '/Applications/WorkWise.app/Contents/MacOS/WorkWise',
      ['--workwise-candidate-env-file=/private/tmp/workwise-candidate/candidate.env'],
      {}
    )).toThrow('accepted only by an isolated recovery candidate')
  })

  it('recognizes the packaged candidate when Electron reports its framework executable', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-bundle-'))
    const bundle = join(root, 'WorkWise IM Recovery Candidate.app')
    const resources = join(bundle, 'Contents', 'Resources')
    const file = join(root, 'candidate.env')
    try {
      mkdirSync(resources, { recursive: true })
      writeFileSync(join(bundle, 'Contents', 'Info.plist'), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<plist version="1.0"><dict>',
        '<key>CFBundleIdentifier</key>',
        '<string>com.wangjiawei508.workwise.imcandidate.recovery</string>',
        '</dict></plist>'
      ].join('\n'), { encoding: 'utf8', flag: 'w' })
      writeFileSync(file, `WORKWISE_CANDIDATE=1\nWORKWISE_CANDIDATE_ROOT=${root}\n`)
      expect(candidateEnvironmentFromArgv(
        '/framework/Electron',
        [`--workwise-candidate-env-file=${file}`],
        {},
        resources
      )).toMatchObject({ WORKWISE_CANDIDATE: '1', WORKWISE_CANDIDATE_ROOT: root })
      expect(isUnconfiguredRecoveryCandidate('/framework/Electron', {}, resources)).toBe(true)
      expect(isUnconfiguredRecoveryCandidate('/framework/Electron', { WORKWISE_CANDIDATE: '1' }, resources)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a candidate launch file outside the declared isolated root', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-launch-'))
    const outside = mkdtempSync(join(tmpdir(), 'workwise-candidate-outside-'))
    const file = join(outside, 'candidate.env')
    try {
      writeFileSync(file, `WORKWISE_CANDIDATE=1\nWORKWISE_CANDIDATE_ROOT=${root}\n`)
      expect(() => candidateEnvironmentFromArgv(
        '/private/tmp/WorkWise IM Recovery Candidate.app/Contents/MacOS/WorkWise IM Recovery Candidate',
        [`--workwise-candidate-env-file=${file}`],
        {}
      )).toThrow('must be the candidate.env file inside its isolated root')
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('keeps every candidate data path inside the isolated root', () => {
    expect(resolveCandidateRuntimePaths({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_ROOT: '/private/tmp/workwise-candidate'
    })).toEqual({
      root: '/private/tmp/workwise-candidate',
      userData: '/private/tmp/workwise-candidate/user-data',
      cache: '/private/tmp/workwise-candidate/cache',
      sessionData: '/private/tmp/workwise-candidate/session-data',
      crashDumps: '/private/tmp/workwise-candidate/crash-dumps',
      logs: '/private/tmp/workwise-candidate/logs',
      home: '/private/tmp/workwise-candidate/home',
      workwiseHome: '/private/tmp/workwise-candidate/home/.workwise',
      toolsRoot: '/private/tmp/workwise-candidate/home/.workwise/tools'
    })
  })

  it('redirects every Electron profile path before a candidate window starts', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-profile-'))
    const paths = resolveCandidateRuntimePaths({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_ROOT: root
    })!
    const configured = new Map<string, string>()

    configureCandidateApplicationPaths(
      paths,
      ['WorkWise'],
      false,
      (name, path) => configured.set(name, path)
    )

    expect(Object.fromEntries(configured)).toEqual({
      userData: join(root, 'user-data'),
      cache: join(root, 'cache'),
      sessionData: join(root, 'session-data'),
      crashDumps: join(root, 'crash-dumps'),
      logs: join(root, 'logs')
    })
  })

  it('rejects candidate paths that escape the isolated root', () => {
    expect(() => resolveCandidateRuntimePaths({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_ROOT: '/private/tmp/workwise-candidate',
      WORKWISE_CANDIDATE_USER_DATA: '/Users/private/Library/Application Support/WorkWise'
    })).toThrow('WORKWISE_CANDIDATE_USER_DATA must stay inside WORKWISE_CANDIDATE_ROOT')
  })

  it('uses an isolated in-root user data directory for the credential helper', () => {
    const paths = resolveCandidateRuntimePaths({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_ROOT: '/private/tmp/workwise-candidate',
      WORKWISE_CANDIDATE_USER_DATA: '/private/tmp/workwise-candidate/user-data'
    })!

    expect(candidateProcessUserDataPath(
      paths,
      ['WorkWise', '--im-credential-helper', '--user-data-dir=/private/tmp/workwise-candidate/user-data/credential-helper'],
      true
    )).toBe('/private/tmp/workwise-candidate/user-data/credential-helper')
    expect(candidateProcessUserDataPath(
      paths,
      ['WorkWise', '--user-data-dir=/private/tmp/workwise-candidate/ignored'],
      false
    )).toBe('/private/tmp/workwise-candidate/user-data')
  })

  it('rejects credential helper user data outside the candidate root', () => {
    const paths = resolveCandidateRuntimePaths({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_ROOT: '/private/tmp/workwise-candidate'
    })!

    expect(() => candidateProcessUserDataPath(
      paths,
      ['WorkWise', '--im-credential-helper', '--user-data-dir=/Users/private/Library/Application Support/WorkWise'],
      true
    )).toThrow('must stay inside WORKWISE_CANDIDATE_ROOT')
  })

  it('does not change normal application paths outside candidate mode', () => {
    expect(resolveCandidateRuntimePaths({})).toBeNull()
  })

  it('does not inherit the production API key into a candidate process', () => {
    const candidateEnv = {
      WORKWISE_CANDIDATE: '1',
      DEEPSEEK_API_KEY: 'production-secret',
      PATH: '/usr/bin'
    }
    const productionEnv = {
      DEEPSEEK_API_KEY: 'production-secret'
    }

    sanitizeCandidateProcessEnvironment(candidateEnv)
    sanitizeCandidateProcessEnvironment(productionEnv)

    expect(candidateEnv).toEqual({
      WORKWISE_CANDIDATE: '1',
      PATH: '/usr/bin'
    })
    expect(productionEnv.DEEPSEEK_API_KEY).toBe('production-secret')
  })
})
