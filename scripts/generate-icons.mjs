import { Resvg } from '@resvg/resvg-js'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Preserve the approved PNG artwork; only macOS outer padding is rasterized.
// Keep historical resource paths for installer and runtime compatibility.
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const iconDir = resolve(projectRoot, 'src/asset/img')
const sourceDir = resolve(iconDir, 'railwise-logo-pack-v1')
const macIconScale = 0.8

function renderPng(svg, size, scale = 1) {
  const inset = 1024 * (1 - scale) / 2
  const source = scale === 1 ? svg : `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(${inset} ${inset}) scale(${scale})">${svg.replace(/<\?xml[^>]*\?>/g, '')}</g></svg>`
  const rendered = new Resvg(source, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render()
  for (const fraction of [0.25, 0.5, 0.75]) {
    const alpha = rendered.pixels[(Math.floor(size / 2) * size + Math.floor(size * fraction)) * 4 + 3]
    if (alpha !== 255) throw new Error(`Unexpected clipping in ${size}px icon at ${fraction}`)
  }
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

async function suppliedPng(theme, size) {
  const png = await readFile(resolve(sourceDir, `RAILWISE_AI_app_${theme}_${size}.png`))
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || png[25] !== 6) {
    throw new Error(`Invalid supplied ${theme} ${size}px RGBA icon`)
  }
  return png
}

function embeddedSvg(png) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024"><title>RAILWISE AI</title><desc>Approved RAILWISE AI logo pack v1 artwork.</desc><image width="1024" height="1024" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>`
}

const lightPng = await suppliedPng('light', 1024)
const darkPng = await suppliedPng('dark', 1024)
const light = embeddedSvg(lightPng)
const dark = embeddedSvg(darkPng)
const outputs = {
  'workwise.svg': embeddedSvg(await suppliedPng('dark', 512)),
  'workwise.png': darkPng,
  'workwise-light.png': lightPng,
  'workwise-dark.png': darkPng,
  'workwise_tray.png': await suppliedPng('dark', 512),
  'workwise_dock.png': renderPng(light, 1024, macIconScale),
  'workwise_dock_dark.png': renderPng(dark, 1024, macIconScale),
  'workwise.ico': buildIco(await Promise.all([16, 24, 32, 48, 64, 128, 256].map((size) => suppliedPng('dark', size)))),
  'workwise.icns': buildIcns(light)
}
for (const [name, content] of Object.entries(outputs)) {
  await writeFile(resolve(iconDir, name), content)
  console.log(`Generated ${name}`)
}
