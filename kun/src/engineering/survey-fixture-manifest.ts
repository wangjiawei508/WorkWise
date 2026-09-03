export type SurveyFixtureEvidence = {
  strategyId: string
  goldenCaseId: string
  negativeCaseId: string
  testFile: string
  referenceId: string
}

/**
 * Acceptance matrix for every deterministic survey strategy exposed by the
 * Runtime. The case IDs are deliberately stable: the companion audit test
 * verifies that both the executable test and the independent reference
 * calculation continue to exist before a strategy can be treated as covered.
 */
export const SURVEY_FIXTURE_EVIDENCE = [
  { strategyId: 'leveling', goldenCaseId: 'SURVEY-GOLDEN-LEVELING-001', negativeCaseId: 'SURVEY-NEG-LEVELING-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-LEVELING-001' },
  { strategyId: 'height-control', goldenCaseId: 'SURVEY-GOLDEN-HEIGHT-CONTROL-001', negativeCaseId: 'SURVEY-NEG-HEIGHT-CONTROL-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-HEIGHT-CONTROL-001' },
  { strategyId: 'traverse', goldenCaseId: 'SURVEY-GOLDEN-TRAVERSE-001', negativeCaseId: 'SURVEY-NEG-TRAVERSE-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-TRAVERSE-001' },
  { strategyId: 'plane-control', goldenCaseId: 'SURVEY-GOLDEN-PLANE-CONTROL-001', negativeCaseId: 'SURVEY-NEG-PLANE-CONTROL-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-PLANE-CONTROL-001' },
  { strategyId: 'triangulation', goldenCaseId: 'SURVEY-GOLDEN-TRIANGULATION-001', negativeCaseId: 'SURVEY-NEG-TRIANGULATION-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-TRIANGULATION-001' },
  { strategyId: 'cpiii-free-station', goldenCaseId: 'SURVEY-GOLDEN-CPIII-FREE-STATION-001', negativeCaseId: 'SURVEY-NEG-CPIII-FREE-STATION-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-CPIII-FREE-STATION-001' },
  { strategyId: 'cpiii-resection', goldenCaseId: 'SURVEY-GOLDEN-CPIII-RESECTION-001', negativeCaseId: 'SURVEY-NEG-CPIII-RESECTION-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-CPIII-RESECTION-001' },
  { strategyId: 'gnss', goldenCaseId: 'SURVEY-GOLDEN-GNSS-001', negativeCaseId: 'SURVEY-NEG-GNSS-001', testFile: 'survey-golden.test.ts', referenceId: 'REF-GNSS-001' },
  { strategyId: 'similarity-2d', goldenCaseId: 'SURVEY-GOLDEN-SIMILARITY-2D-001', negativeCaseId: 'SURVEY-NEG-SIMILARITY-2D-001', testFile: 'survey-coordinate-transform.test.ts', referenceId: 'REF-SIMILARITY-2D-001' },
  { strategyId: 'helmert-7', goldenCaseId: 'SURVEY-GOLDEN-HELMERT-7-001', negativeCaseId: 'SURVEY-NEG-HELMERT-7-001', testFile: 'survey-coordinate-transform.test.ts', referenceId: 'REF-HELMERT-7-001' },
  { strategyId: 'gauss-kruger-forward', goldenCaseId: 'SURVEY-GOLDEN-GAUSS-FORWARD-001', negativeCaseId: 'SURVEY-NEG-GAUSS-FORWARD-001', testFile: 'survey-coordinate-transform.test.ts', referenceId: 'REF-GAUSS-FORWARD-001' },
  { strategyId: 'gauss-kruger-inverse', goldenCaseId: 'SURVEY-GOLDEN-GAUSS-INVERSE-001', negativeCaseId: 'SURVEY-NEG-GAUSS-INVERSE-001', testFile: 'survey-coordinate-transform.test.ts', referenceId: 'REF-GAUSS-INVERSE-001' },
  { strategyId: 'height-fit', goldenCaseId: 'SURVEY-GOLDEN-HEIGHT-FIT-001', negativeCaseId: 'SURVEY-NEG-HEIGHT-FIT-001', testFile: 'survey-coordinate-transform.test.ts', referenceId: 'REF-HEIGHT-FIT-001' },
  { strategyId: 'deformation-epoch-comparison', goldenCaseId: 'SURVEY-GOLDEN-DEFORMATION-001', negativeCaseId: 'SURVEY-NEG-DEFORMATION-001', testFile: 'survey-deformation.test.ts', referenceId: 'REF-DEFORMATION-001' }
] as const satisfies readonly SurveyFixtureEvidence[]
