import { describe, expect, it } from 'vitest'
import { choleskyDecompose, iterativeWeightedLeastSquares, solveWeightedLeastSquares, surveyMatrix, weightedLeastSquares, whitenCorrelatedEquations } from './survey-adjustment-core.js'

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

  it('backtracks an out-of-domain first nonlinear correction deterministically', () => {
    const solved = iterativeWeightedLeastSquares([0.1], ([value]) => [{ coefficients: [2 * value!], misclosure: 4 - value! ** 2, weight: 1 }], { convergence: 1e-10 })
    expect(solved).toMatchObject({ converged: true })
    expect(solved?.parameters[0]).toBeCloseTo(2, 10)
    expect(solved?.iterations).toBeGreaterThan(1)
  })

  it('whitens a correlated covariance block before solving', () => {
    const covariance = [[4, 1, 0.5], [1, 3, 0.25], [0.5, 0.25, 2]]
    expect(choleskyDecompose(covariance)).not.toBeNull()
    const rows = whitenCorrelatedEquations({ coefficients: [[1], [1], [1]], misclosures: [1, 2, 3], covariance })
    expect(rows).not.toBeNull()
    const solved = rows ? weightedLeastSquares(rows) : null
    // Reference GLS solution: (1' C^-1 l) / (1' C^-1 1).
    expect(solved?.corrections[0]).toBeCloseTo(2.369175627240143, 12)
    expect(choleskyDecompose([[1, 2], [2, 1]])).toBeNull()
    expect(whitenCorrelatedEquations({ coefficients: [[1], [1]], misclosures: [1, 2], covariance: [[1, 2], [2, 1]] })).toBeNull()
  })

  it('does not report a tiny backtracked step as convergence', () => {
    const solved = iterativeWeightedLeastSquares([0], ([value]) => [{ coefficients: [1], misclosure: 1 - value!, weight: 1 }], {
      maxIterations: 1,
      convergence: 1e-4,
      objective: ([value]) => value! > 1e-5 ? Number.POSITIVE_INFINITY : (1 - value!) ** 2
    })
    expect(solved?.converged).toBe(false)
    expect(solved?.parameters[0]).toBeLessThan(1e-4)
    expect(solved?.maxCorrection).toBe(1)
  })

  it('returns a finite correction diagnostic when no candidate decreases the objective', () => {
    const solved = iterativeWeightedLeastSquares([0], ([value]) => [{ coefficients: [1], misclosure: value! + 1, weight: 1 }])
    expect(solved).toMatchObject({ converged: false, parameters: [0], maxCorrection: 1 })
  })
})
