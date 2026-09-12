import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookOpen, ShieldCheck, Wrench } from 'lucide-react'
import { rendererRuntimeClient } from '../../agent/runtime-client'

type Capability = { id: string; label: string; category: string; skillIds: string[]; toolIds: string[]; available: boolean; reason?: string }
type Skill = { id: string; name: string; sourceRepository: string; commit: string; license: string; packaged: boolean; status: 'available' | 'blocked' | 'review'; reason?: string }

function skillStatus(skill: Skill, t: (key: string) => string): { label: string; tone: string } {
  if (skill.status === 'available' && skill.packaged) return { label: t('engineeringSkillAuditedPackaged'), tone: 'text-green-700 dark:text-green-300' }
  if (skill.status === 'blocked') return { label: t('engineeringSkillReviewBlocked'), tone: 'text-red-700 dark:text-red-300' }
  return { label: t('engineeringSkillReviewPending'), tone: 'text-amber-700 dark:text-amber-300' }
}

export function EngineeringSkillsPanel({ runtimeReady }: { runtimeReady: boolean }): ReactElement {
  const { t } = useTranslation('common')
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!runtimeReady) return
    let cancelled = false
    void Promise.all([rendererRuntimeClient.runtimeRequest('/v1/engineering/capabilities'), rendererRuntimeClient.runtimeRequest('/v1/engineering/skills/catalog')]).then(([capabilitiesResponse, skillsResponse]) => {
      if (cancelled) return
      try { if (!capabilitiesResponse.ok || !skillsResponse.ok) throw new Error(t('engineeringSkillsUnavailable')); setCapabilities((JSON.parse(capabilitiesResponse.body) as { capabilities?: Capability[] }).capabilities ?? []); setSkills((JSON.parse(skillsResponse.body) as { skills?: Skill[] }).skills ?? []) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { cancelled = true }
  }, [runtimeReady, t])
  return <section className="p-5" aria-label={t('engineeringSkillsPanelTitle')}><div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]"><div className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-4 py-3"><p className="flex items-center gap-2 text-[13px] font-semibold"><Wrench className="h-4 w-4 text-accent" />{t('engineeringCapabilityCatalog')}</p><p className="mt-1 text-[11px] text-ds-muted">{t('engineeringCapabilityCatalogDescription')}</p></div><div className="grid gap-2 p-4 md:grid-cols-2">{capabilities.map((item) => <article key={item.id} className="border border-ds-border-muted p-3"><div className="flex items-start justify-between gap-2"><h3 className="text-[12px] font-semibold text-ds-ink">{item.label}</h3><span className={`rounded px-1.5 py-0.5 text-[10px] ${item.available ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}>{item.available ? t('engineeringAvailable') : t('engineeringRestricted')}</span></div><p className="mt-2 text-[10.5px] text-ds-faint">{t('engineeringSkillsLabel')}: {item.skillIds.join(' · ')}</p><p className="mt-1 text-[10.5px] text-ds-faint">{t('engineeringToolsLabel')}: {item.toolIds.join(' · ')}</p>{item.reason ? <p className="mt-2 text-[10.5px] text-amber-700 dark:text-amber-300">{item.reason}</p> : null}</article>)}{error ? <p role="alert" className="text-[11px] text-red-700 dark:text-red-300">{error}</p> : null}</div></div><aside className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-4 py-3"><p className="flex items-center gap-2 text-[13px] font-semibold"><BookOpen className="h-4 w-4 text-accent" />{t('engineeringSkillSourcesPermissions')}</p><p className="mt-1 text-[11px] text-ds-muted">{t('engineeringSkillSourcesDescription')}</p></div><div className="divide-y divide-ds-border-muted">{skills.map((skill) => { const status = skillStatus(skill, t); return <div key={skill.id} className="px-4 py-3"><div className="flex items-start gap-2">{skill.status === 'available' && skill.packaged ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />}<div className="min-w-0"><div className="flex items-center justify-between gap-2"><p className="truncate text-[11.5px] font-medium text-ds-ink">{skill.name}</p><span className={`shrink-0 text-[10px] font-semibold ${status.tone}`}>{status.label}</span></div><p className="mt-1 truncate font-mono text-[10px] text-ds-faint">{skill.id} · {skill.commit}</p><p className="mt-1 text-[10.5px] text-ds-muted">{skill.license} · {t('engineeringNetworkDisabled')}</p>{skill.reason ? <p className="mt-1 text-[10.5px] leading-4 text-amber-700 dark:text-amber-300">{skill.reason}</p> : null}</div></div></div> })}</div></aside></div></section>
}
