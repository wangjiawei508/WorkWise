import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const require = createRequire(import.meta.url)
const builderConfig = require('../../../electron-builder.cjs')
const afterPack = require('../../../scripts/after-pack.cjs')
const verifier = resolve(root, 'scripts/verify-packaged-markitdown.cjs')
const buildScript = resolve(root, 'scripts/build-markitdown-sidecar.mjs')

type SidecarFixtureOptions = {
  executableMode?: number
  includeBaseLibrary?: boolean
  protocol?: 'stable-error' | 'invalid'
}

function createMacSidecarFixture(
  sidecarRoot: string,
  options: SidecarFixtureOptions = {}
): void {
  const {
    executableMode = 0o755,
    includeBaseLibrary = true,
    protocol = 'stable-error'
  } = options
  mkdirSync(
    join(sidecarRoot, '_internal', 'magika', 'models', 'standard_v3_3'),
    { recursive: true }
  )
  mkdirSync(join(sidecarRoot, '_internal', 'ppt-master', 'scripts'), {
    recursive: true
  })
  mkdirSync(
    join(sidecarRoot, '_internal', 'Python.framework', 'Versions', '3.12', 'Resources'),
    { recursive: true }
  )

  const executable = join(sidecarRoot, 'workwise-markitdown')
  const response = protocol === 'stable-error'
    ? '{"ok":false,"code":"document_parse_failed","message":"fixture"}'
    : '{"ok":true}'
  const exitCode = protocol === 'stable-error' ? 2 : 0
  writeFileSync(
    executable,
    `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' '${response}'\nexit ${exitCode}\n`
  )
  chmodSync(executable, executableMode)

  for (const file of ['requirements.lock', 'README.md', 'THIRD_PARTY_NOTICES.md']) {
    writeFileSync(join(sidecarRoot, file), file)
  }
  if (includeBaseLibrary) {
    writeFileSync(join(sidecarRoot, '_internal', 'base_library.zip'), 'python stdlib')
  }
  writeFileSync(
    join(sidecarRoot, '_internal', 'magika', 'models', 'standard_v3_3', 'model.onnx'),
    'model'
  )
  for (const script of ['svg_to_pptx.py', 'pptx_to_svg.py', 'preset_shape_svg.py']) {
    writeFileSync(join(sidecarRoot, '_internal', 'ppt-master', 'scripts', script), script)
  }

  const pythonVersionRoot = join(
    sidecarRoot,
    '_internal',
    'Python.framework',
    'Versions',
    '3.12'
  )
  writeFileSync(join(pythonVersionRoot, 'Python'), 'python runtime')
  writeFileSync(join(pythonVersionRoot, 'Resources', 'Info.plist'), 'python resources')
  symlinkSync('3.12', join(sidecarRoot, '_internal', 'Python.framework', 'Versions', 'Current'))
  symlinkSync(
    'Versions/Current/Python',
    join(sidecarRoot, '_internal', 'Python.framework', 'Python')
  )
  symlinkSync(
    'Versions/Current/Resources',
    join(sidecarRoot, '_internal', 'Python.framework', 'Resources')
  )
  symlinkSync(
    'Python.framework/Versions/3.12/Python',
    join(sidecarRoot, '_internal', 'Python')
  )
}

function packagedSidecarRoot(candidateRoot: string): string {
  return join(
    candidateRoot,
    'WorkWise.app/Contents/Resources/app.asar.unpacked/sidecars/markitdown'
  )
}

function verifyPackaged(candidateRoot: string): void {
  execFileSync(process.execPath, [verifier, candidateRoot, 'mac', '1'], {
    stdio: 'pipe'
  })
}

