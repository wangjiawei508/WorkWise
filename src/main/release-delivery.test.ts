import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import YAML from 'yaml'
// The R2 publisher is an executable ESM module that also exposes side-effect-free
// validation helpers for release-gate coverage.
// @ts-expect-error JavaScript release helper intentionally has no declaration file.
import { _internals } from '../../scripts/publish-r2.mjs'
// @ts-expect-error JavaScript release helper intentionally has no declaration file.
import { _internals as websiteDelivery } from '../../scripts/deploy-website-release.mjs'
// @ts-expect-error JavaScript release helper intentionally has no declaration file.
import { isTransientMacSigningFailure, runMacArtifactBuildWithRetry } from '../../scripts/run-mac-artifact-build-with-retry.mjs'

describe('R2 release delivery gates', () => {
  it('retries only transient Apple timestamp outages during signed macOS packaging', async () => {
    expect(isTransientMacSigningFailure('The timestamp service is not available.')).toBe(true)
    expect(isTransientMacSigningFailure('bundle format is ambiguous')).toBe(false)

    const attempts: number[] = []
    const waits: number[] = []
    await runMacArtifactBuildWithRetry('x64', {
      attempts: 3,
      baseDelayMs: 5,
      execute: async (attempt: number) => {
        attempts.push(attempt)
        return attempt === 1
          ? { code: 1, signal: null, output: 'The timestamp service is not available.' }
          : { code: 0, signal: null, output: '' }
      },
      wait: async (ms: number) => { waits.push(ms) }
    })

    expect(attempts).toEqual([1, 2])
    expect(waits).toEqual([5])
    await expect(runMacArtifactBuildWithRetry('arm64', {
      attempts: 3,
      execute: async () => ({ code: 1, signal: null, output: 'invalid signature' }),
      wait: async () => undefined
    })).rejects.toThrow(/artifact build failed/)
  })

  it('keeps releases in semantic newest-first order for three-version retention', () => {
    expect(['v0.3.9', 'v0.10.0', 'v0.3.10', 'v0.2.8'].sort(_internals.compareReleaseTagsDescending))
      .toEqual(['v0.10.0', 'v0.3.10', 'v0.3.9', 'v0.2.8'])
  })

  it('bounds R2 promotion concurrency and network requests', () => {
    expect(_internals.R2_COPY_CONCURRENCY).toBe(3)
    expect(String(_internals.createR2RequestHandler)).toContain('requestTimeout: 5 * 60_000')
    expect(String(websiteDelivery.createR2RequestHandler)).toContain('connectionTimeout: 15_000')
  })

  it('rejects non-three-part release tags and unknown channels', () => {
    expect(() => _internals.normalizeTag('v0.3.3.1')).toThrow(/vX.Y.Z/)
    expect(() => _internals.normalizeChannel('nightly')).toThrow(/frontier, stable/)
  })

  it('limits updater acceptance cleanup to the exact run-scoped R2 prefix', () => {
    expect(_internals.acceptancePrefixForRunId('workwise/acceptance/12345', '12345'))
      .toBe('workwise/acceptance/12345/')
    expect(() => _internals.acceptancePrefixForRunId('workwise', '12345')).toThrow(/Refusing/)
    expect(() => _internals.acceptancePrefixForRunId('workwise/acceptance/12346', '12345')).toThrow(/Refusing/)
    expect(() => _internals.acceptancePrefixForRunId('workwise/acceptance/all', 'all')).toThrow(/positive/)
  })

  it('limits website publication to stable or exact run-scoped acceptance prefixes', () => {
    expect(websiteDelivery.normalizeReleasePrefix('workwise')).toEqual({
      prefix: 'workwise',
      relative: '',
      acceptanceRunId: ''
    })
    expect(websiteDelivery.normalizeReleasePrefix('workwise/acceptance/12345')).toEqual({
      prefix: 'workwise/acceptance/12345',
      relative: 'acceptance/12345',
      acceptanceRunId: '12345'
    })
    expect(() => websiteDelivery.normalizeReleasePrefix('workwise/../other')).toThrow(/Release prefix/)
    expect(() => websiteDelivery.normalizeReleasePrefix('workwise/acceptance/all')).toThrow(/Release prefix/)
    expect(websiteDelivery.r2StagingPrefix('workwise/acceptance/12345', '12345-1'))
      .toBe('workwise/acceptance/12345/delivery-staging/12345-1/')
    expect(websiteDelivery.normalizeTransport('r2')).toBe('r2')
    expect(() => websiteDelivery.normalizeTransport('ftp')).toThrow(/transport/)
  })

  it('pins website deployment to the WorkWise download root and atomic verified promotion', () => {
    expect(websiteDelivery.normalizeWebsiteRoot('/srv/site/downloads/workwise'))
      .toBe('/srv/site/downloads/workwise')
    expect(() => websiteDelivery.normalizeWebsiteRoot('/srv/site/downloads')).toThrow(/Unsafe/)
    expect(() => websiteDelivery.normalizeWebsiteRoot('/srv/../downloads/workwise')).toThrow(/Unsafe/)
    expect(() => websiteDelivery.normalizeWebsiteRoot('/')).toThrow(/Unsafe/)
    expect(websiteDelivery.FINALIZE_STAGE_SCRIPT).toContain('sha256sum -c SHA256SUMS.txt')
    expect(websiteDelivery.R2_DOWNLOAD_WORKER).toContain('urllib.request.urlopen')
    expect(websiteDelivery.R2_DOWNLOAD_WORKER).toContain('ThreadPoolExecutor')
    expect(websiteDelivery.R2_DOWNLOAD_WORKER).toContain("'Range': f'bytes={start}-{end}'")
    expect(websiteDelivery.R2_DOWNLOAD_WORKER).toContain('max_workers=min(24, len(jobs))')
    expect(websiteDelivery.R2_DOWNLOAD_WORKER).toContain('for attempt in range(4)')
    expect(websiteDelivery.START_R2_STAGE_DOWNLOAD_SCRIPT).toContain('nohup setsid')
    expect(websiteDelivery.POLL_R2_STAGE_DOWNLOAD_SCRIPT).toContain("printf 'running\\n'")
    expect(String(websiteDelivery.waitForRemoteR2Download)).toContain('consecutivePollFailures >= 5')
    expect(websiteDelivery.CLEAN_STAGE_SCRIPT).toContain('kill -- "-$pid"')
    expect(websiteDelivery.PROMOTE_SCRIPT).toContain('renameat2')
    expect(websiteDelivery.PROMOTE_SCRIPT).toContain('sorted(versions, reverse=True)[3:]')
    expect(websiteDelivery.CLEANUP_ACCEPTANCE_SCRIPT).toContain('/acceptance/[1-9][0-9]*')
    expect(websiteDelivery.CLEANUP_ACCEPTANCE_SCRIPT).toContain('.r2-download.pid')
    expect(websiteDelivery.sshOptions({
      port: '22',
      keyPath: '/tmp/key',
      knownHostsPath: '/tmp/known-hosts'
    })).toContain('ServerAliveCountMax=3')
  })

  it('rejects long, duplicate, or conflicting public metadata cache headers', () => {
    const valid = new Headers({
      'cache-control': 'public, max-age=60, must-revalidate',
      date: 'Mon, 10 Aug 2026 09:00:00 GMT',
      expires: 'Mon, 10 Aug 2026 09:01:00 GMT',
      etag: '"fixture"',
      'last-modified': 'Mon, 10 Aug 2026 08:59:00 GMT',
      'accept-ranges': 'bytes'
    })
    expect(websiteDelivery.assertMetadataCacheHeaders(valid, 'latest.json'))
      .toBe('public, max-age=60, must-revalidate')

    const duplicated = new Headers(valid)
    duplicated.set('cache-control', 'max-age=604800, public, max-age=604800')
    expect(() => websiteDelivery.assertMetadataCacheHeaders(duplicated, 'latest.yml'))
      .toThrow(/cache policy is invalid/)

    const staleExpires = new Headers(valid)
    staleExpires.set('cache-control', 'no-cache, no-store, must-revalidate')
    staleExpires.set('expires', 'Mon, 17 Aug 2026 09:00:00 GMT')
    expect(() => websiteDelivery.assertMetadataCacheHeaders(staleExpires, 'latest-mac.yml'))
      .toThrow(/Expires is too long/)
  })

  it('parses updater metadata with SHA-512 and blockmap fields', () => {
    expect(_internals.parseUpdateYml([
      'version: 0.3.3',
      'files:',
      '  - url: WorkWise-0.3.3-win-x64.exe',
      '    sha512: ZmFrZS1zaGE=',
      '    size: 123',
      '    blockMapSize: 45',
      'path: WorkWise-0.3.3-win-x64.exe',
      'sha512: ZmFrZS1zaGE='
    ].join('\n'))).toMatchObject({
      version: '0.3.3',
      files: [{ url: 'WorkWise-0.3.3-win-x64.exe', sha512: 'ZmFrZS1zaGE=', size: 123, blockMapSize: 45 }]
    })
  })

  it('keeps native updater acceptance signed, three-platform, isolated, and self-cleaning', () => {
    const workflow = YAML.parse(readFileSync('.github/workflows/updater-acceptance-e2e.yml', 'utf8')) as {
      env: Record<string, string>
      jobs: Record<string, any>
    }
    const matrix = workflow.jobs['native-update'].strategy.matrix.include as Array<Record<string, string>>
    expect(matrix.map((entry) => `${entry.platform}-${entry.arch}`)).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'win32-x64'
    ])
    expect(workflow.env.WORKWISE_RELEASE_PREFIX).toContain('workwise/acceptance/')
    const baselines = JSON.parse(
      readFileSync('release/updater-acceptance-baselines.json', 'utf8')
    ) as {
      schemaVersion: number
      versions: Record<string, Record<string, { name: string; sha256: string; size: number }>>
    }
    expect(baselines.schemaVersion).toBe(1)
    expect(Object.keys(baselines.versions)).toEqual(['0.3.5', '0.4.0'])
    expect(Object.keys(baselines.versions['0.4.0'])).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'win32-x64'
    ])
    for (const [key, asset] of Object.entries(baselines.versions['0.4.0'])) {
      expect(asset.name, key).toContain('WorkWise-0.4.0-')
      expect(asset.sha256, key).toMatch(/^[a-f0-9]{64}$/)
      expect(asset.size, key).toBeGreaterThan(200_000_000)
    }
    expect(workflow.jobs['build-macos'].env.MAC_CODESIGN_P12_BASE64).toContain('secrets.MAC_CODESIGN_P12_BASE64')
    const sidecarTransfer = workflow.jobs['build-document-sidecars'].steps.map((step: any) => step.run || '').join('\n')
    expect(sidecarTransfer).toContain('tar -czf')
    const macBuild = workflow.jobs['build-macos'].steps.map((step: any) => step.run || '').join('\n')
    expect(macBuild).toContain('tar -xzf')
    expect(macBuild).toContain('test -L')
    expect(macBuild).toContain('@napi-rs/canvas-darwin-x64@0.1.100')
    expect(macBuild).not.toContain('acceptance-artifacts/base-mac')
    const windowsBuild = workflow.jobs['build-windows'].steps.map((step: any) => step.run || '').join('\n')
    expect(windowsBuild).not.toContain('acceptance-artifacts/base-win')
    expect(workflow.jobs['publish-test-feed'].env.WORKWISE_WEBSITE_SSH_PRIVATE_KEY)
      .toContain('secrets.WORKWISE_WEBSITE_SSH_PRIVATE_KEY')
    const publication = workflow.jobs['publish-test-feed'].steps.map((step: any) => step.run || '').join('\n')
    const promotion = workflow.jobs['publish-test-feed'].steps.find((step: any) => step.name === 'Atomically promote isolated feed')
    expect(promotion['timeout-minutes']).toBe(20)
    expect(publication).toContain('deploy-website-release.mjs stage')
    expect(publication).toContain('--transport r2')
    expect(publication).toContain('deploy-website-release.mjs promote')
    expect(publication).toContain('deploy-website-release.mjs verify-public')
    expect(publication).toContain('--metadata-cache deferred')
    expect(publication).toContain('verify-metadata-cache')
    expect(workflow.jobs['acceptance-gate'].needs).toContain('publish-test-feed')
    const finalGate = workflow.jobs['acceptance-gate'].steps.map((step: any) => step.run || '').join('\n')
    expect(finalGate).toContain('single short/no-cache policy')
    expect(workflow.jobs['cleanup-test-feed'].steps.at(-1).run).toContain('cleanup-acceptance')
    expect(workflow.jobs['cleanup-test-feed'].steps.at(-1).run).toContain('github.run_id')
    const nativeUpdate = workflow.jobs['native-update'].steps.map((step: any) => step.run || '').join('\n')
    expect(nativeUpdate).toContain('release/updater-acceptance-baselines.json')
    expect(nativeUpdate).toContain('releases/download/v${{ inputs.base_version }}')
    expect(nativeUpdate).toContain('EXPECTED_SHA256')
    expect(nativeUpdate).toContain('EXPECTED_SIZE')
    const harness = readFileSync('scripts/run-native-updater-acceptance.mjs', 'utf8')
    expect(harness).toContain("'--env', 'WORKWISE_STARTUP_TRACE=1'")
    expect(harness).toContain("WORKWISE_STARTUP_TRACE: '1'")
    expect(harness).toContain('report.userDataPreserved !== true')
    expect(harness).toContain("'user_data_preserved'")
  })

  it('dispatches branch-only updater acceptance through the registered release workflow', () => {
    const release = YAML.parse(readFileSync('.github/workflows/release.yml', 'utf8')) as {
      on: { workflow_dispatch: { inputs: Record<string, unknown> } }
      jobs: Record<string, any>
    }
    expect(release.on.workflow_dispatch.inputs).toHaveProperty('run_updater_acceptance')
    expect(release.on.workflow_dispatch.inputs).toHaveProperty('cleanup_acceptance_run_id')
    expect(release.jobs['native-updater-acceptance'].uses).toBe('./.github/workflows/updater-acceptance-e2e.yml')
    expect(release.jobs['cleanup-updater-acceptance'].uses).toBe('./.github/workflows/updater-acceptance-cleanup.yml')
    expect(release.jobs.prepare.if).toContain('run_updater_acceptance')
    expect(release.jobs.publish.env.WORKWISE_WEBSITE_SSH_PRIVATE_KEY)
      .toContain('secrets.WORKWISE_WEBSITE_SSH_PRIVATE_KEY')
    const publication = release.jobs.publish.steps.map((step: any) => step.run || '').join('\n')
    expect(publication).toContain('deploy-website-release.mjs stage')
    expect(publication).toContain('--transport r2')
    expect(publication).toContain('deploy-website-release.mjs promote')
    expect(publication).toContain('deploy-website-release.mjs verify-public')
    const sidecarTransfer = release.jobs['build-document-sidecars'].steps.map((step: any) => step.run || '').join('\n')
    expect(sidecarTransfer).toContain('tar -czf')
    const macBuild = release.jobs['build-macos'].steps.map((step: any) => step.run || '').join('\n')
    expect(macBuild).toContain('tar -xzf')
    expect(macBuild).toContain('test -L')
    expect(macBuild).toContain('verify-mac-release-artifacts.cjs dist arm64 x64')
  })

  it('provides an exact-scope cleanup workflow for canceled updater acceptance runs', () => {
    const cleanup = YAML.parse(readFileSync('.github/workflows/updater-acceptance-cleanup.yml', 'utf8')) as {
      on: { workflow_dispatch: { inputs: Record<string, unknown> } }
      jobs: Record<string, any>
    }
    expect(cleanup.on.workflow_dispatch.inputs).toHaveProperty('run_id')
    const command = cleanup.jobs.cleanup.steps.map((step: any) => step.run || '').join('\n')
    expect(command).toContain('publish-r2.mjs cleanup-acceptance')
    expect(command).toContain('deploy-website-release.mjs cleanup-acceptance')
    expect(command).toContain('^[1-9][0-9]*$')
  })

  it('keeps website cache repair scoped, backed up, and validated before reload', () => {
    const repair = readFileSync('scripts/repair-website-cache.mjs', 'utf8')
    expect(repair).toContain('WorkWise updater metadata cache policy')
    expect(repair).toContain('workwise-cache-backup')
    expect(repair).toContain('nginx_bin" -t')
    expect(repair).toContain('apply=rolled_back')
    expect(repair).toContain('nginx_bin" -s reload')
    expect(repair).toContain('/downloads/workwise/')
    expect(repair).not.toContain('rm -rf')
  })
  it('requires final macOS DMG and ZIP artifacts to pass strict verification in CI', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(packageJson.scripts['verify:mac-release-artifacts']).toBe(
      'node ./scripts/verify-mac-release-artifacts.cjs'
    )
    const workflow = readFileSync('.github/workflows/updater-acceptance-e2e.yml', 'utf8')
    expect(workflow).toContain('node scripts/verify-mac-release-artifacts.cjs dist arm64 x64')
  })
})
