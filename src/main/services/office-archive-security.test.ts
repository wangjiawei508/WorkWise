import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { inspectOfficeArchive } from './office-archive-security'

describe('inspectOfficeArchive', () => {
  it('accepts a bounded OOXML-shaped archive', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('word/document.xml', '<w:document><w:body/></w:document>')
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(inspectOfficeArchive(buffer).entryCount).toBeGreaterThanOrEqual(2)
  })

  it('rejects path traversal before an Office parser sees the archive', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('../outside.xml', '<outside/>')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    expect(() => inspectOfficeArchive(buffer)).toThrow(/path traversal/)
  })

  it('rejects a declared decompression bomb without inflating it', async () => {
    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types/>')
    zip.file('word/document.xml', '<w:document/>')
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const name = Buffer.from('word/document.xml')
    const centralName = buffer.indexOf(name, buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])))
    expect(centralName).toBeGreaterThan(46)
    buffer.writeUInt32LE(300 * 1024 * 1024, centralName - 22)
    expect(() => inspectOfficeArchive(buffer)).toThrow(/256 MiB/)
  })
})
