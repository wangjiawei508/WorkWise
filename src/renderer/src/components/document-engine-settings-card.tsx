import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { DocumentEngineId, DocumentEngineStatusV1, DocumentParsingMode } from '@shared/agent-workbench'
import type { DocumentSettingsV1 } from '@shared/app-settings'
import { CheckCircle2, CircleAlert, Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { SettingsCard, SettingRow, Toggle } from './settings-controls'

type Props = {
  documents: DocumentSettingsV1
  workspaceRoot: string
  selectControlClass: string
  update: (patch: { documents: Partial<DocumentSettingsV1> }) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function engineName(id: DocumentEngineId): string {
  if (id === 'markitdown') return 'Microsoft MarkItDown'
  if (id === 'mineru-local') return 'MinerU（本机）'
  return 'MinerU（企业私有服务）'
}

export function DocumentEngineSettingsCard({ documents, workspaceRoot, selectControlClass, update, t }: Props): ReactElement {
  const [engines, setEngines] = useState<DocumentEngineStatusV1[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setEngines(await window.workwise.listDocumentEngines())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const installMineru = async (): Promise<void> => {
    const confirmed = await window.workwise.confirmDialog({
      message: t('documentMineruInstallConfirm'),
      detail: t('documentMineruInstallDetail'),
      confirmLabel: t('documentMineruInstall'),
      cancelLabel: t('cancel')
    })
    if (!confirmed) return
    setInstalling(true)
    setError(null)
    try {
      await window.workwise.installDocumentEngine('mineru-local')
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setInstalling(false)
    }
  }

  const workspaceUploadAllowed = workspaceRoot
    ? documents.allowPrivateServerUploadByWorkspace[workspaceRoot] === true
    : false

  return (
    <SettingsCard title={t('documentEngineTitle')} className="mt-6">
      <SettingRow
        title={t('documentParsingMode')}
        description={t('documentParsingModeDesc')}
        control={<select className={selectControlClass} value={documents.parsingMode} onChange={(event) => update({ documents: { parsingMode: event.target.value as DocumentParsingMode } })}><option value="auto">{t('documentParsingAuto')}</option><option value="fast">{t('documentParsingFast')}</option><option value="accurate">{t('documentParsingAccurate')}</option></select>}
      />
      <SettingRow
        title={t('documentEngines')}
        description={t('documentEnginesDesc')}
        wideControl
        control={
          <div className="space-y-2">
            {engines.map((engine) => (
              <div key={engine.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ds-border-muted bg-ds-main/45 px-3 py-3">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${engine.state === 'available' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{engine.state === 'available' ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-ds-ink">{engineName(engine.id)}</span><span className="block text-[11.5px] leading-5 text-ds-faint">{engine.version || t(`documentEngineState_${engine.state}`)} · {engine.attribution}</span>{engine.message ? <span className="block text-[11.5px] leading-5 text-ds-muted">{engine.message}</span> : null}</span>
                {engine.id === 'mineru-local' && engine.state === 'not_installed' ? <button type="button" disabled={installing} onClick={() => void installMineru()} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50">{installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{installing ? t('documentMineruInstalling') : t('documentMineruInstall')}</button> : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11.5px] text-ds-faint"><span>{t('documentLocalPrivacy')}</span><div className="flex gap-2"><button type="button" onClick={() => void window.workwise.openExternal('https://github.com/opendatalab/MinerU/blob/master/LICENSE.md')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-ds-hover hover:text-ds-ink"><ExternalLink className="h-3 w-3" />{t('documentMineruLicense')}</button><button type="button" disabled={loading} onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-ds-hover hover:text-ds-ink">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}{t('refresh')}</button></div></div>
          </div>
        }
      />
      <SettingRow
        title={t('documentPrivateMineru')}
        description={t('documentPrivateMineruDesc')}
        wideControl
        control={<div className="space-y-3"><input className="w-full rounded-xl border border-ds-border bg-ds-main/50 px-3 py-2 text-[13px] text-ds-ink outline-none focus:border-accent/40" value={documents.privateMineruServerUrl} placeholder="https://mineru.example.com" onChange={(event) => update({ documents: { privateMineruServerUrl: event.target.value } })} /><div className="flex items-center justify-between gap-3"><span className="text-[12px] leading-5 text-ds-muted">{workspaceRoot ? t('documentPrivateUploadWorkspace') : t('documentPrivateUploadNoWorkspace')}</span><Toggle disabled={!workspaceRoot || !documents.privateMineruServerUrl.trim()} checked={workspaceUploadAllowed} onChange={(allowed) => update({ documents: { allowPrivateServerUploadByWorkspace: { ...documents.allowPrivateServerUploadByWorkspace, ...(workspaceRoot ? { [workspaceRoot]: allowed } : {}) } } })} /></div></div>}
      />
      {error ? <div className="mx-3 my-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:bg-red-950/20 dark:text-red-200">{error}</div> : null}
    </SettingsCard>
  )
}
