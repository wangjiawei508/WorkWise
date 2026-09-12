import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_OPEN_SURVEY_INPUT_FORMAT_IDS,
  MAPPING_REQUIRED_OPEN_SURVEY_INPUT_FORMAT_IDS,
  P0_SURVEY_FORMAT_CATALOG,
  P0_SURVEY_FORMAT_IDS,
  SURVEY_FORMAT_CATALOG_MAX_ENTRIES,
  SURVEY_FORMAT_CATALOG_REGISTRY_VERSION,
  SurveyFormatRegistryCatalog,
  catalogDispositionFor,
  findP0SurveyFormatEntry,
  isAcceptedOpenSurveyInputFormat,
  isMappingRequiredOpenSurveyInputFormat
} from './survey-format-catalog.js'

function testCatalogueEntry(overrides: Record<string, unknown> = {}) {
  return {
    registryVersion: 'test-survey-format-catalog-1',
    formatId: 'fixture-format',
    vendor: 'Fixture vendor',
    extensions: ['.fixture'],
    supportedVersions: ['1'],
    parserId: 'fixture-parser',
    parserVersion: '1.0.0',
    supportStatus: 'fixture-only',
    supportedDispositions: ['archive-only' as const],
    currentDisposition: 'archive-only' as const,
    currentDispositionReason: 'Fixture evidence only; not accepted for adjustment.',
    fixtureRefs: [{ path: 'fixtures/fixture.format', kind: 'golden', provenance: 'synthetic' }],
    ...overrides
  }
}

