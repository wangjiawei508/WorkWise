import type { ReactElement } from 'react'
import { Clock3, LayoutGrid, Palette, PencilLine, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppRoute } from '../../store/chat-store'
import { SidebarCommandRow } from './SidebarPrimitives'

type Props = {
  activeRoute: AppRoute
  onWriteOpen: () => void
  onOpenPlugins: () => void
  onScheduleOpen: () => void
  onFlowOpen: () => void
  onDesignOpen: () => void
}

export function WorkspaceSecondaryNavigation({
  activeRoute,
  onWriteOpen,
  onOpenPlugins,
  onScheduleOpen,
  onFlowOpen,
  onDesignOpen
}: Props): ReactElement {
  const { t } = useTranslation('common')

  return (
    <nav aria-label={t('workspaceToolsNavigation')} className="flex flex-col">
      <SidebarCommandRow
        icon={<PencilLine className="h-4 w-4" strokeWidth={1.75} />}
        label={t('write')}
        onClick={onWriteOpen}
        active={activeRoute === 'write'}
      />
      <SidebarCommandRow
        icon={<LayoutGrid className="h-4 w-4" strokeWidth={1.75} />}
        label={t('plugins')}
        onClick={onOpenPlugins}
        active={activeRoute === 'plugins'}
      />
      <SidebarCommandRow
        icon={<Clock3 className="h-4 w-4" strokeWidth={1.75} />}
        label={t('schedule')}
        onClick={onScheduleOpen}
        active={activeRoute === 'schedule'}
      />
      <SidebarCommandRow
        icon={<Workflow className="h-4 w-4" strokeWidth={1.75} />}
        label={t('flow')}
        onClick={onFlowOpen}
        active={activeRoute === 'flow'}
      />
      <SidebarCommandRow
        icon={<Palette className="h-4 w-4" strokeWidth={1.75} />}
        label={t('design')}
        onClick={onDesignOpen}
        active={activeRoute === 'design'}
      />
    </nav>
  )
}
