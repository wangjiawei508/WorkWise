const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const MAX_EOCD_SEARCH = 65_557
const MAX_ARCHIVE_ENTRIES = 20_000
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 1_000

export type OfficeArchiveInspectionV1 = {
  entryCount: number
  compressedBytes: number
  uncompressedBytes: number
}

export function inspectOfficeArchive(buffer: Buffer): OfficeArchiveInspectionV1 {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw unsafeArchive('ZIP64 Office archives are not supported.')
  }
  if (entryCount === 0 || entryCount > MAX_ARCHIVE_ENTRIES) {
    throw resourceLimit(`Office archive entry count is outside the 1-${MAX_ARCHIVE_ENTRIES} limit.`)
  }
  if (centralOffset + centralSize > eocd || centralOffset < 0) {
    throw unsafeArchive('Office archive central directory is invalid.')
  }

  let offset = centralOffset
  let totalCompressed = 0
  let totalUncompressed = 0
  const normalizedNames = new Set<string>()
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw unsafeArchive('Office archive central directory is truncated.')
    }
    const flags = buffer.readUInt16LE(offset + 8)
    const compressedBytes = buffer.readUInt32LE(offset + 20)
    const uncompressedBytes = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const externalAttributes = buffer.readUInt32LE(offset + 38)
    const next = offset + 46 + fileNameLength + extraLength + commentLength
    if (fileNameLength === 0 || next > buffer.length || next > centralOffset + centralSize) {
      throw unsafeArchive('Office archive contains an invalid entry name.')
    }
    if ((flags & 0x1) !== 0) throw unsafeArchive('Encrypted Office archive entries are not allowed.')
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')
    const normalized = validateArchivePath(name)
    if (normalizedNames.has(normalized)) {
      throw unsafeArchive(`Office archive contains a colliding path: ${name}`)
    }
    normalizedNames.add(normalized)
    const unixMode = (externalAttributes >>> 16) & 0xffff
    if ((unixMode & 0o170000) === 0o120000) {
      throw unsafeArchive(`Office archive links are not allowed: ${name}`)
    }
    if (uncompressedBytes > MAX_ENTRY_BYTES) {
      throw resourceLimit(`Office archive entry exceeds 256 MiB: ${name}`)
    }
    if (uncompressedBytes > 0 && compressedBytes === 0 && !name.endsWith('/')) {
      throw resourceLimit(`Office archive entry has an unsafe compression ratio: ${name}`)
    }
    if (compressedBytes > 0 && uncompressedBytes / compressedBytes > MAX_COMPRESSION_RATIO) {
      throw resourceLimit(`Office archive entry has an unsafe compression ratio: ${name}`)
    }
    totalCompressed += compressedBytes
    totalUncompressed += uncompressedBytes
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw resourceLimit('Office archive expands beyond the 512 MiB safety limit.')
    }
    offset = next
  }
  if (offset !== centralOffset + centralSize) {
    throw unsafeArchive('Office archive central directory length does not match its entries.')
  }
  return { entryCount, compressedBytes: totalCompressed, uncompressedBytes: totalUncompressed }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - MAX_EOCD_SEARCH)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue
    const commentLength = buffer.readUInt16LE(offset + 20)
    if (offset + 22 + commentLength === buffer.length) return offset
  }
  throw unsafeArchive('Office file is not a valid OOXML archive.')
}

function validateArchivePath(name: string): string {
  if (name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw unsafeArchive(`Office archive contains an unsafe path: ${name}`)
  }
  const segments = name.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw unsafeArchive(`Office archive contains path traversal: ${name}`)
  }
  return segments.filter(Boolean).join('/').normalize('NFC').toLowerCase()
}

function unsafeArchive(message: string): Error {
  return Object.assign(new Error(message), { code: 'unsafe_file' })
}

function resourceLimit(message: string): Error {
  return Object.assign(new Error(message), { code: 'resource_limit' })
}