describe('versioned P0 survey format catalogue', () => {
  it('keeps one stable registry version on the catalogue and every entry', () => {
    expect(SURVEY_FORMAT_CATALOG_REGISTRY_VERSION).toBe('workwise-survey-format-catalog-1.7.0')
    expect(P0_SURVEY_FORMAT_CATALOG.registryVersion).toBe(SURVEY_FORMAT_CATALOG_REGISTRY_VERSION)
    expect(P0_SURVEY_FORMAT_CATALOG.entries).toHaveLength(9)
    expect(P0_SURVEY_FORMAT_CATALOG.entries.every((entry) => entry.registryVersion === SURVEY_FORMAT_CATALOG_REGISTRY_VERSION)).toBe(true)
    expect(Object.isFrozen(P0_SURVEY_FORMAT_CATALOG)).toBe(true)
    expect(Object.isFrozen(P0_SURVEY_FORMAT_CATALOG.entries)).toBe(true)
  })

  it('covers exactly the Stage-A P0 COSA, South DAT, Trimble M5, and Leica GSI scope', () => {
    expect(P0_SURVEY_FORMAT_CATALOG.entries.map((entry) => entry.formatId)).toEqual(P0_SURVEY_FORMAT_IDS)
    expect(P0_SURVEY_FORMAT_CATALOG.entries.map((entry) => entry.vendor)).toEqual([
      'COSA(科傻)',
      'COSA(科傻)',
      'COSA(科傻)',
      'COSA(科傻)',
      'COSA(科傻)',
      'SOUTH(南方)',
      'Trimble/Zeiss',
      'Leica/Hexagon',
      'Leica/Hexagon'
    ])
    for (const entry of P0_SURVEY_FORMAT_CATALOG.entries) {
      expect(entry.parserId).not.toMatch(/generic|fallback/i)
      expect(entry.parserVersion).toMatch(/^\d+\.\d+\.\d+$/)
      expect(entry.supportedDispositions).toContain(entry.currentDisposition)
      expect(entry.supportedDispositions).toContain('archive-only')
    }
  })

  it('keeps COSA .in2 fixture evidence and parser identity explicit for strategy-gated adjustment', () => {
    const in2 = findP0SurveyFormatEntry('cosa-in2')!
    expect(in2).toMatchObject({
      parserId: 'cosa-in2-parser',
      parserVersion: '0.3.0',
      supportStatus: 'parser-core-only',
      currentDisposition: 'adjustment-ready',
      supportedVersions: ['unversioned-text']
    })
    expect(in2.fixtureRefs).toHaveLength(8)
    expect(in2.fixtureRefs.filter((reference) => reference.kind === 'golden')).toHaveLength(3)
    expect(in2.fixtureRefs.filter((reference) => reference.kind === 'negative')).toHaveLength(5)
  })

  it('records COSA .NET as an isolated parser core whose runtime parser gate remains authoritative', () => {
    expect(findP0SurveyFormatEntry('cosa-net')).toMatchObject({
      parserId: 'cosa-net-parser',
      parserVersion: '0.1.0',
      supportStatus: 'parser-core-only',
      currentDisposition: 'archive-only'
    })
  })

  it('keeps strict COSA .in1 evidence separate from unmapped South DAT', () => {
    const in1 = findP0SurveyFormatEntry('cosa-in1')!
    expect(in1).toMatchObject({ supportStatus: 'requires-manual-mapping', parserId: 'cosa-in1-parser', parserVersion: '0.1.0', supportedVersions: [], currentDisposition: 'adjustment-ready' })
    expect(in1.fixtureRefs.filter((reference) => reference.kind === 'golden')).toHaveLength(3)
    expect(in1.fixtureRefs.filter((reference) => reference.kind === 'negative')).toHaveLength(3)

    const dat = findP0SurveyFormatEntry('south-dat')!
    expect(dat.supportStatus).toBe('requires-manual-mapping')
    expect(dat.supportedVersions).toEqual([])
    expect(dat.currentDisposition).toBe('archive-only')
    expect(dat.supportedDispositions).toEqual(['archive-only'])
    expect(dat.currentDispositionReason).toMatch(/mapping|column order|column layout/i)
  })

  it('records Trimble M5 aBFFB as a parser-core P0 format with explicit fixtures', () => {
    const m5 = findP0SurveyFormatEntry('trimble-m5')!
    expect(m5).toMatchObject({
      vendor: 'Trimble/Zeiss',
      parserId: 'trimble-m5-abffb-parser',
      parserVersion: '0.2.0',
      supportStatus: 'parser-core-only',
      currentDisposition: 'adjustment-ready',
      supportedVersions: ['aBFFB']
    })
    expect(m5.fixtureRefs.filter((reference) => reference.kind === 'golden')).toHaveLength(2)
    expect(m5.fixtureRefs.filter((reference) => reference.kind === 'negative')).toHaveLength(2)
  })

  it('uses archive-only for formats absent from the bounded catalogue', () => {
    expect(catalogDispositionFor('unknown-vendor-format')).toBe('archive-only')
  })

  it('keeps only the frozen WorkWise JSON contract automatically adjustment-ready', () => {
    expect(ACCEPTED_OPEN_SURVEY_INPUT_FORMAT_IDS).toEqual(['workwise-json'])
    for (const formatId of ACCEPTED_OPEN_SURVEY_INPUT_FORMAT_IDS) {
      expect(findP0SurveyFormatEntry(formatId)).toBeUndefined()
      expect(isAcceptedOpenSurveyInputFormat(formatId)).toBe(true)
    }
    expect(MAPPING_REQUIRED_OPEN_SURVEY_INPUT_FORMAT_IDS).toEqual(['delimited-text', 'xlsx'])
    for (const formatId of MAPPING_REQUIRED_OPEN_SURVEY_INPUT_FORMAT_IDS) {
      expect(findP0SurveyFormatEntry(formatId)).toBeUndefined()
      expect(isAcceptedOpenSurveyInputFormat(formatId)).toBe(false)
      expect(isMappingRequiredOpenSurveyInputFormat(formatId)).toBe(true)
    }
    expect(isAcceptedOpenSurveyInputFormat('landxml')).toBe(false)
    expect(isAcceptedOpenSurveyInputFormat('leica-hexml')).toBe(false)
  })

  it('registers a bounded immutable snapshot without retaining mutable caller state', () => {
    const entry = testCatalogueEntry()
    const catalogue = new SurveyFormatRegistryCatalog({
      registryVersion: entry.registryVersion,
      entries: [entry],
      capacity: 2
    })
    entry.vendor = 'Mutated caller value'
    entry.extensions[0] = '.changed'
    entry.fixtureRefs[0]!.path = 'fixtures/changed.format'

    const snapshot = catalogue.snapshot()
    expect(snapshot).toMatchObject({ registryVersion: 'test-survey-format-catalog-1' })
    expect(snapshot.entries).toEqual([expect.objectContaining({
      formatId: 'fixture-format',
      vendor: 'Fixture vendor',
      extensions: ['.fixture'],
      fixtureRefs: [{ path: 'fixtures/fixture.format', kind: 'golden', provenance: 'synthetic' }]
    })])
    expect(catalogue.find('fixture-format')).toBe(snapshot.entries[0])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.entries)).toBe(true)
    expect(Object.isFrozen(snapshot.entries[0]!)).toBe(true)
    expect(Object.isFrozen(snapshot.entries[0]!.extensions)).toBe(true)
    expect(Object.isFrozen(snapshot.entries[0]!.fixtureRefs[0]!)).toBe(true)

    catalogue.register(testCatalogueEntry({ formatId: 'second-format', extensions: ['.second'] }))
    expect(catalogue.size).toBe(2)
    expect(() => catalogue.register(testCatalogueEntry({ formatId: 'third-format', extensions: ['.third'] }))).toThrow(/capacity/i)
  })

  it('rejects duplicate identities, mismatched versions, incomplete metadata, and capacities above the global bound', () => {
    const entry = testCatalogueEntry()
    expect(() => new SurveyFormatRegistryCatalog({
      registryVersion: entry.registryVersion,
      entries: [entry, testCatalogueEntry({ extensions: ['.duplicate'] })]
    })).toThrow(/already contains formatId/i)

    expect(() => new SurveyFormatRegistryCatalog({
      registryVersion: entry.registryVersion,
      entries: [testCatalogueEntry({ registryVersion: 'another-registry' })]
    })).toThrow(/registryVersion/i)

    expect(() => new SurveyFormatRegistryCatalog({
      registryVersion: entry.registryVersion,
      entries: [testCatalogueEntry({ vendor: '' })]
    })).toThrow(/vendor/i)

    expect(() => new SurveyFormatRegistryCatalog({
      registryVersion: entry.registryVersion,
      entries: [],
      capacity: SURVEY_FORMAT_CATALOG_MAX_ENTRIES + 1
    })).toThrow(/cannot exceed/i)
  })
})
