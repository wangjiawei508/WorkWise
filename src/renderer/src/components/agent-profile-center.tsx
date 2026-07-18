import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type {
  AgentProfileSnapshotV1,
  AgentProfileV1,
  WorkspaceTrustLevel
} from '@shared/agent-workbench'
import { AlertTriangle, Bot, Copy, Loader2, RefreshCw, Save } from 'lucide-react'

type AgentProfileCenterProps = {
  workspaceRoot: string
  selectControlClass: string
  t: (key: string, options?: Record<string, unknown>) => string
}

type EditableAgentProfile = Omit<AgentProfileV1, 'builtIn' | 'source' | 'path'>

const TRUST_LEVELS: WorkspaceTrustLevel[] = [
  'read-only',
  'workspace-write',
  'trusted',
  'full-access'
]

function listText(values: string[]): string {
  return values.join('\n')
}

function parseList(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean))]
}

export function cloneAgentProfile(profile: AgentProfileV1): EditableAgentProfile {
  return {
    id: `${profile.id}-custom`,
    name: `${profile.name} Copy`,
    role: profile.role,
    color: profile.color,
    systemPrompt: profile.systemPrompt,
    model: profile.model,
    toolAllowlist: [...profile.toolAllowlist],
    mcpAllowlist: [...profile.mcpAllowlist],
    trustLevel: profile.trustLevel,
    budget: { ...profile.budget },
    revision: 0
  }
}

function editableProfile(profile: AgentProfileV1): EditableAgentProfile {
  const { builtIn: _builtIn, source: _source, path: _path, ...editable } = profile
  return { ...editable, toolAllowlist: [...editable.toolAllowlist], mcpAllowlist: [...editable.mcpAllowlist] }
}

