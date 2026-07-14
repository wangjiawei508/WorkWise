import type { ReactElement } from 'react'
import { Code2, Dribbble, PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  activeView: 'chat' | 'write' | 'claw' | 'schedule'
  focusModeEnabled?: boolean
  onCodeOpen: () => void
  onToggleFocusMode?: () => void
  onWriteOpen: () => void
}

export function WorkspaceModeTabs({
  activeView,
  focusModeEnabled = false,
  onCodeOpen,
  onToggleFocusMode,
  onWriteOpen
}: Props): ReactElement {
  const { t } = useTranslation('common')
  const showFocusToggle = typeof onToggleFocusMode === 'function'

  const tabClass = (active: boolean): string =>
    `group inline-flex min-h-[32px] flex-1 min-w-0 items-center justify-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 ${
      active
        ? 'bg-[var(--ds-sidebar-field-focus)] font-medium text-[#182230] shadow-[0_1px_3px_rgba(15,23,42,0.07),inset_0_0_0_1px_var(--ds-sidebar-row-ring),inset_0_1px_0_rgba(255,255,255,0.78)] dark:bg-white/[0.09] dark:text-white dark:shadow-[0_1px_5px_rgba(0,0,0,0.24),inset_0_0_0_1px_rgba(255,255,255,0.1)]'
        : 'font-normal text-[#5c6675] hover:bg-[color-mix(in_srgb,var(--ds-sidebar-field-focus)_56%,transparent)] hover:text-[#1f2733] dark:text-white/58 dark:hover:bg-white/[0.055] dark:hover:text-white/88'
    }`

  const iconClass = (active: boolean): string =>
    `flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-[7px] transition ${
      active
        ? 'bg-[var(--ds-accent-soft)] text-[var(--ds-accent)] shadow-[inset_0_0_0_1px_rgba(0,136,255,0.12)] dark:bg-[rgba(51,156,255,0.2)] dark:text-[#78bdff] dark:shadow-[inset_0_0_0_1px_rgba(51,156,255,0.16)]'
        : 'text-[#6f7a89] group-hover:bg-white/55 group-hover:text-[#344055] dark:text-white/48 dark:group-hover:bg-white/[0.06] dark:group-hover:text-white/78'
    }`

  const tabs = (
    <div
      role="tablist"
      aria-label={`${t('code')} / ${t('write')}`}
      className={`${showFocusToggle ? '' : 'mb-2'} flex flex-row gap-1 rounded-[8px] border border-[var(--ds-sidebar-row-ring)] bg-[color-mix(in_srgb,var(--ds-sidebar-field-bg)_84%,transparent)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] dark:bg-white/[0.035] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeView === 'chat'}
        onClick={onCodeOpen}
        className={tabClass(activeView === 'chat')}
      >
        <span className={iconClass(activeView === 'chat')}>
          <Code2 className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
        <span className="truncate">{t('code')}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeView === 'write'}
        onClick={onWriteOpen}
        className={tabClass(activeView === 'write')}
      >
        <span className={iconClass(activeView === 'write')}>
          <PencilLine className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
        <span className="truncate">{t('write')}</span>
      </button>
    </div>
  )

  if (!showFocusToggle) return tabs

  return (
    <div className="mb-2 space-y-1.5">
      {tabs}
      <button
        type="button"
        role="switch"
        aria-checked={focusModeEnabled}
        aria-label={t('focusMode')}
        onClick={onToggleFocusMode}
        className={`group flex min-h-[34px] w-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 ${
          focusModeEnabled
            ? 'bg-[color-mix(in_srgb,#f97316_12%,var(--ds-sidebar-field-focus))] text-[#2d2418] shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18),inset_0_1px_0_rgba(255,255,255,0.64)] dark:bg-[rgba(249,115,22,0.16)] dark:text-white/88 dark:shadow-[inset_0_0_0_1px_rgba(251,146,60,0.24)]'
            : 'text-[#5c6675] hover:bg-[color-mix(in_srgb,var(--ds-sidebar-field-focus)_56%,transparent)] hover:text-[#1f2733] dark:text-white/58 dark:hover:bg-white/[0.055] dark:hover:text-white/88'
        }`}
      >
        <span
          className={`flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-[7px] transition ${
            focusModeEnabled
              ? 'bg-orange-100 text-orange-600 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.18)] dark:bg-orange-400/18 dark:text-orange-200'
              : 'text-[#6f7a89] group-hover:bg-white/55 group-hover:text-[#344055] dark:text-white/48 dark:group-hover:bg-white/[0.06] dark:group-hover:text-white/78'
          }`}
        >
          <Dribbble className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{t('focusMode')}</span>
        <span className="shrink-0 text-[11.5px] text-ds-faint">
          {focusModeEnabled ? t('switchOn') : t('switchOff')}
        </span>
        <span
          className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition ${
            focusModeEnabled
              ? 'bg-orange-500 shadow-[inset_0_0_0_1px_rgba(194,65,12,0.18)]'
              : 'bg-[rgba(100,116,139,0.18)] shadow-[inset_0_0_0_1px_rgba(100,116,139,0.18)] dark:bg-white/[0.12] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
          }`}
          aria-hidden="true"
        >
          <span
            className={`absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.22)] transition-transform ${
              focusModeEnabled ? 'translate-x-[17px]' : 'translate-x-[3px]'
            }`}
          />
        </span>
      </button>
    </div>
  )
}
