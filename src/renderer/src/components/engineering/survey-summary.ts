/**
 * Select the primary closure metric for the compact engineering summary.
 * The result is deterministic: each network family gets the metric an
 * operator normally uses first, with compatibility fallbacks for older
 * Runtime results that expose a different closure field.
 */
export function selectSurveyClosureKey(networkType: string | undefined, closure: Record<string, number> | undefined): string | undefined {
  if (!closure) return undefined

  const priorities: Record<string, string[]> = {
    leveling: ['heightDifference', 'vertical', 'closure'],
    traverse: ['relativeClosure', 'horizontal', 'fx', 'fy'],
    gnss: ['baseline', 'baselineX', 'baselineY', 'baselineZ'],
    'plane-control': ['horizontal', 'angular'],
    triangulation: ['horizontal', 'angular'],
    'cpiii-free-station': ['horizontal', 'angular'],
    'cpiii-resection': ['horizontal', 'angular'],
    'coordinate-transform': ['translationX', 'scalePpm', 'rotationRad']
  }
  const fallback = ['horizontal', 'angular', 'vertical', 'heightDifference', 'relativeClosure', 'baseline', 'fx', 'fy', 'translationX', 'scalePpm', 'rotationRad']
  const candidates = priorities[networkType ?? ''] ?? fallback
  return candidates.find((key) => Number.isFinite(closure[key]))
}
