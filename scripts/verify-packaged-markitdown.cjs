const { spawnSync } = require('node:child_process')
const {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} = require('node:fs')
const { basename, dirname, join, resolve } = require('node:path')

const REQUIRED_NOTICES = ['requirements.lock', 'README.md', 'THIRD_PARTY_NOTICES.md']
const REQUIRED_PPT_SCRIPTS = ['svg_to_pptx.py', 'pptx_to_svg.py', 'preset_shape_svg.py']

function normalizeTarget(target) {
  if (target === 'mac' || target === 'darwin') return 'mac'
  if (target === 'win' || target === 'win32') return 'win'
  throw new Error(`Unsupported MarkItDown target: ${target}`)
}

function assertNonEmptyFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  const info = statSync(path)
  if (!info.isFile() || info.size === 0) {
    throw new Error(`${label} is empty or not a file: ${path}`)
  }
}

function validateNoDanglingSymlinks(root) {
  walk(root, (_path) => {}, (path) => {
    try {
      statSync(path)
    } catch (error) {
      throw new Error(`Dangling symbolic link in MarkItDown sidecar: ${path} (${error.message})`)
    }
  })
}

function assertRequiredSymlink(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
  if (!lstatSync(path).isSymbolicLink()) {
    throw new Error(`${label} is not a symbolic link: ${path}`)
  }
}

function smokeMarkItDownHelper(executablePath) {
  const result = spawnSync(executablePath, [], {
    input: '{}\n',
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
    windowsHide: true
  })
  if (result.error) {
    throw new Error(`MarkItDown helper startup smoke failed: ${executablePath}: ${result.error.message}`)
  }

  const outputLines = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  let response = null
  try {
    response = outputLines.length === 1 ? JSON.parse(outputLines[0]) : null
  } catch {
    response = null
  }
  if (
    result.status !== 2 ||
    response?.ok !== false ||
    response?.code !== 'document_parse_failed' ||
    typeof response?.message !== 'string'
  ) {
    const stderr = String(result.stderr || '').trim()
    throw new Error(
      `MarkItDown helper startup smoke failed: expected exit 2 with document_parse_failed, ` +
      `received status ${result.status}, stdout ${JSON.stringify(String(result.stdout || '').trim())}, ` +
      `stderr ${JSON.stringify(stderr)}`
    )
  }
}

function verifyMarkItDownSidecar(sidecarRoot, rawTarget) {
  const target = normalizeTarget(rawTarget)
  const executableName = target === 'win' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
  const executablePath = join(sidecarRoot, executableName)
  assertNonEmptyFile(executablePath, 'Packaged MarkItDown helper')
  if (target === 'mac' && (statSync(executablePath).mode & 0o111) === 0) {
    throw new Error(`Packaged MarkItDown helper is not executable: ${executablePath}`)
  }

  for (const required of REQUIRED_NOTICES) {
    assertNonEmptyFile(join(sidecarRoot, required), 'Packaged MarkItDown notice')
  }
  assertNonEmptyFile(
    join(sidecarRoot, '_internal', 'base_library.zip'),
    'Packaged MarkItDown Python runtime archive'
  )
  assertNonEmptyFile(
    join(sidecarRoot, '_internal', 'magika', 'models', 'standard_v3_3', 'model.onnx'),
    'Packaged MarkItDown Magika model'
  )
  for (const script of REQUIRED_PPT_SCRIPTS) {
    assertNonEmptyFile(
      join(sidecarRoot, '_internal', 'ppt-master', 'scripts', script),
      'Packaged PPT Master runtime script'
    )
  }

  if (target === 'mac') {
    const frameworkRoot = join(sidecarRoot, '_internal', 'Python.framework')
    assertRequiredSymlink(join(sidecarRoot, '_internal', 'Python'), 'Packaged Python runtime link')
    assertRequiredSymlink(join(frameworkRoot, 'Python'), 'Packaged Python framework binary link')
    assertRequiredSymlink(join(frameworkRoot, 'Resources'), 'Packaged Python framework resources link')
    assertRequiredSymlink(
      join(frameworkRoot, 'Versions', 'Current'),
      'Packaged Python framework current-version link'
    )
    assertNonEmptyFile(
      join(frameworkRoot, 'Versions', 'Current', 'Python'),
      'Packaged Python framework binary'
    )
    assertNonEmptyFile(
      join(frameworkRoot, 'Versions', 'Current', 'Resources', 'Info.plist'),
      'Packaged Python framework resources'
    )
  }

  validateNoDanglingSymlinks(sidecarRoot)
  smokeMarkItDownHelper(executablePath)
  return executablePath
}

