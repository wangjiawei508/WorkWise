import type { SurveyAdvancedTrialKindV1 } from '../contracts/survey-advanced-trials-workspace.js'

export function advancedTrialTestRequest(kind: SurveyAdvancedTrialKindV1, key = 'advanced-test-1') {
  const declaration = kind === 'huber' ? {
    schemaVersion: 1, model: 'fixed-linear-full-column-rank', independenceDeclaration: 'caller-declared-independent-observations',
    residualConvention: 'observed-minus-fitted', observationUnit: 'm', parameterIds: ['position'], parameterUnits: ['m'], initialParameters: [0],
    scale: { kind: 'fixed-external', value: 1, unit: 'm', basisStatement: 'Synthetic fixed external scale.' }, loss: { kind: 'huber', k: 1 },
    observations: [0, 0, 0, 10].map((value, i) => ({ id: `o${i}`, value, coefficients: [1], relativeSigma: 1, sourceAnchor: 'synthetic' })),
    stopping: { maxIterations: 200, standardizedPredictionStepTolerance: 1e-10, relativeObjectiveTolerance: 1e-10, normalizedScoreTolerance: 1e-10 }
  } : kind === 'statistical-family' ? {
    schemaVersion: 1, familyId: 'synthetic-family', declaration: 'caller-declared-before-observing-statistics',
    statisticPrecision: 'caller-declared-exact-scalar-inputs-no-upstream-error-propagation', correction: 'bonferroni', alpha: .05,
    members: ['a', 'b', 'c'].map(id => ({ id, sourceAnchor: 'synthetic', distribution: { kind: 'normal', tail: 'two-sided', statisticBasis: 'standardized-by-known-prior-scale', scaleBasis: 'caller-declared-known-prior-standard-deviation', priorStandardDeviation: 1, scaleUnit: 'm' } })),
    statistics: [{ memberId: 'a', status: 'available', value: 3 }, { memberId: 'c', status: 'undetectable', reason: 'synthetic-unresolved-direction' }]
  } : kind === 'vce' ? {
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

export function maximumNewAdvancedTrialRequest(kind: 'huber' | 'statistical-family', key = 'maximum-new-trial') {
  const request = advancedTrialTestRequest(kind, key)
  const model = JSON.parse(request.declarationJson)
  if (kind === 'huber') {
    const n = 128, p = 16
    model.parameterIds = Array.from({ length: p }, (_, j) => `x${j}`); model.parameterUnits = Array(p).fill('m'); model.initialParameters = Array(p).fill(0)
    model.observations = Array.from({ length: n }, (_, i) => ({ id: `o${i}`, value: Math.sin(i * 13.1) * 10 + (i % 7 === 0 ? 100 : 0),
      coefficients: Array.from({ length: p }, (_, j) => Math.cos(Math.PI * (i + .5) * j / n)), relativeSigma: 1, sourceAnchor: 'maximum-synthetic' }))
    model.loss.k = .01
    model.stopping = { maxIterations: 200, standardizedPredictionStepTolerance: 1e-12, relativeObjectiveTolerance: 1e-12, normalizedScoreTolerance: 1e-12 }
  } else {
    model.members = Array.from({ length: 256 }, (_, i) => ({ id: `m${i}`, sourceAnchor: 'maximum-synthetic', distribution: {
      kind: 'chi-square', tail: 'upper', statisticBasis: 'quadratic-form-divided-by-known-prior-variance', degreesOfFreedom: 745 + i,
      scaleBasis: 'caller-declared-known-prior-standard-deviation', priorStandardDeviation: 1, scaleUnit: 'm' } }))
    model.statistics = model.members.map((member: { id: string }, i: number) => ({ memberId: member.id, status: 'available', value: 745 + i }))
  }
  request.declarationJson = JSON.stringify(model)
  return request
}
