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
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')

describe('document helper packaging policy', () => {
  it('declares native MarkItDown builds for all three release targets', async () => {
    const workflow = await readFile(resolve(root, '.github/workflows/release.yml'), 'utf8')
    expect(workflow).toContain('macos-15')
    expect(workflow).toContain('macos-15-intel')
    expect(workflow).toContain('windows-latest')
    expect(workflow).toContain('markitdown-darwin-arm64')
    expect(workflow).toContain('markitdown-darwin-x64')
    expect(workflow).toContain('markitdown-win32-x64')
    expect(workflow).toContain('Restore macOS sidecar executable permissions')
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

  it('keeps the bridge local-only and excludes OCR/PyMuPDF', async () => {
    const sidecar = await readFile(resolve(root, 'sidecars/markitdown/sidecar.py'), 'utf8')
    const spec = await readFile(resolve(root, 'sidecars/markitdown/workwise-markitdown.spec'), 'utf8')
    const requirements = await readFile(resolve(root, 'sidecars/markitdown/requirements.lock'), 'utf8')
    expect(sidecar).toContain('convert_local')
    expect(sidecar).not.toMatch(/convert_uri|requests\.|urllib\./)
    expect(spec).toMatch(/"pymupdf".*"fitz"/)
    expect(spec).toContain('collect_all("magika")')
    expect(spec).toContain('"ppt-master"')
    expect(sidecar).toContain('ppt-master-export-pptx')
    expect(sidecar).toContain('ppt-master-import-pptx')
    expect(requirements).not.toMatch(/markitdown-ocr|pymupdf|\bfitz\b/i)
  })

  it('rejects packaged helpers that omit the Magika model', async () => {
    const buildScript = await readFile(resolve(root, 'scripts/build-markitdown-sidecar.mjs'), 'utf8')
    const packageVerifier = await readFile(resolve(root, 'scripts/verify-packaged-markitdown.cjs'), 'utf8')
    expect(buildScript).toContain("'magika', 'models', 'standard_v3_3', 'model.onnx'")
    expect(packageVerifier).toContain("'magika', 'models', 'standard_v3_3', 'model.onnx'")
    expect(buildScript).toContain("'ppt-master', 'scripts', 'svg_to_pptx.py'")
    expect(packageVerifier).toContain("'ppt-master', 'scripts'")
  })

  it('does not leave the candidate root through a DMG Applications symlink', () => {
    if (process.platform === 'win32') return
    const candidateRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-candidate-'))
    const externalRoot = mkdtempSync(join(tmpdir(), 'workwise-sidecar-external-'))
    const verifier = resolve(root, 'scripts/verify-packaged-markitdown.cjs')
    const createSidecar = (base: string, executableMode: number): void => {
      const sidecarRoot = join(
        base,
        'WorkWise.app/Contents/Resources/app.asar.unpacked/sidecars/markitdown'
      )
      mkdirSync(
        join(sidecarRoot, '_internal', 'magika', 'models', 'standard_v3_3'),
        { recursive: true }
      )
      mkdirSync(join(sidecarRoot, '_internal', 'ppt-master', 'scripts'), {
        recursive: true
      })
      const executable = join(sidecarRoot, 'workwise-markitdown')
      writeFileSync(executable, 'sidecar')
      chmodSync(executable, executableMode)
      for (const file of ['requirements.lock', 'README.md', 'THIRD_PARTY_NOTICES.md']) {
        writeFileSync(join(sidecarRoot, file), file)
      }
      writeFileSync(
        join(sidecarRoot, '_internal', 'magika', 'models', 'standard_v3_3', 'model.onnx'),
        'model'
      )
      for (const script of ['svg_to_pptx.py', 'pptx_to_svg.py', 'preset_shape_svg.py']) {
        writeFileSync(join(sidecarRoot, '_internal', 'ppt-master', 'scripts', script), script)
      }
    }

    try {
      createSidecar(candidateRoot, 0o755)
      createSidecar(externalRoot, 0o644)
      symlinkSync(externalRoot, join(candidateRoot, 'Applications'))

      expect(() => {
        execFileSync(process.execPath, [verifier, candidateRoot, 'mac', '1'], {
          stdio: 'pipe'
        })
      }).not.toThrow()
    } finally {
      rmSync(candidateRoot, { force: true, recursive: true })
      rmSync(externalRoot, { force: true, recursive: true })
    }
  })
})
