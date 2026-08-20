import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assessDocumentQuality } from './document-engine-service'
import { analyzePdfDocument } from './pdf-document-service'

type QualityFixtureOracle = {
  cases: Array<{
    id: string
    file: string
    sha256: string
    parserMarkdown: string
    expectedAnalysis: {
      pageCount: number
      searchable: boolean
      textCharacters: number
      textSha256: string
      textIncludes: string[]
    }
    expectedQuality: {
      needsAccurateEngine: boolean
      reasons: string[]
    }
  }>
}

const fixtureRoot = new URL('../../../test/fixtures/document-quality/', import.meta.url)
const generateFixturesScript = fileURLToPath(
  new URL('../../../scripts/generate-document-quality-fixtures.mjs', import.meta.url)
)
const execFileAsync = promisify(execFile)
const oracle = JSON.parse(
  readFileSync(new URL('oracle.json', fixtureRoot), 'utf8')
) as QualityFixtureOracle

describe('document quality golden fixtures', () => {
  it('keeps committed PDFs byte-for-byte aligned with the deterministic generator', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [generateFixturesScript, '--check'])

    expect(stderr).toBe('')
    expect(stdout.trim()).toBe('Document quality fixtures are current.')
  })

  it.each(oracle.cases)('$id matches its PDF analysis and quality oracle', async (fixture) => {
    const path = fileURLToPath(new URL(fixture.file, fixtureRoot))
    const [source, analysis] = await Promise.all([
      readFile(path),
      analyzePdfDocument(path)
    ])
    const text = analysis.pages.map((page) => page.text).join('\n')
    const textCharacters = text.replace(/\s+/g, '').length

    expect(createHash('sha256').update(source).digest('hex')).toBe(fixture.sha256)
    expect(analysis).toMatchObject({
      pageCount: fixture.expectedAnalysis.pageCount,
      searchable: fixture.expectedAnalysis.searchable,
      truncated: false,
      warnings: []
    })
    expect(textCharacters).toBe(fixture.expectedAnalysis.textCharacters)
    expect(createHash('sha256').update(text).digest('hex')).toBe(fixture.expectedAnalysis.textSha256)
    for (const expectedText of fixture.expectedAnalysis.textIncludes) {
      expect(text).toContain(expectedText)
    }

    expect(assessDocumentQuality({
      extension: '.pdf',
      markdown: fixture.parserMarkdown,
      sourceBytes: source.byteLength,
      pageCount: analysis.pageCount,
      pageTextCharacters: textCharacters,
      warnings: analysis.warnings
    })).toEqual(fixture.expectedQuality)
  })
})
