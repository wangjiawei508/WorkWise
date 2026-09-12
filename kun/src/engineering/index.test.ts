import { describe, expect, it } from 'vitest'
import {
  P0_SURVEY_FORMAT_CATALOG,
  SURVEY_FORMAT_CATALOG_REGISTRY_VERSION,
  SurveyFormatRegistry,
  identifyCosaFileGroups,
  parseCosaIn2,
  writeCosaIn2,
  parseCosaNet,
  generateCosaNet,
  lexLeicaGsi,
  mapSurveyColumnRecords,
  createSurveyImportDiagnostic,
  toMetres
} from './index.js'

describe('engineering format-layer barrel exports', () => {
  it('exposes the P0 registry, catalogue, grouping, unit, and COSA parser APIs', () => {
    expect(typeof SurveyFormatRegistry).toBe('function')
    expect(P0_SURVEY_FORMAT_CATALOG.registryVersion).toBe(SURVEY_FORMAT_CATALOG_REGISTRY_VERSION)
    expect(typeof identifyCosaFileGroups).toBe('function')
    expect(toMetres(1000, 'mm')).toBe(1)
    expect(typeof parseCosaIn2).toBe('function')
    expect(typeof writeCosaIn2).toBe('function')
    expect(typeof parseCosaNet).toBe('function')
    expect(typeof generateCosaNet).toBe('function')
    expect(typeof lexLeicaGsi).toBe('function')
    expect(typeof mapSurveyColumnRecords).toBe('function')
    expect(typeof createSurveyImportDiagnostic).toBe('function')
  })
})
