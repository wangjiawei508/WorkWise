import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import YAML from 'yaml'
// The R2 publisher is an executable ESM module that also exposes side-effect-free
// validation helpers for release-gate coverage.
// @ts-expect-error JavaScript release helper intentionally has no declaration file.
import { _internals } from '../../scripts/publish-r2.mjs'

describe('R2 release delivery gates', () => {
  it('keeps releases in semantic newest-first order for three-version retention', () => {
    expect(['v0.3.9', 'v0.10.0', 'v0.3.10', 'v0.2.8'].sort(_internals.compareReleaseTagsDescending))
      .toEqual(['v0.10.0', 'v0.3.10', 'v0.3.9', 'v0.2.8'])
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
    expect(workflow.jobs['build-macos'].env.MAC_CODESIGN_P12_BASE64).toContain('secrets.MAC_CODESIGN_P12_BASE64')
    expect(workflow.jobs['cleanup-test-feed'].steps.at(-1).run).toContain('cleanup-acceptance')
    expect(workflow.jobs['cleanup-test-feed'].steps.at(-1).run).toContain('github.run_id')
  })

  it('dispatches branch-only updater acceptance through the registered release workflow', () => {
    const release = YAML.parse(readFileSync('.github/workflows/release.yml', 'utf8')) as {
      on: { workflow_dispatch: { inputs: Record<string, unknown> } }
      jobs: Record<string, any>
    }
    expect(release.on.workflow_dispatch.inputs).toHaveProperty('run_updater_acceptance')
    expect(release.jobs['native-updater-acceptance'].uses).toBe('./.github/workflows/updater-acceptance-e2e.yml')
    expect(release.jobs.prepare.if).toContain('run_updater_acceptance')
  })
})
