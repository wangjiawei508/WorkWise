import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
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

function assertPngHasAlpha(buffer, label) {
  const colorType = buffer.readUInt8(25)
  if (colorType !== 6) {
    throw new Error(`${label} must keep transparency; expected PNG color type 6, got ${colorType}.`)
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

function buildIcns(entries) {
  const body = Buffer.concat(
    entries.map(({ type, data }) => {
      const entryHeader = Buffer.alloc(8)
      entryHeader.write(type, 0, 4, 'ascii')
      entryHeader.writeUInt32BE(data.length + 8, 4)
      return Buffer.concat([entryHeader, data])
    })
  )
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

async function renderPng(svgText, size) {
  const window = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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
    const png = image.resize({ width: size, height: size, quality: 'best' }).toPNG()
    assertPngHasAlpha(png, `${size}x${size} icon`)
    return png
  } finally {
    window.destroy()
  }
}

async function generateIcns(svgText) {
  const icnsPath = resolve(iconDir, 'workwise.icns')

  // Standard macOS icon sizes
  const icnsSizes = [
    { type: 'ic04', size: 16 },
    { type: 'ic05', size: 32 },
    { type: 'ic07', size: 128 },
    { type: 'ic08', size: 256 },
    { type: 'ic09', size: 512 },
    { type: 'ic10', size: 1024 },
    { type: 'ic11', size: 32 },
    { type: 'ic12', size: 64 },
    { type: 'ic13', size: 512 },
    { type: 'ic14', size: 1024 }
  ]

  // Try using iconutil first (macOS native, produces best results)
  const iconsetDir = resolve(iconDir, 'workwise.iconset')
  await mkdir(iconsetDir, { recursive: true })

  for (const { type, size } of icnsSizes) {
    const png = await renderPng(svgText, size)
    // iconutil uses Apple's naming convention
    let filename
    if (type === 'ic04') filename = 'icon_16x16.png'
    else if (type === 'ic05') filename = 'icon_32x32.png'
    else if (type === 'ic07') filename = 'icon_128x128.png'
    else if (type === 'ic08') filename = 'icon_256x256.png'
    else if (type === 'ic09') filename = 'icon_512x512.png'
    else if (type === 'ic10') filename = 'icon_512x512@2x.png'
    else if (type === 'ic11') filename = 'icon_16x16@2x.png'
    else if (type === 'ic12') filename = 'icon_32x32@2x.png'
    else if (type === 'ic13') filename = 'icon_256x256@2x.png'
    else if (type === 'ic14') filename = 'icon_512x512@2x.png'
    await writeFile(resolve(iconsetDir, filename), png)
  }

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' })
    console.log(`Generated ${icnsPath}`)
  } catch {
    // Fallback: build icns manually (works on non-macOS or older iconutil)
    console.warn('[generate-icons] iconutil failed, building icns manually')
    const icnsEntries = []
    for (const { type, size } of icnsSizes) {
      const png = await renderPng(svgText, size)
      icnsEntries.push({ type, data: png })
    }
    await writeFile(icnsPath, buildIcns(icnsEntries))
    console.log(`Generated ${icnsPath} (manual)`)
  }

  // Clean up iconset directory
  await rm(iconsetDir, { recursive: true, force: true }).catch(() => {})
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

  await generateIcns(svgText)

  app.quit()
}

main().catch((error) => {
  console.error(`Failed to generate icons from ${basename(sourcePath)}:`)
  console.error(error)
  app.exit(1)
})
