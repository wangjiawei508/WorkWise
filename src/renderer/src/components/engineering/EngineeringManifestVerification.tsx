import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { surveyRuntimeErrorText } from './survey-diagnostic-text'

type Verification = {
  manifestId: string; projectId: string; checkedAt: string; valid: boolean
  checks: Array<{ id: 'manifest' | 'outputs' | 'inputs' | 'surveyReplay' | 'sources'; status: 'passed' | 'failed' | 'not-applicable'; detail?: string }>
}
const checkKeys = {
  manifest: 'engineeringVerifyManifest', outputs: 'engineeringVerifyOutputs', inputs: 'engineeringVerifyInputs',
  surveyReplay: 'engineeringVerifySurveyReplay', sources: 'engineeringVerifySources'
}
const statusKeys = { passed: 'engineeringVerifyPassed', failed: 'engineeringVerifyFailed', 'not-applicable': 'engineeringVerifyNotApplicable' }

export function EngineeringManifestVerification({ projectId, manifestId, runtimeReady, request }: {
  projectId: string; manifestId: string; runtimeReady: boolean
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [result, setResult] = useState<Verification | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    generation.current += 1
    setResult(null); setError(''); setBusy(false)
    return () => { generation.current += 1 }
  }, [projectId, manifestId, runtimeReady])
  const verify = async (): Promise<void> => {
    if (!runtimeReady || busy) return
    const current = ++generation.current
    setBusy(true); setResult(null); setError('')
    try {
      const { verification } = await request<{ verification: Verification }>(`/v1/engineering/projects/${encodeURIComponent(projectId)}/manifests/${encodeURIComponent(manifestId)}/verify`, 'POST')
      if (current !== generation.current) return
      if (verification.projectId !== projectId || verification.manifestId !== manifestId) throw new Error('deliverable manifest identity mismatch')
      setResult(verification)
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : String(failure))
    } finally { if (current === generation.current) setBusy(false) }
  }
  return <div className="mt-2 space-y-2 text-[11px]">
    <button type="button" disabled={!runtimeReady || busy} onClick={() => void verify()} className="rounded border border-ds-border-muted px-2 py-1 text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">{t(busy ? 'engineeringVerifying' : 'engineeringVerifyDelivery')}</button>
    <div role="status" aria-live="polite">
      {error ? <p className="text-red-700 dark:text-red-300">{surveyRuntimeErrorText(error, i18n.language)}</p> : null}
      {result ? <>
        <p className={result.valid ? 'text-ds-ink' : 'text-red-700 dark:text-red-300'}>{t(result.valid ? 'engineeringVerifySucceeded' : 'engineeringVerifyFailed')} · <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString(i18n.language)}</time></p>
        <ul className="mt-1 space-y-1">{result.checks.map(check => <li key={check.id}>
          {t(checkKeys[check.id])}: {t(statusKeys[check.status])}
          {check.detail ? <p className="break-words text-ds-muted">{surveyRuntimeErrorText(check.detail, i18n.language)}</p> : null}
        </li>)}</ul>
        <p className="mt-2 text-ds-muted">{t('engineeringVerifyBoundary')}</p>
      </> : null}
    </div>
  </div>
}
