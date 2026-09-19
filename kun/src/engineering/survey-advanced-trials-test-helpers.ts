import type { SurveyAdvancedTrialKindV1 } from '../contracts/survey-advanced-trials-workspace.js'

export function advancedTrialTestRequest(kind: SurveyAdvancedTrialKindV1, key = 'advanced-test-1') {
  const declaration = kind === 'vce' ? {
    schemaVersion: 1, model: 'fixed-linear-independent-disjoint-variance-groups', unit: 'mm', parameterIds: ['height'],
    groups: [{ id: 'g0', initialVariance: 1, sourceAnchor: 'synthetic' }, { id: 'g1', initialVariance: 10, sourceAnchor: 'synthetic' }],
    observations: [1.6,.9,-.9,3.6].map((value, i) => ({ id: `o${i}`, value, coefficients: [1], groupId: i < 2 ? 'g0' : 'g1', relativeVariance: 1, sourceAnchor: 'synthetic' })),
    maxIterations: 100, relativeTolerance: 1e-10
  } : {
    schemaVersion: 1, model: 'fixed-linear-full-column-rank', purpose: 'declared-model-readonly-diagnostic', residualConvention: 'observed-minus-adjusted',
    observationUnit: 'm', observationIds: ['a','b','c'], parameterIds: ['height'], parameterUnits: ['m'], designMatrix: [[1],[1],[1]], observations: [1,2,3],
    covariance: { kind: 'known-apriori-absolute-observation-covariance', basisStatement: 'Synthetic absolute C, not relative-weight conversion.', matrix: [[1,0,0],[0,2,0],[0,0,3]] },
    family: { id: 'declared-family', alpha: .05, tail: 'two-sided', declaration: 'caller-declared-before-evaluation' },
    biasDirections: [{ id: 'first-observation', coefficients: [1,0,0] }]
  }
  return { kind, acknowledged: true as const, expectedProjectRevision: 1, idempotencyKey: key,
    declarationJson: JSON.stringify(declaration, null, 2), modelBasisStatement: '模拟数据，独立声明完整模型。\n非正式成果、非专业签认。' }
}
