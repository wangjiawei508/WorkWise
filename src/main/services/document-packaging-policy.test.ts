import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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
    expect(requirements).not.toMatch(/markitdown-ocr|pymupdf|\bfitz\b/i)
  })

  it('rejects packaged helpers that omit the Magika model', async () => {
    const buildScript = await readFile(resolve(root, 'scripts/build-markitdown-sidecar.mjs'), 'utf8')
    const packageVerifier = await readFile(resolve(root, 'scripts/verify-packaged-markitdown.cjs'), 'utf8')
    expect(buildScript).toContain("'magika', 'models', 'standard_v3_3', 'model.onnx'")
    expect(packageVerifier).toContain("'magika', 'models', 'standard_v3_3', 'model.onnx'")
  })
})
