import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { SurveyGeneralizedWResultV1, SurveyVceTrialOutputV1 } from '@shared/survey-advanced-trials'

const number = (value: number): string => Number(value.toPrecision(12)).toString()
const cell = 'break-words border-b border-ds-border-muted px-2 py-2 text-left align-top'
const scroll = 'max-h-96 max-w-full overflow-auto rounded border border-ds-border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
export const advancedOutcomeKeys: Record<string, string> = {
  resolved: 'advancedResolved', unavailable: 'advancedUnresolved', converged: 'advancedConverged',
  'invalid-input': 'advancedInvalidInput', 'functional-rank-or-conditioning': 'advancedFunctionalRank',
  'stochastic-rank-or-conditioning': 'advancedStochasticRank', 'numerical-boundary': 'advancedNumerical',
  'nonpositive-component': 'advancedNonpositive', 'iteration-limit': 'advancedIterationLimit',
  'insufficient-residual-degrees-of-freedom': 'advancedNoRedundancy',
  'covariance-not-symmetric-positive-definite-or-numerically-unresolved': 'advancedCovarianceInvalid',
  'design-not-full-rank-or-numerically-unresolved': 'advancedFunctionalRank',
  'numeric-range-or-backward-error': 'advancedNumerical'
}

function Values({ title, ids, values }: { title: string; ids: string[]; values: number[] }): ReactElement {
  return <div className={scroll} role="region" aria-label={title} tabIndex={0}><table className="w-full text-[11px]"><caption className="px-2 py-2 text-left font-medium">{title}</caption><tbody>{ids.map((id, i) => <tr key={id}><th scope="row" className={cell}>{id}</th><td className={`${cell} font-mono tabular-nums`}>{number(values[i]!)}</td></tr>)}</tbody></table></div>
}

export function GeneralizedWResult({ result }: { result: SurveyGeneralizedWResultV1 }): ReactElement {
  const { t } = useTranslation('common')
  return <section className="min-w-0 space-y-3" aria-label={t('advancedWResults')}>
    <h4 className="font-semibold">{t('advancedWResults')}</h4>
    <p role="status">{t(result.modelStatus === 'resolved' ? 'advancedResolved' : advancedOutcomeKeys[result.reason])}</p>
    <p className="leading-5 text-ds-muted">{t('advancedWNoDecision')}</p>
    {result.modelStatus === 'resolved' ? <>
      <p>{t('advancedRankDf', { rank: result.rank, df: result.degreesOfFreedom })} · {t('advancedEnergy')}: {number(result.aprioriWeightedResidualSum)}</p>
      <div className={scroll} role="region" aria-label={t('advancedDirections')} tabIndex={0}><table className="w-full text-[11px]"><caption className="px-2 py-2 text-left font-medium">{t('advancedDirections')}</caption><thead><tr>{['advancedDirection', 'advancedStatus', 'advancedSignedW', 'advancedDetectability', 'advancedStatisticError'].map(key => <th scope="col" className={cell} key={key}>{t(key)}</th>)}</tr></thead><tbody>{result.diagnostics.map(direction => <tr key={direction.id}><th scope="row" className={cell}>{direction.id}</th><td className={cell}>{t(direction.status === 'resolved' ? 'advancedResolved' : 'advancedUndetectable')}</td><td className={`${cell} font-mono`}>{direction.generalizedW === null ? t('advancedNotComputed') : number(direction.generalizedW)}</td><td className={`${cell} font-mono`}>{number(direction.detectabilityRatio)}</td><td className={`${cell} font-mono`}>{direction.status === 'resolved' ? number(direction.statisticErrorEstimate) : '—'}</td></tr>)}</tbody></table></div>
      <Values title={t('advancedParameters')} ids={result.request.parameterIds.map((id, i) => `${id} (${result.request.parameterUnits[i]})`)} values={result.parameters} />
      <Values title={t('advancedResiduals', { unit: result.request.observationUnit })} ids={result.request.observationIds} values={result.residuals} />
      <div className={scroll} role="region" aria-label={t('advancedFullCovariance')} tabIndex={0}><table className="w-full text-[11px]"><caption className="px-2 py-2 text-left font-medium">{t('advancedFullCovariance')} ({result.request.observationUnit}²)</caption><thead><tr><th scope="col" className={cell}>{t('advancedObservation')}</th>{result.request.observationIds.map(id => <th scope="col" className={cell} key={id}>{id}</th>)}</tr></thead><tbody>{result.residualCovariance.map((row, i) => <tr key={result.request.observationIds[i]}><th scope="row" className={cell}>{result.request.observationIds[i]}</th>{row.map((value, j) => <td key={j} className={`${cell} whitespace-nowrap font-mono tabular-nums`}>{number(value)}</td>)}</tr>)}</tbody></table></div>
      <p className="text-ds-muted">{t('advancedConditionEstimates', { whitening: number(result.whiteningConditionEstimate), design: number(result.designConditionEstimate) })}</p>
    </> : null}
  </section>
}

