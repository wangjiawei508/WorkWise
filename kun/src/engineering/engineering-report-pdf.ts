import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'
import PDFDocument from 'pdfkit'

const fontUrl = new URL('../../assets/fonts/NotoSansSC.ttf', import.meta.url)
let fontBytes: Promise<Buffer> | undefined

/** Offline Unicode layout with a bundled OFL font; never truncate report facts. */
export async function makeReportPdf(text: string): Promise<Buffer> {
  if (text.length > 2_000_000) throw new Error('report exceeds the PDF layout limit; split the selected results into separate reports')
  fontBytes ??= readFile(fontUrl).then((bytes) => {
    if (createHash('sha256').update(bytes).digest('hex') !== 'a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da') {
      throw new Error('bundled report font integrity check failed; reinstall the verified application package')
    }
    return bytes
  }).catch((error) => { fontBytes = undefined; throw error })
  const font = await fontBytes
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: 'WorkWise Survey - Review Draft', Creator: 'WorkWise' } })
    const chunks: Buffer[] = []
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(Buffer.concat(chunks)))
    try {
      document.font(font).fontSize(10.5).fillColor('#222222')
      for (const line of text.split('\n')) {
        if (!line) { document.moveDown(0.5); continue }
        document.text(line, { width: document.page.width - 100, lineGap: 3, paragraphGap: 5 })
      }
      const pages = document.bufferedPageRange()
      for (let index = pages.start; index < pages.start + pages.count; index += 1) {
        document.switchToPage(index)
        document.fontSize(8).fillColor('#555555').text(`${index + 1} / ${pages.count}`, 50, document.page.height - 32, { lineBreak: false })
      }
      document.end()
    } catch (error) {
      ;(document as unknown as Readable).destroy()
      reject(error)
    }
  })
}