describe('document helper packaging policy', () => {
  it('declares native MarkItDown builds for all three release targets', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/release.yml'), 'utf8')
    expect(workflow).toContain('macos-15')
    expect(workflow).toContain('macos-15-intel')
    expect(workflow).toContain('windows-latest')
    expect(workflow).toContain('markitdown-darwin-arm64')
    expect(workflow).toContain('markitdown-darwin-x64')
    expect(workflow).toContain('markitdown-win32-x64')
    expect(workflow).toContain('@napi-rs/canvas-darwin-x64@0.1.100')
    expect(workflow).toContain('Restore macOS sidecars with framework links and permissions')
    expect(workflow).toContain(
      'chmod 755 build/sidecars/markitdown-darwin-arm64/workwise-markitdown/workwise-markitdown'
    )
    expect(workflow).toContain(
      'chmod 755 build/sidecars/markitdown-darwin-x64/workwise-markitdown/workwise-markitdown'
    )
    expect(workflow).toContain("WORKWISE_REQUIRE_DOCUMENT_SIDECAR: '1'")
    expect(workflow).toContain('verify-packaged-markitdown.cjs dist mac')
    expect(workflow).toContain('verify-packaged-markitdown.cjs dist win')
    expect(workflow).toContain('verify-packaged-runtime-native.cjs dist mac')
    expect(workflow).toContain('verify-packaged-runtime-native.cjs dist win')
    expect(workflow).toMatch(/build-windows:[\s\S]*?runs-on: windows-2022/)
  })

  it('pins Windows quality checks to the supported Visual Studio 2022 runner', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/quality.yml'), 'utf8')
    expect(workflow).toMatch(/windows-security:[\s\S]*?runs-on: windows-2022/)
  })

  it('keeps the bridge local-only and excludes OCR/PyMuPDF', async () => {
    const sidecar = await readFile(resolve(root, 'sidecars/markitdown/sidecar.py'), 'utf8')
    const spec = await readFile(resolve(root, 'sidecars/markitdown/workwise-markitdown.spec'), 'utf8')
    const requirements = await readFile(resolve(root, 'sidecars/markitdown/requirements.lock'), 'utf8')
    const notices = await readFile(resolve(root, 'sidecars/markitdown/THIRD_PARTY_NOTICES.md'), 'utf8')
    expect(sidecar).toContain('convert_local')
    expect(sidecar).not.toMatch(/convert_uri|requests\.|urllib\./)
    expect(spec).toMatch(/"pymupdf".*"fitz"/)
    expect(spec).toContain('collect_all("magika")')
    expect(spec).toContain('"ppt-master"')
    expect(sidecar).toContain('ppt-master-export-pptx')
    expect(sidecar).toContain('ppt-master-import-pptx')
    expect(requirements).not.toMatch(/markitdown-ocr|pymupdf|\bfitz\b/i)
    expect(notices).toMatch(/Microsoft MarkItDown/i)
    expect(notices).toMatch(/Mozilla PDF\.js/i)
    expect(notices).toMatch(/MinerU/i)
  })

  it('rejects packaged helpers that omit the Magika model', async () => {
    const buildScript = await readFile(resolve(root, 'scripts/build-markitdown-sidecar.mjs'), 'utf8')
    const packageVerifier = await readFile(resolve(root, 'scripts/verify-packaged-markitdown.cjs'), 'utf8')
    expect(buildScript).toContain("'magika', 'models', 'standard_v3_3', 'model.onnx'")
    expect(packageVerifier).toContain("'magika', 'models', 'standard_v3_3', 'model.onnx'")
    expect(buildScript).toContain("'ppt-master', 'scripts', 'svg_to_pptx.py'")
    expect(packageVerifier).toContain("'ppt-master', 'scripts'")
  })

  it('keeps PyInstaller caches inside the isolated sidecar output', async () => {
    const buildScript = await readFile(resolve(root, 'scripts/build-markitdown-sidecar.mjs'), 'utf8')
    expect(buildScript).toContain("PYINSTALLER_CONFIG_DIR: join(outputRoot, '.pyinstaller')")
  })

  it('allows a cold helper startup window without weakening the smoke contract', async () => {
    const packageVerifier = await readFile(resolve(root, 'scripts/verify-packaged-markitdown.cjs'), 'utf8')
    expect(packageVerifier).toContain('WORKWISE_MARKITDOWN_STARTUP_TIMEOUT_MS')
    expect(packageVerifier).toContain('120_000')
  })

  it('preserves sidecar notices, hidden dylibs, and framework links as extra resources', () => {
    expect(builderConfig._internals.markitdownResourceFilter).toEqual(expect.arrayContaining([
      'workwise-markitdown',
      'requirements.lock',
      'README.md',
      'THIRD_PARTY_NOTICES.md',
      '_internal/**/*',
      '_internal/PIL/.dylibs/**/*',
      '_internal/Python.framework/**/*'
    ]))
    expect(Object.isFrozen(builderConfig._internals.markitdownResourceFilter)).toBe(true)
  })

  it('runs the complete gate for build --verify-only against an isolated sidecar fixture', () => {
    if (process.platform === 'win32') return
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-build-'))
    const verifyBuildFixture = (): void => {
      execFileSync(process.execPath, [buildScript, '--verify-only'], {
        env: {
          ...process.env,
          WORKWISE_MARKITDOWN_SIDECAR_ROOT: fixtureRoot,
          WORKWISE_SIDECAR_ARCH: 'isolated-fixture',
          WORKWISE_SIDECAR_PLATFORM: 'darwin'
        },
        stdio: 'pipe'
      })
    }
    try {
      createMacSidecarFixture(fixtureRoot)
      expect(verifyBuildFixture).not.toThrow()

      rmSync(join(fixtureRoot, 'requirements.lock'))
      expect(verifyBuildFixture).toThrow(/requirements\.lock/)
      writeFileSync(join(fixtureRoot, 'requirements.lock'), 'requirements.lock')

      rmSync(join(fixtureRoot, 'THIRD_PARTY_NOTICES.md'))
      expect(verifyBuildFixture).toThrow(/THIRD_PARTY_NOTICES\.md/)
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true })
    }
  })

  it('rejects missing Python archives and invalid helper startup responses', () => {
    if (process.platform === 'win32') return
    const missingArchiveRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-archive-'))
    const invalidProtocolRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-protocol-'))
    try {
      createMacSidecarFixture(packagedSidecarRoot(missingArchiveRoot), {
        includeBaseLibrary: false
      })
      createMacSidecarFixture(packagedSidecarRoot(invalidProtocolRoot), {
        protocol: 'invalid'
      })

      expect(() => verifyPackaged(missingArchiveRoot)).toThrow(/base_library\.zip/)
      expect(() => verifyPackaged(invalidProtocolRoot)).toThrow(/startup smoke/i)
    } finally {
      rmSync(missingArchiveRoot, { force: true, recursive: true })
      rmSync(invalidProtocolRoot, { force: true, recursive: true })
    }
  })

  it('rejects any dangling sidecar symlink', () => {
    if (process.platform === 'win32') return
    const candidateRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-link-'))
    try {
      const sidecarRoot = packagedSidecarRoot(candidateRoot)
      createMacSidecarFixture(sidecarRoot)
      mkdirSync(join(sidecarRoot, '_internal', 'PIL', '.dylibs'), { recursive: true })
      symlinkSync(
        'missing-image-library.dylib',
        join(sidecarRoot, '_internal', 'PIL', '.dylibs', 'libimage.dylib')
      )

      expect(() => verifyPackaged(candidateRoot)).toThrow(/dangling symbolic link/i)
    } finally {
      rmSync(candidateRoot, { force: true, recursive: true })
    }
  })

  it('applies the complete sidecar gate from afterPack', () => {
    if (process.platform === 'win32') return
    const candidateRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-after-pack-'))
    const context = {
      appOutDir: join(candidateRoot, 'mac-arm64'),
      electronPlatformName: 'darwin',
      arch: 'arm64',
      packager: { appInfo: { productFilename: 'WorkWise' } }
    }
    const sidecarRoot = join(
      afterPack._internals.unpackedAppRoot(context),
      'sidecars',
      'markitdown'
    )
    try {
      createMacSidecarFixture(sidecarRoot, { includeBaseLibrary: false })
      expect(() => {
        afterPack._internals.validateBundledMarkItDownSidecar(context)
      }).toThrow(/base_library\.zip/)
    } finally {
      rmSync(candidateRoot, { force: true, recursive: true })
    }
  })

  it('does not leave the candidate root through a DMG Applications symlink', () => {
    if (process.platform === 'win32') return
    const candidateRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-candidate-'))
    const externalRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-external-'))

    try {
      createMacSidecarFixture(packagedSidecarRoot(candidateRoot))
      createMacSidecarFixture(packagedSidecarRoot(externalRoot), { executableMode: 0o644 })
      symlinkSync(externalRoot, join(candidateRoot, 'Applications'))

      expect(() => verifyPackaged(candidateRoot)).not.toThrow()
    } finally {
      rmSync(candidateRoot, { force: true, recursive: true })
      rmSync(externalRoot, { force: true, recursive: true })
    }
  })
})
