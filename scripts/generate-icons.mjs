import { Resvg } from '@resvg/resvg-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pure SVG rasterization: no application launch, hidden browser or screenshot.
// Keep the WorkWise resource paths for installer and runtime compatibility.
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const iconDir = resolve(projectRoot, 'src/asset/img')
const sourcePath = resolve(process.argv[2] || resolve(iconDir, 'workwise.svg'))
const macIconScale = 0.8

function renderPng(svg, size, scale = 1) {
  const inset = 1024 * (1 - scale) / 2
  const source = scale === 1 ? svg : `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(${inset} ${inset}) scale(${scale})">${svg.replace(/<\?xml[^>]*\?>/g, '')}</g></svg>`
  const rendered = new Resvg(source, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render()
  const png = Buffer.from(rendered.asPng())
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || png[25] !== 6) {
    throw new Error(`Invalid ${size}px RGBA icon`)
  }
  return png
}

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const directory = Buffer.alloc(entries.length * 16)
  let position = header.length + directory.length
  entries.forEach((png, index) => {
    const size = png.readUInt32BE(16)
    const offset = index * 16
    directory.writeUInt8(size === 256 ? 0 : size, offset)
    directory.writeUInt8(size === 256 ? 0 : size, offset + 1)
    directory.writeUInt16LE(1, offset + 4)
    directory.writeUInt16LE(32, offset + 6)
    directory.writeUInt32LE(png.length, offset + 8)
    directory.writeUInt32LE(position, offset + 12)
    position += png.length
  })
  return Buffer.concat([header, directory, ...entries])
}

function buildIcns(svg) {
  // PNG-compatible ICNS element types, including Retina variants.
  const sizes = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024, ic11: 32, ic12: 64, ic13: 256, ic14: 512 }
  const body = Buffer.concat(Object.entries(sizes).map(([type, size]) => {
    const png = renderPng(svg, size, macIconScale)
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([header, png])
  }))
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

const svg = await readFile(sourcePath, 'utf8')
await mkdir(iconDir, { recursive: true })
const outputs = {
  'workwise.svg': svg,
  'workwise.png': renderPng(svg, 1024),
  'workwise_tray.png': renderPng(svg, 512),
  'workwise_dock.png': renderPng(svg, 1024, macIconScale),
  'workwise.ico': buildIco([16, 24, 32, 48, 64, 128, 256].map((size) => renderPng(svg, size))),
  'workwise.icns': buildIcns(svg)
}
for (const [name, content] of Object.entries(outputs)) {
  await writeFile(resolve(iconDir, name), content)
  console.log(`Generated ${name}`)
}
