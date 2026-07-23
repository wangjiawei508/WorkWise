import { useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Shapes, Search } from 'lucide-react'

type Props = {
  presetShapes: string[]
  onInsertPreset: (presetName: string) => void | Promise<void>
}

/** 常用形状分类（中文关键词 → 形状名匹配） */
const SHAPE_CATEGORIES: Array<{ label: string; keywords: string[] }> = [
  { label: '箭头', keywords: ['arrow', 'chevron', 'pentagon'] },
  { label: '流程图', keywords: ['flowchart', 'process', 'decision', 'merge', 'extract'] },
  { label: '星形', keywords: ['star'] },
  { label: '标注', keywords: ['callout'] },
  { label: '矩形', keywords: ['rect', 'round', 'snip'] },
  { label: '圆形', keywords: ['ellipse', 'pie', 'arc', 'chord'] },
  { label: '三角形', keywords: ['triangle'] },
  { label: '动作按钮', keywords: ['actionbutton'] }
]

/**
 * 预设形状库。
 *
 * 这里只负责搜索、分类和快速插入；自然语言画板操作由相邻的助手面板负责。
 */
export function DesignShapeLibraryPanel({ presetShapes, onInsertPreset }: Props): ReactElement {
  const { t } = useTranslation('common')
  const [query, setQuery] = useState('')

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return presetShapes.filter((name) => name.toLowerCase().includes(q)).slice(0, 20)
  }, [query, presetShapes])

  // 分类结果
  const categorized = useMemo(() => {
    return SHAPE_CATEGORIES.map((cat) => ({
      label: cat.label,
      shapes: presetShapes.filter((name) =>
        cat.keywords.some((kw) => name.toLowerCase().includes(kw))
      ).slice(0, 8)
    })).filter((cat) => cat.shapes.length > 0)
  }, [presetShapes])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ds-border-muted px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ds-ink">
          <Shapes className="h-3.5 w-3.5 text-accent" strokeWidth={1.85} />
          {t('designShapeLibraryTitle')}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* 搜索 */}
        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ds-faint" strokeWidth={1.85} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('designShapeLibrarySearchPlaceholder')}
            className="w-full rounded-lg border border-ds-border bg-ds-card py-1.5 pl-8 pr-2 text-[12.5px] text-ds-ink outline-none focus:border-accent"
          />
        </div>

        {/* 搜索结果 */}
        {query.trim() && searchResults.length > 0 ? (
          <div className="mb-4">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ds-faint">
              {t('designShapeLibraryResults')} ({searchResults.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {searchResults.map((name) => (
                <ShapeButton key={name} name={name} onClick={() => void onInsertPreset(name)} />
              ))}
            </div>
          </div>
        ) : query.trim() ? (
          <p className="mb-4 text-[12px] text-ds-faint">{t('designShapeLibraryNoResults')}</p>
        ) : null}

        {/* 分类 */}
        {!query.trim() && categorized.length > 0 ? (
          categorized.map((cat) => (
            <div key={cat.label} className="mb-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ds-faint">
                {cat.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {cat.shapes.map((name) => (
                  <ShapeButton key={name} name={name} onClick={() => void onInsertPreset(name)} />
                ))}
              </div>
            </div>
          ))
        ) : null}

        {!query.trim() && presetShapes.length === 0 ? (
          <p className="text-center text-[12px] text-ds-faint">{t('designShapeLibraryLoading')}</p>
        ) : null}
      </div>
    </div>
  )
}

function ShapeButton({ name, onClick }: { name: string; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-ds-border bg-ds-card px-2 py-1 text-[11px] text-ds-faint transition hover:border-accent hover:text-accent"
    >
      {name}
    </button>
  )
}