export function VceTrialResult({ result }: { result: SurveyVceTrialOutputV1 }): ReactElement {
  const { t } = useTranslation('common')
  return <section className="min-w-0 space-y-3" aria-label={t('advancedVceResults')}>
    <h4 className="font-semibold">{t('advancedVceResults')}</h4>
    <p role="status">{t(advancedOutcomeKeys[result.outcome])}</p>
    <p className="leading-5 text-ds-muted">{t('advancedVceNoDecision')}</p>
    <p>{t('advancedIterationCount', { count: result.iterations.length, df: result.degreesOfFreedom })}</p>
    {result.convergedVariances ? <Values title={t('advancedAcceptedVariances', { unit: result.squaredUnit })} ids={result.groupIds} values={result.convergedVariances} /> : null}
    {result.finalFit ? <><Values title={t('advancedFinalParameters', { unit: result.unit })} ids={result.parameterIds} values={result.finalFit.parameters} /><Values title={t('advancedResiduals', { unit: result.unit })} ids={result.observationIds} values={result.finalFit.residuals} /></> : null}
    <div className="space-y-2" aria-label={t('advancedIterationTrace')}>{result.iterations.map(iteration => <details key={iteration.iteration} className="min-w-0 rounded border border-ds-border-muted" open={iteration.iteration === result.iterations.length}>
      <summary className="cursor-pointer break-words px-3 py-2">{t('advancedIteration', { index: iteration.iteration, change: number(iteration.relativeChange) })}</summary>
      <div className="min-w-0 space-y-3 px-3 pb-3">
        <div className={scroll} role="region" aria-label={t('advancedIterationComponents', { index: iteration.iteration })} tabIndex={0}><table className="w-full text-[11px]"><thead><tr>{['advancedGroup', 'advancedCurrentVariance', 'advancedCandidateVariance'].map(key => <th scope="col" className={cell} key={key}>{t(key)}{key === 'advancedGroup' ? '' : ` (${result.squaredUnit})`}</th>)}</tr></thead><tbody>{result.groupIds.map((id, i) => <tr key={id}><th scope="row" className={cell}>{id}</th><td className={`${cell} font-mono`}>{number(iteration.currentVariances[i]!)}</td><td className={`${cell} font-mono ${iteration.candidateVariances[i]! <= 0 ? 'text-amber-900 dark:text-amber-200' : ''}`}>{number(iteration.candidateVariances[i]!)}{iteration.candidateVariances[i]! <= 0 ? ` · ${t('advancedNonpositiveValue')}` : ''}</td></tr>)}</tbody></table></div>
        <p className="text-ds-muted">{t('advancedIterationCondition', { functional: number(iteration.fit.functionalNormalConditionInfinity), stochastic: number(iteration.stochasticNormalConditionInfinity) })}</p>
        <Values title={t('advancedResiduals', { unit: result.unit })} ids={result.observationIds} values={iteration.fit.residuals} />
      </div>
    </details>)}</div>
  </section>
}
