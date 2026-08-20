import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = join(repositoryRoot, 'test', 'fixtures', 'document-quality')

function pdfStream(contents, dictionary = '') {
  const length = Buffer.byteLength(contents, 'latin1')
  return `<< ${dictionary} /Length ${length} >>\nstream\n${contents}\nendstream`
}

function buildPdf(objects) {
  let body = '%PDF-1.4\n%WorkWise synthetic fixture\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

function drawRectangle(pixels, width, x, y, rectangleWidth, rectangleHeight, shade) {
  for (let row = y; row < y + rectangleHeight; row += 1) {
    for (let column = x; column < x + rectangleWidth; column += 1) {
      pixels[row * width + column] = shade
    }
  }
}

function simulatedScanImage() {
  const width = 64
  const height = 80
  const pixels = new Uint8Array(width * height).fill(248)
  drawRectangle(pixels, width, 10, 8, 44, 4, 55)
  ;[18, 23, 28, 33].forEach((row, index) => {
    drawRectangle(pixels, width, 8, row, 46 - index * 4, 2, 90 + index * 12)
  })
  drawRectangle(pixels, width, 8, 42, 48, 1, 80)
  drawRectangle(pixels, width, 8, 55, 48, 1, 80)
  ;[8, 24, 40, 56].forEach((column) => drawRectangle(pixels, width, column, 42, 1, 14, 80))
  ;[46, 50].forEach((row) => drawRectangle(pixels, width, 11, row, 40, 1, 125))
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if ((row * 67 + column * 31) % 521 === 0) pixels[row * width + column] = 205
    }
  }
  return { width, height, encoded: `${Buffer.from(pixels).toString('hex').toUpperCase()}>` }
}

function imageOnlyScanPdf() {
  const image = simulatedScanImage()
  const pageContents = 'q\n450 0 0 560 81 116 cm\n/Im1 Do\nQ'
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    pdfStream(pageContents),
    pdfStream(image.encoded, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode`)
  ])
}

function escapePdfText(value) {
  return value.replace(/[()\\]/g, '\\$&')
}

function positionedText(size, x, y, value) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`
}

function complexLayoutPdf() {
  const commands = [
    positionedText(18, 54, 748, 'Complex Layout Fixture'),
    positionedText(10, 54, 724, 'Synthetic two-column technical report with table and formula regions.'),
    positionedText(12, 54, 690, 'Left column'),
    positionedText(12, 318, 690, 'Right column')
  ]
  for (let index = 0; index < 7; index += 1) {
    commands.push(positionedText(9, 54, 670 - index * 18, `Left column line ${index + 1}: monitoring baseline and observation data.`))
    commands.push(positionedText(9, 318, 670 - index * 18, `Right column line ${index + 1}: threshold review and engineering notes.`))
  }
  commands.push(positionedText(12, 54, 510, 'Formula region'))
  commands.push(positionedText(10, 54, 490, 'Integral 0..1 of x squared equals one third.'))
  commands.push(positionedText(10, 54, 472, 'Sum i=1..n of x_i and square root of x squared plus y squared.'))
  commands.push(positionedText(12, 54, 430, 'Table region'))
  commands.push('0.6 w 54 300 m 558 300 l 558 410 l 54 410 l h S')
  ;[340, 375].forEach((y) => commands.push(`54 ${y} m 558 ${y} l S`))
  ;[220, 390].forEach((x) => commands.push(`${x} 300 m ${x} 410 l S`))
  commands.push(positionedText(10, 66, 390, 'Item'))
  commands.push(positionedText(10, 232, 390, 'Value'))
  commands.push(positionedText(10, 402, 390, 'Status'))
  commands.push(positionedText(10, 66, 355, 'Table row A'))
  commands.push(positionedText(10, 232, 355, '100'))
  commands.push(positionedText(10, 402, 355, 'Verified'))
  commands.push(positionedText(10, 66, 320, 'Table row B'))
  commands.push(positionedText(10, 232, 320, '200'))
  commands.push(positionedText(10, 402, 320, 'Review'))
  commands.push(positionedText(9, 54, 270, 'All content is deterministic and contains no customer or third-party data.'))
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    pdfStream(commands.join('\n')),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ])
}

const fixtures = [
  ['synthetic-image-only-scan.pdf', imageOnlyScanPdf()],
  ['synthetic-complex-layout.pdf', complexLayoutPdf()]
]

if (process.argv.includes('--check')) {
  const stale = []
  for (const [name, expected] of fixtures) {
    try {
      const actual = await readFile(join(outputDirectory, name))
      if (!actual.equals(expected)) stale.push(name)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') stale.push(name)
      else throw error
    }
  }
  if (stale.length > 0) {
    throw new Error(`Document quality fixtures are stale: ${stale.join(', ')}. Regenerate them without --check.`)
  }
  process.stdout.write('Document quality fixtures are current.\n')
} else {
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all(fixtures.map(([name, contents]) => (
    writeFile(join(outputDirectory, name), contents)
  )))
}
