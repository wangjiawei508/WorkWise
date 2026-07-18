import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { posix } from 'node:path'
import JSZip from 'jszip'

const MAX_ARTIFACT_BYTES = 200 * 1024 * 1024
const MAX_ZIP_ENTRIES = 20_000

export type ArtifactValidationResult = {
  valid: boolean
  format: string
  sizeBytes: number
  sha256: string
  evidence: string[]
  message?: string
}

function invalid(
  format: string,
  sizeBytes: number,
  sha256: string,
  message: string,
  evidence: string[] = []
): ArtifactValidationResult {
  return { valid: false, format, sizeBytes, sha256, message, evidence }
}

function relationshipBase(path: string): string {
  const marker = '/_rels/'
  const index = path.indexOf(marker)
  if (index >= 0) return path.slice(0, index)
  return path.startsWith('_rels/') ? '' : posix.dirname(path)
}

function attribute(value: string, name: string): string | undefined {
  return new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(value)?.[1]
}

async function validateRelationships(zip: JSZip): Promise<string | undefined> {
  const relationshipFiles = Object.keys(zip.files).filter((name) => name.endsWith('.rels'))
  for (const relationshipPath of relationshipFiles) {
    const xml = await zip.file(relationshipPath)?.async('string')
    if (!xml) continue
    for (const tag of xml.match(/<Relationship\b[^>]*>/gi) ?? []) {
      if (attribute(tag, 'TargetMode')?.toLowerCase() === 'external') continue
      const rawTarget = attribute(tag, 'Target')
      if (!rawTarget) continue
      let decoded = rawTarget
      try {
        decoded = decodeURIComponent(rawTarget)
      } catch {
        return `Invalid relationship target encoding in ${relationshipPath}.`
      }
      const target = posix.normalize(posix.join(relationshipBase(relationshipPath), decoded))
      if (target.startsWith('../') || target.startsWith('/') || !zip.file(target)) {
        return `Broken or unsafe OOXML relationship: ${relationshipPath} -> ${rawTarget}.`
      }
    }
  }
  return undefined
}

async function validateOoxml(
  bytes: Buffer,
  format: 'pptx' | 'docx' | 'xlsx',
  sizeBytes: number,
  sha256: string
): Promise<ArtifactValidationResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes, { createFolders: false, checkCRC32: true })
  } catch (error) {
    return invalid(
      format,
      sizeBytes,
      sha256,
      `Invalid OOXML archive: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const names = Object.keys(zip.files)
  if (names.length > MAX_ZIP_ENTRIES) {
    return invalid(format, sizeBytes, sha256, `OOXML archive contains too many entries (${names.length}).`)
  }
  const required = format === 'pptx'
    ? ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']
    : format === 'docx'
      ? ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']
      : ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels']
  const missing = required.filter((name) => !zip.file(name))
  if (missing.length > 0) {
    return invalid(format, sizeBytes, sha256, `Missing required OOXML parts: ${missing.join(', ')}.`)
  }

  const relationshipError = await validateRelationships(zip)
  if (relationshipError) return invalid(format, sizeBytes, sha256, relationshipError)

  const evidence = [`OOXML archive opened (${names.length} entries)`, 'Required package relationships are valid']
  if (format === 'pptx') {
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    if (slides.length === 0) return invalid(format, sizeBytes, sha256, 'PowerPoint contains no slides.')
    evidence.push(`${slides.length} slide(s) verified`)
  } else if (format === 'docx') {
    const documentXml = await zip.file('word/document.xml')!.async('string')
    if (!/<w:body\b/i.test(documentXml)) {
      return invalid(format, sizeBytes, sha256, 'Word document body is missing.')
    }
    evidence.push('Word document body verified')
  } else {
    const sheets = names.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    if (sheets.length === 0) return invalid(format, sizeBytes, sha256, 'Excel workbook contains no worksheets.')
    evidence.push(`${sheets.length} worksheet(s) verified`)
  }
  return { valid: true, format, sizeBytes, sha256, evidence }
}

export async function validateArtifactFile(
  path: string,
  requestedFormat?: string
): Promise<ArtifactValidationResult> {
  const info = await stat(path)
  const format = (requestedFormat ?? path.split('.').at(-1) ?? '').toLowerCase()
  if (!info.isFile()) return invalid(format, info.size, '', 'Artifact is not a regular file.')
  if (info.size > MAX_ARTIFACT_BYTES) {
    return invalid(format, info.size, '', `Artifact exceeds ${MAX_ARTIFACT_BYTES} bytes.`)
  }
  const bytes = await readFile(path)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (format === 'pptx' || format === 'docx' || format === 'xlsx') {
    return validateOoxml(bytes, format, info.size, sha256)
  }
  if (format === 'pdf') {
    const header = bytes.subarray(0, 8).toString('latin1')
    const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString('latin1')
    if (!header.startsWith('%PDF-') || !tail.includes('%%EOF')) {
      return invalid(format, info.size, sha256, 'PDF signature or end marker is invalid.')
    }
    return {
      valid: true,
      format,
      sizeBytes: info.size,
      sha256,
      evidence: ['PDF signature and end marker verified']
    }
  }
  return {
    valid: true,
    format,
    sizeBytes: info.size,
    sha256,
    evidence: ['Regular workspace file verified']
  }
}
