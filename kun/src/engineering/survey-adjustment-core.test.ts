import { describe, expect, it } from 'vitest'
import { iterativeWeightedLeastSquares, solveWeightedLeastSquares, surveyMatrix, weightedLeastSquares } from './survey-adjustment-core.js'

describe('canonical survey adjustment core', () => {
  it('solves a redundant weighted system with covariance and diagnostics', () => {
    const solved = solveWeightedLeastSquares([
      { coefficients: [1, 0], misclosure: 1, weight: 4 },
      { coefficients: [0, 1], misclosure: 2, weight: 4 },
      { coefficients: [1, 1], misclosure: 3.06, weight: 1 }
    ])
    expect(solved.ok).toBe(true)
    if (!solved.ok) return
    expect(solved.result.corrections[0]).toBeCloseTo(1.01, 12)
    expect(solved.result.corrections[1]).toBeCloseTo(2.01, 12)
    expect(solved.result.dof).toBe(1)
    expect(solved.result.rank).toBe(2)
    expect(solved.result.conditionEstimate).toBeGreaterThanOrEqual(1)
    expect(solved.result.varianceFactorEstimated).toBe(true)
    expect(solved.result.covariance).toHaveLength(2)
  })

  it('retains a-priori unit variance when a network has no redundancy', () => {
    const solved = weightedLeastSquares([
      { coefficients: [1, 0], misclosure: 1, weight: 1_000_000 },
      { coefficients: [0, 1], misclosure: 2, weight: 1_000_000 }
    ])
    expect(solved?.dof).toBe(0)
    expect(solved?.varianceFactorEstimated).toBe(false)
    expect(solved?.varianceFactor).toBe(1)
    expect(solved?.unitWeightStdDev).toBe(1)
  })

  it('reports rank deficiency without producing coordinates', () => {
    const solved = solveWeightedLeastSquares([
      { coefficients: [1, 1], misclosure: 1, weight: 1 },
      { coefficients: [2, 2], misclosure: 2, weight: 1 }
    ])
    expect(solved).toMatchObject({ ok: false, reason: 'rank-deficient', rank: 1 })
    expect(surveyMatrix.invert([[1, 1], [2, 2]])).toMatchObject({ inverse: null, rank: 1 })
  })

  it('iterates nonlinear equations until the correction threshold is reached', () => {
    const solved = iterativeWeightedLeastSquares([1], ([value]) => [{ coefficients: [2 * value!], misclosure: 4 - value! ** 2, weight: 1 }], { convergence: 1e-10 })
    expect(solved?.converged).toBe(true)
    expect(solved?.parameters[0]).toBeCloseTo(2, 10)
    expect(solved?.iterations).toBeGreaterThan(1)
  })
})