function isMachO(path) {
  if (!existsSync(path) || !statSync(path).isFile()) return false
  const magic = readFileSync(path).subarray(0, 4).toString('hex')
  return new Set(['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca'])
    .has(magic)
}

function adHocSignMacSidecar(sidecarRoot) {
  const candidates = [
    join(sidecarRoot, '_internal', 'Python.framework', 'Versions', 'Current', 'Python'),
    join(sidecarRoot, 'workwise-markitdown')
  ]
  for (const candidate of candidates) {
    if (!isMachO(candidate)) continue
    const resolvedCandidate = realpathSync(candidate)
    const result = spawnSync(
      'codesign',
      ['--force', '--sign', '-', '--timestamp=none', resolvedCandidate],
      { encoding: 'utf8' }
    )
    if (result.status !== 0) {
      throw new Error(
        `Failed to ad-hoc sign MarkItDown runtime ${resolvedCandidate}: ` +
        String(result.stderr || result.stdout || '').trim()
      )
    }
  }
}

function verifyPackagedOutput(root, rawTarget, expectedOverride) {
  const target = normalizeTarget(rawTarget)
  if (!existsSync(root)) throw new Error(`Packaged output does not exist: ${root}`)
  const executable = target === 'win' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
  const matches = []
  walk(root, (path) => {
    if (basename(path) !== executable) return
    if (!path.replaceAll('\\', '/').includes('/app.asar.unpacked/sidecars/markitdown/')) return
    matches.push(verifyMarkItDownSidecar(dirname(path), target))
  }, (path) => {
    try {
      statSync(path)
    } catch (error) {
      throw new Error(`Dangling symbolic link in packaged output: ${path} (${error.message})`)
    }
  })

  const expected = expectedOverride === undefined ? (target === 'mac' ? 2 : 1) : Number(expectedOverride)
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new Error(`EXPECTED_HELPERS must be a positive integer, received: ${expectedOverride}`)
  }
  if (matches.length !== expected) {
    throw new Error(
      `Expected ${expected} packaged MarkItDown helper(s) for ${target}, ` +
      `found ${matches.length}: ${matches.join(', ')}`
    )
  }
  return matches
}

function walk(directory, visitFile, visitSymlink = () => {}) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const info = lstatSync(path)
    if (info.isSymbolicLink()) {
      visitSymlink(path)
    } else if (info.isDirectory()) {
      walk(path, visitFile, visitSymlink)
    } else if (info.isFile()) {
      visitFile(path)
    }
  }
}

if (require.main === module) {
  const root = resolve(process.argv[2] || 'dist')
  const target = process.argv[3]
  const expectedOverride = process.argv[4]
  if (target !== 'mac' && target !== 'win') {
    throw new Error('usage: verify-packaged-markitdown.cjs DIST_DIR mac|win [EXPECTED_HELPERS]')
  }
  const matches = verifyPackagedOutput(root, target, expectedOverride)
  console.log(`Verified ${matches.length} packaged MarkItDown helper(s):\n${matches.join('\n')}`)
}

module.exports = {
  adHocSignMacSidecar,
  smokeMarkItDownHelper,
  validateNoDanglingSymlinks,
  verifyMarkItDownSidecar,
  verifyPackagedOutput,
  _internals: {
    isMachO,
    normalizeTarget,
    walk
  }
}