function randomKey(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${suffix}`
}

export function AgentProfileCenter({ workspaceRoot, selectControlClass, t }: AgentProfileCenterProps): ReactElement {
  const [snapshot, setSnapshot] = useState<AgentProfileSnapshotV1 | null>(null)
  const [selectedId, setSelectedId] = useState('general')
  const [draft, setDraft] = useState<EditableAgentProfile | null>(null)
  const [scope, setScope] = useState<'global' | 'workspace'>('workspace')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setNotice(null)
    try {
      const next = await window.workwise.listAgentProfiles(workspaceRoot || undefined)
      setSnapshot(next)
      setSelectedId((currentId) => {
        const current = next.profiles.find((profile) => profile.id === currentId) ?? next.profiles[0]
        if (current) {
          setDraft(editableProfile(current))
          if (!current.builtIn) setScope(current.source === 'workspace' ? 'workspace' : 'global')
          return current.id
        }
        return currentId
      })
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setLoading(false)
    }
  }, [workspaceRoot])

  useEffect(() => {
    void reload()
  }, [reload])

  const selected = useMemo(
    () => snapshot?.profiles.find((profile) => profile.id === selectedId) ?? null,
    [selectedId, snapshot]
  )

  const selectProfile = (profile: AgentProfileV1): void => {
    setSelectedId(profile.id)
    setDraft(editableProfile(profile))
    setScope(profile.source === 'workspace' ? 'workspace' : 'global')
    setNotice(null)
  }

  const cloneSelected = (): void => {
    if (!selected) return
    setSelectedId('')
    setDraft(cloneAgentProfile(selected))
    setScope(workspaceRoot ? 'workspace' : 'global')
    setNotice(null)
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    if (scope === 'workspace' && !workspaceRoot.trim()) {
      setNotice({ tone: 'error', message: t('agentCenterWorkspaceRequired') })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const saved = await window.workwise.saveAgentProfile({
        scope,
        workspaceRoot: scope === 'workspace' ? workspaceRoot : undefined,
        profile: draft,
        expectedRevision: draft.revision,
        idempotencyKey: randomKey('agent-profile')
      })
      setSelectedId(saved.id)
      setDraft(editableProfile(saved))
      setNotice({ tone: 'success', message: t('agentCenterSaved') })
      const next = await window.workwise.listAgentProfiles(workspaceRoot || undefined)
      setSnapshot(next)
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setSaving(false)
    }
  }

  const isReadOnly = selected?.builtIn === true && selected.id === draft?.id
  const inputClass = 'w-full rounded-xl border border-ds-border bg-ds-main/50 px-3 py-2 text-[13px] text-ds-ink outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-65'

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-ds-border bg-ds-card/95 shadow-sm shadow-black/5">
      <div className="flex items-center justify-between gap-3 border-b border-ds-border-muted px-5 py-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ds-ink">{t('agentCenterTitle')}</h2>
          <p className="mt-0.5 text-[12.5px] text-ds-muted">{t('agentCenterDesc')}</p>
        </div>
        <button type="button" onClick={() => void reload()} className="rounded-lg p-2 text-ds-muted hover:bg-ds-hover hover:text-ds-ink" aria-label={t('agentCenterRefresh')}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>
      <div className="grid min-h-[430px] gap-0 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="border-b border-ds-border-muted p-3 lg:border-b-0 lg:border-r">
          <div className="space-y-1.5">
            {snapshot?.profiles.map((profile) => (
              <button
                key={`${profile.source}:${profile.id}`}
                type="button"
                onClick={() => selectProfile(profile)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selectedId === profile.id ? 'bg-accent/10 text-accent' : 'text-ds-muted hover:bg-ds-hover hover:text-ds-ink'}`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: `${profile.color}20`, color: profile.color }}>
                  <Bot className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{profile.name}</span>
                  <span className="block truncate text-[11.5px] opacity-75">{profile.role}</span>
                </span>
                <span className="text-[10px] opacity-65">{profile.builtIn ? t('agentCenterBuiltIn') : profile.source === 'workspace' ? t('agentCenterWorkspace') : t('agentCenterGlobal')}</span>
              </button>
            ))}
          </div>
          {snapshot?.diagnostics.length ? (
            <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-[11.5px] leading-5 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />{t('agentCenterDiagnostics')}</div>
              {snapshot.diagnostics.map((item) => <div key={`${item.path}:${item.message}`}>{item.message}</div>)}
            </div>
          ) : null}
        </div>
        <div className="p-4 md:p-5">
          {draft ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13px] text-ds-muted">{isReadOnly ? t('agentCenterBuiltInReadOnly') : t('agentCenterEditable')}</div>
                <div className="flex gap-2">
                  {selected ? <button type="button" onClick={cloneSelected} className="inline-flex items-center gap-1.5 rounded-xl border border-ds-border px-3 py-2 text-[12px] font-medium text-ds-ink hover:bg-ds-hover"><Copy className="h-3.5 w-3.5" />{t('agentCenterClone')}</button> : null}
                  <button type="button" disabled={isReadOnly || saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{t('agentCenterSave')}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[12px] text-ds-muted">{t('agentCenterId')}<input disabled={isReadOnly || draft.revision > 0} className={`${inputClass} mt-1`} value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '-') })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterName')}<input disabled={isReadOnly} className={`${inputClass} mt-1`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterRole')}<input disabled={isReadOnly} className={`${inputClass} mt-1`} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterModel')}<input disabled={isReadOnly} className={`${inputClass} mt-1`} value={draft.model ?? ''} placeholder="auto" onChange={(event) => setDraft({ ...draft, model: event.target.value || undefined })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterScope')}<select disabled={isReadOnly} className={`${selectControlClass} mt-1`} value={scope} onChange={(event) => setScope(event.target.value as 'global' | 'workspace')}><option value="workspace">{t('agentCenterWorkspace')}</option><option value="global">{t('agentCenterGlobal')}</option></select></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterTrust')}<select disabled={isReadOnly} className={`${selectControlClass} mt-1`} value={draft.trustLevel} onChange={(event) => setDraft({ ...draft, trustLevel: event.target.value as WorkspaceTrustLevel })}>{TRUST_LEVELS.map((level) => <option key={level} value={level}>{t(`agentCenterTrust_${level}`)}</option>)}</select></label>
              </div>
              <label className="block text-[12px] text-ds-muted">{t('agentCenterPrompt')}<textarea disabled={isReadOnly} className={`${inputClass} mt-1 min-h-[110px] resize-y`} value={draft.systemPrompt} onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[12px] text-ds-muted">{t('agentCenterTools')}<textarea disabled={isReadOnly} className={`${inputClass} mt-1 min-h-[85px] resize-y font-mono`} value={listText(draft.toolAllowlist)} onChange={(event) => setDraft({ ...draft, toolAllowlist: parseList(event.target.value) })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterMcp')}<textarea disabled={isReadOnly} className={`${inputClass} mt-1 min-h-[85px] resize-y font-mono`} value={listText(draft.mcpAllowlist)} onChange={(event) => setDraft({ ...draft, mcpAllowlist: parseList(event.target.value) })} /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-[12px] text-ds-muted">{t('agentCenterAttempts')}<input disabled={isReadOnly} type="number" min={1} max={128} className={`${inputClass} mt-1`} value={draft.budget.maxAttempts} onChange={(event) => setDraft({ ...draft, budget: { ...draft.budget, maxAttempts: Number(event.target.value) } })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterMinutes')}<input disabled={isReadOnly} type="number" min={1} max={1440} className={`${inputClass} mt-1`} value={Math.round(draft.budget.maxDurationMs / 60000)} onChange={(event) => setDraft({ ...draft, budget: { ...draft.budget, maxDurationMs: Number(event.target.value) * 60000 } })} /></label>
                <label className="text-[12px] text-ds-muted">{t('agentCenterCost')}<input disabled={isReadOnly} type="number" min={0} step="0.1" className={`${inputClass} mt-1`} value={draft.budget.maxCostUsd ?? ''} onChange={(event) => setDraft({ ...draft, budget: { ...draft.budget, maxCostUsd: event.target.value ? Number(event.target.value) : undefined } })} /></label>
              </div>
              {notice ? <div className={`rounded-xl border px-3 py-2 text-[12px] ${notice.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200' : 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/20 dark:text-red-200'}`}>{notice.message}</div> : null}
            </div>
          ) : <div className="grid min-h-[300px] place-items-center text-[13px] text-ds-faint">{loading ? t('agentCenterLoading') : t('agentCenterEmpty')}</div>}
        </div>
      </div>
    </section>
  )
}
