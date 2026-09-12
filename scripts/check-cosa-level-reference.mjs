import { open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { parseCosaIn1 } from '../kun/dist/engineering/survey-cosa-in1.js'
import { parseCosaOu1Heights, compareCosaLevelHeights, parseCosaOu1SourceEvidence, compareCosaLevelSourceEvidence } from '../kun/dist/engineering/survey-cosa-ou1.js'

const { values } = parseArgs({ options: { input: { type: 'string' }, reference: { type: 'string' }, mapping: { type: 'string' }, 'reference-encoding': { type: 'string' } }, strict: true })
if (!values.input || !values.reference || !values.mapping || !['utf-8', 'gb18030'].includes(values['reference-encoding'])) {
  throw new Error('Required: --input PATH --reference PATH --mapping PATH --reference-encoding utf-8|gb18030. Reads only; run npm --prefix kun run build first.')
}
async function boundedRead(path, limit) {
  const handle = await open(path, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > limit) throw new Error('Input must be a bounded regular file')
    const bytes = Buffer.alloc(limit + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > limit) throw new Error('Input exceeded size limit during read')
    return bytes.subarray(0, offset)
  } finally {
    await handle.close()
  }
}
const input = await boundedRead(values.input, 8 * 1024 * 1024)
const reference = await boundedRead(values.reference, 8 * 1024 * 1024)
const mappingBytes = await boundedRead(values.mapping, 16_384)
const mapping = JSON.parse(mappingBytes.toString('utf8'))
const parsed = parseCosaIn1(input, mapping)
const referenceText = new TextDecoder(values['reference-encoding'], { fatal: true }).decode(reference)
const heights = parseCosaOu1Heights(referenceText)
const sourceEvidence = parseCosaOu1SourceEvidence(referenceText)
const sourceComparison = compareCosaLevelSourceEvidence(parsed, sourceEvidence)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const comparison = compareCosaLevelHeights(parsed, heights)
const status = sourceComparison.status === 'matched' && comparison.status === 'matched' ? 'matched' : 'blocked'
console.log(JSON.stringify({
  schemaVersion: 1, scope: 'read-only-reference-comparison-not-product-acceptance', status,
  input: { bytes: input.length, sha256: hash(input) }, reference: { bytes: reference.length, sha256: hash(reference), encoding: values['reference-encoding'] },
  mappingSha256: hash(mappingBytes), inputState: parsed.state, referenceState: heights.state,
  inputDiagnosticCodes: parsed.diagnostics.map((item) => item.code), referenceDiagnostic: heights.reason, sourceEvidenceDiagnostic: sourceEvidence.reason,
  tolerance: 'half of each OU1 printed field resolution + 1e-9 in its declared unit', sourceComparison, comparison
}, null, 2))
process.exitCode = status === 'matched' ? 0 : 1
