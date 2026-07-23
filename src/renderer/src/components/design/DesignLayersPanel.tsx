import type { ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import type { DesignElement } from '@shared/design-document'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'

/**
 * 图层面板：显示当前页的元素列表（zIndex 倒序，上层在前）。
 *
 * 功能：
 * - 点击选中 / Ctrl+Cmd 多选
 * - 切换锁定 / 隐藏
 * - 显示元素类型和名称
 *
 * 图层顺序由 zIndex 决定；当前通过创建、导入和画板命令维护顺序。
 */
export function DesignLayersPanel(): ReactElement {
  const { t } = useTranslation('common')
  const {
    elements,
    selectedElementIds,
    selectElement,
    addToSelection,
    removeFromSelection,
    updateElement
  } = useDesignWorkspaceStore(
    useShallow((s) => {
      const page = s.getActivePage()
      return {
        elements: page?.elements ?? [],
        selectedElementIds: s.selectedElementIds,
        selectElement: s.selectElement,
        addToSelection: s.addToSelection,
        removeFromSelection: s.removeFromSelection,
        updateElement: s.updateElement
      }
    })
  )

  // 按 zIndex 倒序（上层元素在前）
  const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  const selectedIdSet = new Set(selectedElementIds)

  const handleClick = (element: DesignElement, event: React.MouseEvent): void => {
    if (event.ctrlKey || event.metaKey) {
      if (selectedIdSet.has(element.id)) {
        removeFromSelection(element.id)
      } else {
        addToSelection(element.id)
      }
    } else {
      selectElement(element.id)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="shrink-0 border-b border-ds-border-muted px-3 py-2.5 text-[12.5px] font-semibold text-ds-ink">
        {t('designLayers')}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedElements.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-[12px] text-ds-faint">
            {t('designLayersEmpty')}
          </div>
        ) : (
          sortedElements.map((element) => {
            const isSelected = selectedIdSet.has(element.id)
            return (
              <div
                key={element.id}
                onClick={(event) => handleClick(element, event)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 transition ${
                  isSelected ? 'bg-accent/10' : 'hover:bg-ds-hover/40'
                } ${element.hidden ? 'opacity-50' : ''}`}
              >
                <span className="text-[10px] font-mono text-ds-faint">
                  {layerIcon(element.type)}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[12px] ${isSelected ? 'text-accent' : 'text-ds-ink'}`}>
                  {element.name ?? elementLabel(element)}
                </span>
                {/* 锁定切换 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateElement(element.id, { locked: !element.locked })
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ds-faint transition hover:text-ds-ink"
                  title={element.locked ? t('designUnlock') : t('designLock')}
                >
                  {element.locked ? <Lock className="h-3 w-3" strokeWidth={2} /> : <Unlock className="h-3 w-3" strokeWidth={1.8} />}
                </button>
                {/* 隐藏切换 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateElement(element.id, { hidden: !element.hidden })
                  }}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ds-faint transition hover:text-ds-ink"
                  title={element.hidden ? t('designShow') : t('designHide')}
                >
                  {element.hidden ? <EyeOff className="h-3 w-3" strokeWidth={2} /> : <Eye className="h-3 w-3" strokeWidth={1.8} />}
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/** 元素类型 → 图层面板里的图标字符 */
function layerIcon(type: DesignElement['type']): string {
  switch (type) {
    case 'rect': return '▭'
    case 'ellipse': return '◯'
    case 'line': return '╱'
    case 'text': return 'T'
    case 'image': return '🖼'
    case 'path': return '⬈'
    case 'preset': return '◆'
    case 'group': return '▣'
    default: return '·'
  }
}

/** 元素默认显示名（无 name 时） */
function elementLabel(element: DesignElement): string {
  if (element.type === 'text' && element.text) {
    return element.text.slice(0, 20)
  }
  if (element.type === 'preset' && element.presetName) {
    return element.presetName
  }
  return element.type
}
