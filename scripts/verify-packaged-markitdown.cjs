const { existsSync, readdirSync, statSync } = require('node:fs')
const { basename, dirname, join, resolve } = require('node:path')

const root = resolve(process.argv[2] || 'dist')
const target = process.argv[3]
const expectedOverride = process.argv[4]
if (!existsSync(root)) throw new Error(`Packaged output does not exist: ${root}`)
if (target !== 'mac' && target !== 'win') {
  throw new Error('usage: verify-packaged-markitdown.cjs DIST_DIR mac|win [EXPECTED_HELPERS]')
}

const executable = target === 'win' ? 'workwise-markitdown.exe' : 'workwise-markitdown'
const matches = []
walk(root, (path) => {
  if (basename(path) !== executable) return
  if (!path.replaceAll('\\', '/').includes('/app.asar.unpacked/sidecars/markitdown/')) return
  const sidecarRoot = dirname(path)
  for (const required of ['requirements.lock', 'README.md', 'THIRD_PARTY_NOTICES.md']) {
    if (!existsSync(join(sidecarRoot, required))) throw new Error(`Packaged MarkItDown notice is missing: ${join(sidecarRoot, required)}`)
  }
  const magikaModel = join(sidecarRoot, '_internal', 'magika', 'models', 'standard_v3_3', 'model.onnx')
  if (!existsSync(magikaModel) || statSync(magikaModel).size === 0) {
    throw new Error(`Packaged MarkItDown Magika model is missing: ${magikaModel}`)
  }
  for (const script of ['svg_to_pptx.py', 'pptx_to_svg.py', 'preset_shape_svg.py']) {
    const scriptPath = join(sidecarRoot, '_internal', 'ppt-master', 'scripts', script)
    if (!existsSync(scriptPath) || statSync(scriptPath).size === 0) {
      throw new Error(`Packaged PPT Master runtime script is missing: ${scriptPath}`)
    }
  }
  matches.push(path)
})

const expected = expectedOverride === undefined ? (target === 'mac' ? 2 : 1) : Number(expectedOverride)
if (!Number.isSafeInteger(expected) || expected < 1) {
  throw new Error(`EXPECTED_HELPERS must be a positive integer, received: ${expectedOverride}`)
}
if (matches.length !== expected) {
  throw new Error(`Expected ${expected} packaged MarkItDown helper(s) for ${target}, found ${matches.length}: ${matches.join(', ')}`)
}
console.log(`Verified ${matches.length} packaged MarkItDown helper(s):\n${matches.join('\n')}`)

function walk(directory, visit) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const info = statSync(path)
    if (info.isDirectory()) walk(path, visit)
    else if (info.isFile()) visit(path)
  }
}
