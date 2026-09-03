/**
 * Canonical numerical primitives for engineering-survey adjustment.
 *
 * All Runtime survey strategies use this module. Agent Pack and RailWise
 * adapters must call the Runtime strategies instead of carrying another
 * executable matrix implementation.
 */
export type Matrix = number[][]

export type WeightedEquation = {
  coefficients: number[]
  misclosure: number
  weight: number
}

export type LinearAdjustmentResult = {
  corrections: number[]
  residuals: number[]
  covariance: Matrix
  varianceFactor: number
  varianceFactorEstimated: boolean
  unitWeightStdDev: number
  dof: number
  rank: number
  conditionEstimate: number
}

export type MatrixInversionResult = {
  inverse: Matrix | null
  rank: number
  conditionEstimate: number
}

export type IterativeAdjustmentResult = LinearAdjustmentResult & {
  parameters: number[]
  iterations: number
  converged: boolean
  maxCorrection: number
}

export type LinearAdjustmentOutcome =
  | { ok: true; result: LinearAdjustmentResult }
  | { ok: false; reason: 'empty' | 'invalid-equation' | 'rank-deficient'; rank: number; conditionEstimate: number }

export const surveyMatrix = {
  transpose(source: Matrix): Matrix {
    if (!source.length) return []
    return source[0]!.map((_, column) => source.map((row) => row[column] ?? 0))
  },

  multiply(left: Matrix, right: Matrix): Matrix {
    if (!left.length || !right.length) return []
    return left.map((row) => right[0]!.map((_, column) => row.reduce((sum, value, index) => sum + value * (right[index]?.[column] ?? 0), 0)))
  },

  multiplyVector(source: Matrix, vector: number[]): number[] {
    return source.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0))
  },

  invert(source: Matrix): MatrixInversionResult {
    const dimension = source.length
    if (!dimension || source.some((row) => row.length !== dimension || row.some((value) => !Number.isFinite(value)))) {
      return { inverse: null, rank: 0, conditionEstimate: Number.POSITIVE_INFINITY }
    }
    const scale = Math.max(1, ...source.flatMap((row) => row.map((value) => Math.abs(value))))
    const threshold = scale * 1e-12
    const augmented = source.map((row, rowIndex) => [
      ...row,
      ...Array.from({ length: dimension }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0)
    ])
    const pivots: number[] = []
    for (let column = 0; column < dimension; column += 1) {
      let pivotRow = column
      for (let row = column + 1; row < dimension; row += 1) {
        if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivotRow]![column]!)) pivotRow = row
      }
      const pivotMagnitude = Math.abs(augmented[pivotRow]![column]!)
      if (pivotMagnitude <= threshold) {
        return { inverse: null, rank: column, conditionEstimate: Number.POSITIVE_INFINITY }
      }
      pivots.push(pivotMagnitude)
      ;[augmented[column], augmented[pivotRow]] = [augmented[pivotRow]!, augmented[column]!]
      const pivot = augmented[column]![column]!
      for (let index = 0; index < 2 * dimension; index += 1) augmented[column]![index]! /= pivot
      for (let row = 0; row < dimension; row += 1) {
        if (row === column) continue
        const factor = augmented[row]![column]!
        if (Math.abs(factor) <= Number.EPSILON) continue
        for (let index = 0; index < 2 * dimension; index += 1) augmented[row]![index]! -= factor * augmented[column]![index]!
      }
    }
    const smallestPivot = Math.min(...pivots)
    const largestPivot = Math.max(...pivots)
    return {
      inverse: augmented.map((row) => row.slice(dimension)),
      rank: dimension,
      conditionEstimate: smallestPivot > 0 ? largestPivot / smallestPivot : Number.POSITIVE_INFINITY
    }
  }
}

export function solveWeightedLeastSquares(rows: WeightedEquation[]): LinearAdjustmentOutcome {
  if (!rows.length) return { ok: false, reason: 'empty', rank: 0, conditionEstimate: Number.POSITIVE_INFINITY }
  const dimension = rows[0]!.coefficients.length
  if (!dimension || rows.some((row) => row.coefficients.length !== dimension || !Number.isFinite(row.misclosure) || !Number.isFinite(row.weight) || row.weight <= 0)) {
    return { ok: false, reason: 'invalid-equation', rank: 0, conditionEstimate: Number.POSITIVE_INFINITY }
  }
  const design = rows.map((row) => row.coefficients)
  const transpose = surveyMatrix.transpose(design)
  const weightedDesign = design.map((row, rowIndex) => row.map((value) => value * rows[rowIndex]!.weight))
  const normal = surveyMatrix.multiply(transpose, weightedDesign)
  const rightHandSide = surveyMatrix.multiplyVector(transpose, rows.map((row) => row.misclosure * row.weight))
  const inversion = surveyMatrix.invert(normal)
  if (!inversion.inverse) return { ok: false, reason: 'rank-deficient', rank: inversion.rank, conditionEstimate: inversion.conditionEstimate }
  const corrections = surveyMatrix.multiplyVector(inversion.inverse, rightHandSide)
  const residuals = surveyMatrix.multiplyVector(design, corrections).map((value, index) => value - rows[index]!.misclosure)
  const dof = Math.max(0, rows.length - dimension)
  const weightedResidualSum = residuals.reduce((sum, value, index) => sum + value * value * rows[index]!.weight, 0)
  // With no redundancy sigma0 cannot be estimated from residuals. Preserve
  // the a-priori unit variance instead of falsely reporting zero precision.
  const varianceFactorEstimated = dof > 0
  const varianceFactor = varianceFactorEstimated ? weightedResidualSum / dof : 1
  return { ok: true, result: {
    corrections,
    residuals,
    covariance: inversion.inverse,
    varianceFactor,
    varianceFactorEstimated,
    unitWeightStdDev: Math.sqrt(varianceFactor),
    dof,
    rank: inversion.rank,
    conditionEstimate: inversion.conditionEstimate
  } }
}

export function weightedLeastSquares(rows: WeightedEquation[]): LinearAdjustmentResult | null {
  const outcome = solveWeightedLeastSquares(rows)
  return outcome.ok ? outcome.result : null
}

export function iterativeWeightedLeastSquares(
  initialParameters: number[],
  buildEquations: (parameters: readonly number[]) => WeightedEquation[],
  options: { maxIterations?: number; convergence?: number } = {}
): IterativeAdjustmentResult | null {
  const maxIterations = options.maxIterations ?? 10
  const convergence = options.convergence ?? 1e-5
  const parameters = [...initialParameters]
  let last: LinearAdjustmentResult | null = null
  let maxCorrection = Number.POSITIVE_INFINITY
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const solved = weightedLeastSquares(buildEquations(parameters))
    if (!solved) return null
    last = solved
    maxCorrection = solved.corrections.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
    for (let index = 0; index < parameters.length; index += 1) parameters[index] = (parameters[index] ?? 0) + (solved.corrections[index] ?? 0)
    if (maxCorrection <= convergence) return { ...solved, parameters, iterations: iteration, converged: true, maxCorrection }
  }
  return last ? { ...last, parameters, iterations: maxIterations, converged: false, maxCorrection } : null
}

export function wrapRadians(value: number): number {
  let wrapped = value
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI
  return wrapped
}
