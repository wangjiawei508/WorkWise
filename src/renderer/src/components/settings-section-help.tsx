import type { ReactElement, ReactNode } from 'react'
import { BookOpen, Download, ExternalLink, FileText, Github, RefreshCw } from 'lucide-react'
import { SettingsCard } from './settings-controls'

const WORKGPT_GITHUB_URL = 'https://github.com/wangjiawei508/WORKGPT'
const WORKGPT_RELEASES_URL = 'https://github.com/wangjiawei508/WORKGPT/releases'
const WORKGPT_ISSUES_URL = 'https://github.com/wangjiawei508/WORKGPT/issues'
const WORKGPT_README_URL = 'https://github.com/wangjiawei508/WORKGPT#readme'

function HelpLinkButton({
  href,
  icon,
  label
}: {
  href: string
  icon: ReactNode
  label: string
}): ReactElement {
  return (
    <button
      type="button"
      onClick={() => void window.workgpt?.openExternal?.(href)?.catch(() => undefined)}
      className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[13px] font-medium text-ds-ink shadow-sm transition hover:bg-ds-hover"
    >
      {icon}
      <span>{label}</span>
      <ExternalLink className="h-3.5 w-3.5 text-ds-faint" strokeWidth={1.8} />
    </button>
  )
}

function HelpInfoBlock({
  icon,
  title,
  body
}: {
  icon: ReactNode
  title: string
  body: string
}): ReactElement {
  return (
    <div className="flex gap-3 border-t border-ds-border-muted py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ds-subtle text-ds-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ds-ink">{title}</div>
        <p className="mt-1 text-[13px] leading-6 text-ds-muted">{body}</p>
      </div>
    </div>
  )
}

export function HelpSettingsSection({ ctx }: { ctx: Record<string, any> }): ReactElement {
  const { t } = ctx

  return (
    <>
      <SettingsCard title={t('sectionHelp')}>
        <p className="text-[13px] leading-6 text-ds-muted">{t('helpIntro')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <HelpLinkButton
            href={WORKGPT_GITHUB_URL}
            icon={<Github className="h-4 w-4" strokeWidth={1.8} />}
            label={t('helpOpenGithub')}
          />
          <HelpLinkButton
            href={WORKGPT_RELEASES_URL}
            icon={<Download className="h-4 w-4" strokeWidth={1.8} />}
            label={t('helpOpenReleases')}
          />
          <HelpLinkButton
            href={WORKGPT_README_URL}
            icon={<BookOpen className="h-4 w-4" strokeWidth={1.8} />}
            label={t('helpOpenReadme')}
          />
          <HelpLinkButton
            href={WORKGPT_ISSUES_URL}
            icon={<ExternalLink className="h-4 w-4" strokeWidth={1.8} />}
            label={t('helpOpenIssues')}
          />
        </div>
      </SettingsCard>

      <SettingsCard title={t('helpUsageTitle')} className="mt-6">
        <HelpInfoBlock
          icon={<FileText className="h-4 w-4" strokeWidth={1.8} />}
          title={t('helpMarkdownTitle')}
          body={t('helpMarkdownBody')}
        />
        <HelpInfoBlock
          icon={<RefreshCw className="h-4 w-4" strokeWidth={1.8} />}
          title={t('helpUpdateTitle')}
          body={t('helpUpdateBody')}
        />
        <HelpInfoBlock
          icon={<BookOpen className="h-4 w-4" strokeWidth={1.8} />}
          title={t('helpPathsTitle')}
          body={t('helpPathsBody')}
        />
      </SettingsCard>
    </>
  )
}
