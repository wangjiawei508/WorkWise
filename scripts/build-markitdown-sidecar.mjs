import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { arch, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sidecarRoot = join(root, 'sidecars', 'markitdown')
const targetArch = process.env.WORKWISE_SIDECAR_ARCH || arch()
const outputRoot = join(root, 'build', 'sidecars', `markitdown-${platform()}-${targetArch}`)
const python = process.env.WORKWISE_PYTHON || (platform() === 'win32' ? 'python' : 'python3')

if (process.argv.includes('--verify-only')) {
  const executable = platform() === 'win32' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
  const executablePath = join(outputRoot, 'workwise-markitdown', executable)
  if (!existsSync(executablePath)) {
    throw new Error(`MarkItDown sidecar is missing: ${outputRoot}`)
  }
  const executableInfo = statSync(executablePath)
  if (executableInfo.size === 0) {
    throw new Error(`MarkItDown sidecar is empty: ${executablePath}`)
  }
  if (platform() !== 'win32' && (executableInfo.mode & 0o111) === 0) {
    throw new Error(`MarkItDown sidecar is not executable: ${executablePath}`)
  }
  if (!existsSync(join(outputRoot, 'workwise-markitdown', '_internal', 'magika', 'models', 'standard_v3_3', 'model.onnx'))) {
    throw new Error(`MarkItDown Magika model is missing: ${outputRoot}`)
  }
  if (!existsSync(join(outputRoot, 'workwise-markitdown', '_internal', 'ppt-master', 'scripts', 'svg_to_pptx.py'))) {
    throw new Error(`Bundled PPT Master exporter is missing: ${outputRoot}`)
  }
  if (!existsSync(join(outputRoot, 'workwise-markitdown', '_internal', 'ppt-master', 'scripts', 'pptx_to_svg.py'))) {
    throw new Error(`Bundled PPT Master importer is missing: ${outputRoot}`)
  }
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
const packagedRoot = join(outputRoot, 'workwise-markitdown')
if (platform() !== 'win32') {
  chmodSync(join(packagedRoot, 'workwise-markitdown'), 0o755)
}
copyFileSync(join(sidecarRoot, 'requirements.lock'), join(packagedRoot, 'requirements.lock'))
copyFileSync(join(sidecarRoot, 'README.md'), join(packagedRoot, 'README.md'))
copyFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(packagedRoot, 'THIRD_PARTY_NOTICES.md'))
