import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  rmSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const {
  adHocSignMacSidecar,
  verifyMarkItDownSidecar
} = require('./verify-packaged-markitdown.cjs')
// The shared gate owns these paths: 'magika', 'models', 'standard_v3_3', 'model.onnx'.
// It also checks the 'ppt-master', 'scripts', 'svg_to_pptx.py' runtime asset before returning.
const sidecarRoot = join(root, 'sidecars', 'markitdown')
const targetArch = process.env.WORKWISE_SIDECAR_ARCH || arch()
const outputRoot = join(root, 'build', 'sidecars', `markitdown-${platform()}-${targetArch}`)
const python = process.env.WORKWISE_PYTHON || (platform() === 'win32' ? 'python' : 'python3')
const packagedRoot = process.env.WORKWISE_MARKITDOWN_SIDECAR_ROOT
  ? resolve(process.env.WORKWISE_MARKITDOWN_SIDECAR_ROOT)
  : join(outputRoot, 'workwise-markitdown')

if (process.argv.includes('--verify-only')) {
  verifyMarkItDownSidecar(packagedRoot, platform())
  process.exit(0)
}

if (targetArch !== arch()) {
  throw new Error(
    `MarkItDown sidecar must be built on its target architecture: requested ${targetArch}, runner is ${arch()}.`
  )
}

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })
const result = spawnSync(
  python,
  ['-m', 'PyInstaller', '--noconfirm', '--distpath', outputRoot, '--workpath', join(outputRoot, '.work'), 'workwise-markitdown.spec'],
  { cwd: sidecarRoot, stdio: 'inherit', env: { ...process.env, PYTHONNOUSERSITE: '1' } }
)
if (result.status !== 0) process.exit(result.status ?? 1)
if (platform() !== 'win32') {
  chmodSync(join(packagedRoot, 'workwise-markitdown'), 0o755)
}
copyFileSync(join(sidecarRoot, 'requirements.lock'), join(packagedRoot, 'requirements.lock'))
copyFileSync(join(sidecarRoot, 'README.md'), join(packagedRoot, 'README.md'))
// Keep the sidecar's license bundle self-contained. The repository root notice
// file may be intentionally omitted from a downstream fork, but a packaged
// helper must still carry the notices for the components it ships.
copyFileSync(join(sidecarRoot, 'THIRD_PARTY_NOTICES.md'), join(packagedRoot, 'THIRD_PARTY_NOTICES.md'))
if (platform() === 'darwin') adHocSignMacSidecar(packagedRoot)
verifyMarkItDownSidecar(packagedRoot, platform())
