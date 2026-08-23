import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as createNetServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  candidateServicePortPatch,
  configureCandidateApplicationPaths,
  candidateProcessUserDataPath,
  candidateEnvironmentFromArgv,
  isCandidateHeadless,
  isCandidateCredentialAccessAllowed,
  isCandidateImProviderConnectionAllowed,
  isCandidateInboundAllowed,
  isCandidateOutboundDisabled,
  isCandidateRuntimeProbe,
  isUnconfiguredRecoveryCandidate,
  resolveCandidateRuntimePaths,
  reserveCandidateServicePorts,
  verifyCandidateServiceListeners,
  runCandidateRuntimeProbe,
  sanitizeCandidateProcessEnvironment,
  UNCONFIGURED_RECOVERY_CANDIDATE_EXIT_CODE
} from './candidate-runtime'

describe('resolveCandidateRuntimePaths', () => {
  it('keeps protected storage disabled unless candidate access is explicit', () => {
    expect(isCandidateCredentialAccessAllowed({})).toBe(true)
    expect(isCandidateCredentialAccessAllowed({ WORKWISE_CANDIDATE: '1' })).toBe(false)
    expect(isCandidateCredentialAccessAllowed({
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_CREDENTIAL_ACCESS: '1'
    })).toBe(true)
  })

  it('holds candidate schedule and IM ports until the reservation is closed', async () => {
    const reservations = await reserveCandidateServicePorts()
    const assertPortUnavailable = async (port: number): Promise<void> => {
      const contender = createNetServer()
      try {
        await expect(new Promise<void>((resolve, reject) => {
          contender.once('error', reject)
          contender.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve())
        })).rejects.toMatchObject({ code: 'EADDRINUSE' })
      } finally {
        await new Promise<void>((resolve) => contender.close(() => resolve()))
      }
    }
    try {
      await assertPortUnavailable(reservations.ports.schedule)
      await assertPortUnavailable(reservations.ports.im)
    } finally {
      await reservations.close()
    }
  })

  it('verifies all candidate listeners without sending an IM message', async () => {
    const requests: string[] = []
    const services = [
      { path: '/health', body: { status: 'ok', service: 'kun', mode: 'serve', protocolVersion: 1 } },
      { path: '/schedule/internal/health', body: { status: 'ok', service: 'schedule', mode: 'embedded' } },
      { path: '/claw/internal/health', body: { status: 'ok', service: 'claw', mode: 'embedded' } }
    ] as const
    const servers: HttpServer[] = services.map(({ path, body }) => createHttpServer((req, res) => {
      requests.push(req.url ?? '')
      if (req.method !== 'GET' || req.url !== path) {
        res.writeHead(404).end()
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }))
    try {
      const ports = await Promise.all(servers.map((server) => new Promise<number>((resolve, reject) => {
        server.once('error', reject)
        server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
          resolve((server.address() as AddressInfo).port)
        })
      })))
      await expect(verifyCandidateServiceListeners({
        runtime: ports[0]!,
        schedule: ports[1]!,
        im: ports[2]!
      })).resolves.toEqual({ runtime: ports[0], schedule: ports[1], im: ports[2] })
      expect(requests).toEqual([
        '/health',
        '/schedule/internal/health',
        '/claw/internal/health'
      ])
    } finally {
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
    }
  })

  it.each([404, 405, 500])('rejects candidate health responses with HTTP %s', async (status) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status,
      text: async () => JSON.stringify({ status: 'error' })
    } as Response)
    await expect(verifyCandidateServiceListeners({ runtime: 20_001, schedule: 20_002, im: 20_003 }))
      .rejects.toThrow(`HTTP ${status}`)
    fetchMock.mockRestore()
  })

  it('rejects swapped candidate service identities', async () => {
    const healthBodies = [
      { status: 'ok', service: 'kun', mode: 'serve', protocolVersion: 1 },
      { status: 'ok', service: 'claw', mode: 'embedded' },
      { status: 'ok', service: 'schedule', mode: 'embedded' }
    ]
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(healthBodies.shift())
    } as Response))
    await expect(verifyCandidateServiceListeners({ runtime: 20_001, schedule: 20_002, im: 20_003 }))
      .rejects.toThrow('unexpected service identity')
    fetchMock.mockRestore()
  })

  it('maps candidate-only ports onto Runtime, schedule and IM settings', () => {
    expect(candidateServicePortPatch({ runtime: 20_001, schedule: 20_002, im: 20_003 })).toEqual({
      agents: { kun: { port: 20_001 } },
      schedule: { internal: { port: 20_002 } },
      claw: { im: { port: 20_003 } }
    })
    expect(() => candidateServicePortPatch({ runtime: 20_001, schedule: 20_001, im: 20_003 }))
      .toThrow('distinct')
  })

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

  it('connects candidate IM providers only for a bounded authorization', () => {
    expect(isCandidateImProviderConnectionAllowed('feishu', {})).toBe(true)
    expect(isCandidateImProviderConnectionAllowed('feishu', { WORKWISE_CANDIDATE: '1' })).toBe(false)
    expect(isCandidateImProviderConnectionAllowed('weixin', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_INBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_INBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_COMMAND: '/status'
    })).toBe(false)
    expect(isCandidateImProviderConnectionAllowed('feishu', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_INBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_INBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test'
    })).toBe(false)
    expect(isCandidateImProviderConnectionAllowed('feishu', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_INBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_INBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_COMMAND: '/status'
    })).toBe(true)
    expect(isCandidateImProviderConnectionAllowed('feishu', {
      WORKWISE_CANDIDATE: '1',
      WORKWISE_CANDIDATE_OUTBOUND_DISABLED: '0',
      WORKWISE_CANDIDATE_OUTBOUND_PROVIDER: 'feishu',
      WORKWISE_CANDIDATE_ALLOWED_FEISHU_CHAT_ID: 'oc_self_test'
    })).toBe(true)
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

  it('verifies candidate services before reporting probe readiness', async () => {
    const calls: string[] = []
    const ports = { runtime: 20_101, schedule: 20_102, im: 20_103 }
    let reported: unknown
    await runCandidateRuntimeProbe({
      ensureRuntime: async () => { calls.push('ensure') },
      verifyServices: async () => { calls.push('verify'); return ports },
      reportReady: (verifiedPorts) => { calls.push('report'); reported = verifiedPorts },
      stop: async () => { calls.push('stop') },
      exit: (code) => { calls.push(`exit:${code}`) }
    })
    expect(calls).toEqual(['ensure', 'verify', 'report', 'stop', 'exit:0'])
    expect(reported).toEqual(ports)
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

  it('recognizes a source-head candidate bundle when Electron reports its framework executable', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-head-bundle-'))
    const bundle = join(root, 'WorkWise Candidate 4231176860bd.app')
    const resources = join(bundle, 'Contents', 'Resources')
    const file = join(root, 'candidate.env')
    try {
      mkdirSync(resources, { recursive: true })
      writeFileSync(join(bundle, 'Contents', 'Info.plist'), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<plist version="1.0"><dict>',
        '<key>CFBundleIdentifier</key>',
        '<string>com.wangjiawei508.workwise.candidate.head4231176860bd</string>',
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
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('recognizes a source-head candidate by its executable name when resourcesPath is unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-executable-'))
    const file = join(root, 'candidate.env')
    try {
      writeFileSync(file, `WORKWISE_CANDIDATE=1\nWORKWISE_CANDIDATE_ROOT=${root}\n`)
      expect(candidateEnvironmentFromArgv(
        '/private/tmp/WorkWise Candidate 4231176860bd',
        [`--workwise-candidate-env-file=${file}`],
        {},
        undefined
      )).toMatchObject({ WORKWISE_CANDIDATE: '1', WORKWISE_CANDIDATE_ROOT: root })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('recognizes a framework executable inside a source-head candidate bundle', () => {
    const root = mkdtempSync(join(tmpdir(), 'workwise-candidate-framework-'))
    const file = join(root, 'candidate.env')
    try {
      writeFileSync(file, `WORKWISE_CANDIDATE=1\nWORKWISE_CANDIDATE_ROOT=${root}\n`)
      expect(candidateEnvironmentFromArgv(
        `${root}/WorkWise Candidate 4231176860bd.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework`,
        [`--workwise-candidate-env-file=${file}`],
        {},
        undefined
      )).toMatchObject({ WORKWISE_CANDIDATE: '1', WORKWISE_CANDIDATE_ROOT: root })
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
