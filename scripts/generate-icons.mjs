import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const defaultSource = resolve(projectRoot, 'src/asset/img/workgpt.svg')
const sourcePath = resolve(process.argv[2] || defaultSource)
const iconDir = resolve(projectRoot, 'src/asset/img')

const pngTargets = [
  { size: 1024, path: resolve(iconDir, 'workgpt.png') },
  { size: 512, path: resolve(iconDir, 'workgpt_tray.png') }
]
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoPath = resolve(iconDir, 'workgpt.ico')

app.on('window-all-closed', () => {
  // Keep this utility alive while it renders several hidden windows in sequence.
})

function extractPngDimensions(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Expected PNG data from Electron capture.')
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(entries.length * 16)
  let imageOffset = header.length + directory.length
  entries.forEach((entry, index) => {
    const { width, height } = extractPngDimensions(entry)
    const offset = index * 16
    directory.writeUInt8(width >= 256 ? 0 : width, offset)
    directory.writeUInt8(height >= 256 ? 0 : height, offset + 1)
    directory.writeUInt8(0, offset + 2)
    directory.writeUInt8(0, offset + 3)
    directory.writeUInt16LE(1, offset + 4)
    directory.writeUInt16LE(32, offset + 6)
    directory.writeUInt32LE(entry.length, offset + 8)
    directory.writeUInt32LE(imageOffset, offset + 12)
    imageOffset += entry.length
  })

  return Buffer.concat([header, directory, ...entries])
}

async function renderPng(svgText, size) {
  const window = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      sandbox: true
    }
  })

  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<style>',
    'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;}',
    'svg{display:block;width:100vw;height:100vh;}',
    '</style>',
    '</head>',
    '<body>',
    svgText,
    '</body>',
    '</html>'
  ].join('')

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const image = await window.webContents.capturePage()
    return image.resize({ width: size, height: size, quality: 'best' }).toPNG()
  } finally {
    window.destroy()
  }
}

async function main() {
  await app.whenReady()
  await mkdir(iconDir, { recursive: true })

  const svgText = await readFile(sourcePath, 'utf8')
  await writeFile(resolve(iconDir, 'workgpt.svg'), svgText, 'utf8')

  for (const target of pngTargets) {
    const png = await renderPng(svgText, target.size)
    await writeFile(target.path, png)
    console.log(`Generated ${target.path}`)
  }

  const icoEntries = []
  for (const size of icoSizes) {
    icoEntries.push(await renderPng(svgText, size))
  }
  await writeFile(icoPath, buildIco(icoEntries))
  console.log(`Generated ${icoPath}`)

  app.quit()
}

main().catch((error) => {
  console.error(`Failed to generate icons from ${basename(sourcePath)}:`)
  console.error(error)
  app.exit(1)
})
