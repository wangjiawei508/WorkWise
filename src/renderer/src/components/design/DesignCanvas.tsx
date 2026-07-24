import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatSvgColor, type DesignElement, type DesignPage } from '@shared/design-document'
import { useDesignWorkspaceStore } from '../../design/design-workspace-store'
import {
  designCanvasFitScale,
  moveDesignCanvasPan,
  stepDesignCanvasScale,
  type DesignCanvasPan
} from '../../design/design-canvas-viewport'
import {
  RESIZE_HANDLES,
  computeResizedBounds,
  cursorForHandle,
  handlePosition,
  type ElementBounds,
  type ResizeHandle
} from '../../design/design-resize'
import { computeRotation, rotationHandlePosition } from '../../design/design-rotate'
import { computeSnap, type SnapLine } from '../../design/design-snap'
import { DesignElementRenderer } from './DesignElementRenderer'

/**
 * SVG 画布渲染 + 交互组件。
 *
 * 渲染当前活跃页面的所有元素到 <svg>。
 * 元素按 zIndex 升序渲染（zIndex 大的在上面）。
 * 选中元素显示蓝色包围框。
 *
 * 支持交互：
 * - 点击选中 / Ctrl+Cmd 多选 / 点空白取消选中
 * - 拖拽元素移动（mousedown → mousemove → mouseup）
 *
 * 坐标系：viewBox = "0 0 page.width page.height"，
 * 与 PPT Master 一致（✅ canvas_contract.py 确认任意正整数尺寸）。
 * 拖拽时用 getScreenCTM().inverse() 把屏幕坐标转换为 SVG 坐标（✅ SVG 标准 API）。
 *
 * 已支持画布平移/缩放、缩放手柄、旋转、吸附和多选移动。
 */
export function DesignCanvas(): ReactElement | null {
  const { t } = useTranslation('common')
  const document = useDesignWorkspaceStore((s) => s.document)
  const activePageId = useDesignWorkspaceStore((s) => s.activePageId)
  const selectedElementIds = useDesignWorkspaceStore((s) => s.selectedElementIds)
  const assetDataUrls = useDesignWorkspaceStore((s) => s.assetDataUrls)
  const selectElement = useDesignWorkspaceStore((s) => s.selectElement)
  const clearSelection = useDesignWorkspaceStore((s) => s.clearSelection)
  const addToSelection = useDesignWorkspaceStore((s) => s.addToSelection)
  const removeFromSelection = useDesignWorkspaceStore((s) => s.removeFromSelection)
  const updateElement = useDesignWorkspaceStore((s) => s.updateElement)
  const beginTransientChange = useDesignWorkspaceStore((s) => s.beginTransientChange)
  const endTransientChange = useDesignWorkspaceStore((s) => s.endTransientChange)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  // 拖拽状态：记录起始 SVG 坐标 + 元素初始 x/y（按 elementId 索引）
  const dragStateRef = useRef<{
    startSvgX: number
    startSvgY: number
    elementStarts: Map<string, { x: number; y: number }>
  } | null>(null)
  const resizeStateRef = useRef<{
    handle: ResizeHandle
    startBounds: ElementBounds
    elementId: string
  } | null>(null)
  const rotateStateRef = useRef<{
    elementId: string
    centerX: number
    centerY: number
  } | null>(null)
  const panStateRef = useRef<{
    startClientX: number
    startClientY: number
    startPan: DesignCanvasPan
    moved: boolean
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [fitScale, setFitScale] = useState(1)
  const [manualScale, setManualScale] = useState<number | null>(null)
  const [pan, setPan] = useState<DesignCanvasPan>({ x: 0, y: 0 })
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  const activePage: DesignPage | undefined = document && activePageId
    ? document.pages.find((item) => item.id === activePageId)
    : undefined
  const activePageWidth = activePage?.width
  const activePageHeight = activePage?.height

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !activePageId || !activePageWidth || !activePageHeight) return
    const updateFitScale = (): void => {
      const bounds = viewport.getBoundingClientRect()
      setFitScale(
        designCanvasFitScale(bounds.width, bounds.height, activePageWidth, activePageHeight)
      )
    }
    updateFitScale()
    const observer = new ResizeObserver(updateFitScale)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [activePageHeight, activePageId, activePageWidth, document?.id])

  useEffect(() => {
    setManualScale(null)
    setPan({ x: 0, y: 0 })
    panStateRef.current = null
    setIsPanning(false)
  }, [activePageId, document?.id])

  const screenToSvg = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    // DOMPoint 是浏览器原生 API，用 getScreenCTM().inverse() 转换
    const pt = new DOMPoint(clientX, clientY)
    const transformed = pt.matrixTransform(ctm.inverse())
    return { x: transformed.x, y: transformed.y }
  }, [])

  if (!document || !activePageId) return null

  const page = activePage
  if (!page) return null

  const sortedElements = [...page.elements].sort((a, b) => a.zIndex - b.zIndex)
  const selectedIdSet = new Set(selectedElementIds)

  const handleBackgroundClick = (event: React.MouseEvent<SVGSVGElement>): void => {
    // A click that starts on an element also bubbles to the root SVG. Treat
    // only the SVG's own empty area as background; otherwise the selection
    // made during the element's mousedown would be cleared immediately.
    if (event.target !== event.currentTarget) return
    clearSelection()
  }

  const handleViewportMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target
    const isEmptyViewport = target === event.currentTarget
    const isCanvasBackground = target === svgRef.current
    if (!isEmptyViewport && !isCanvasBackground) return
    panStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
      moved: false
    }
    setIsPanning(true)
    event.preventDefault()
  }

  const handleElementMouseDown = (element: DesignElement, event: React.MouseEvent): void => {
    // Ctrl/Cmd+Click 切换选中；普通点击如果未选中则单选
    if (event.ctrlKey || event.metaKey) {
      if (selectedIdSet.has(element.id)) {
        removeFromSelection(element.id)
      } else {
        addToSelection(element.id)
      }
    } else if (!selectedIdSet.has(element.id)) {
      selectElement(element.id)
    }

    // 锁定的元素不可拖拽
    if (element.locked) return

    // 准备拖拽：记录所有选中元素的初始位置。
    // 注意：必须读 store 的最新状态（get().selectedElementIds），
    // 而非组件渲染时的 selectedIdSet 快照——因为上面的选中操作
    // 刚更新了 store，但 selectedIdSet 还是旧值，会导致 Ctrl+Click
    // 追加选中后拖拽时只拖新元素而非全部选中。
    const currentSelectedIds = useDesignWorkspaceStore.getState().selectedElementIds
    const currentSelectedSet = new Set(currentSelectedIds)
    const svgPos = screenToSvg(event.clientX, event.clientY)
    const elementStarts = new Map<string, { x: number; y: number }>()
    const idsToDrag = currentSelectedSet.has(element.id)
      ? currentSelectedIds
      : [element.id]
    for (const id of idsToDrag) {
      const el = page.elements.find((e) => e.id === id)
      if (el && !el.locked) {
        elementStarts.set(id, { x: el.x, y: el.y })
      }
    }
    dragStateRef.current = {
      startSvgX: svgPos.x,
      startSvgY: svgPos.y,
      elementStarts
    }
    event.stopPropagation()
  }

  // 手柄 mousedown：开始 resize（仅单选时）
  const handleResizeMouseDown = (element: DesignElement, handle: ResizeHandle, event: React.MouseEvent): void => {
    event.stopPropagation()
    if (element.locked) return
    resizeStateRef.current = {
      handle,
      startBounds: { x: element.x, y: element.y, w: element.w, h: element.h },
      elementId: element.id
    }
    dragStateRef.current = null
  }

  // 旋转手柄 mousedown：开始旋转（仅单选时）
  const handleRotateMouseDown = (element: DesignElement, event: React.MouseEvent): void => {
    event.stopPropagation()
    if (element.locked) return
    rotateStateRef.current = {
      elementId: element.id,
      centerX: element.x + element.w / 2,
      centerY: element.y + element.h / 2
    }
    dragStateRef.current = null
  }

  const handleMouseMove = (event: React.MouseEvent): void => {
    const panState = panStateRef.current
    if (panState) {
      const deltaX = event.clientX - panState.startClientX
      const deltaY = event.clientY - panState.startClientY
      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) panState.moved = true
      setPan(moveDesignCanvasPan(panState.startPan, deltaX, deltaY))
      return
    }
    // 旋转优先级最高
    const rotate = rotateStateRef.current
    if (rotate) {
      if (!isRotating) {
        setIsRotating(true)
        beginTransientChange()
      }
      const svgPos = screenToSvg(event.clientX, event.clientY)
      const newRotation = computeRotation(
        rotate.centerX,
        rotate.centerY,
        svgPos.x,
        svgPos.y,
        event.shiftKey
      )
      updateElement(rotate.elementId, { rotation: newRotation })
      return
    }
    // resize 优先于拖拽
    const resize = resizeStateRef.current
    if (resize) {
      if (!isResizing) {
        setIsResizing(true)
        beginTransientChange()
      }
      const svgPos = screenToSvg(event.clientX, event.clientY)
      const handleStart = handlePosition(resize.handle, resize.startBounds)
      const newBounds = computeResizedBounds(
        resize.handle,
        resize.startBounds,
        svgPos.x - handleStart.x,
        svgPos.y - handleStart.y
      )
      updateElement(resize.elementId, { x: newBounds.x, y: newBounds.y, w: newBounds.w, h: newBounds.h })
      return
    }
    const drag = dragStateRef.current
    if (!drag) return
    if (!isDragging) {
      // 第一次实际移动时才开始 transient（避免点击选中也记录历史）
      setIsDragging(true)
      beginTransientChange()
    }

    const svgPos = screenToSvg(event.clientX, event.clientY)
    const dx = svgPos.x - drag.startSvgX
    const dy = svgPos.y - drag.startSvgY

    // 单选拖拽时计算吸附
    let snapDx = 0
    let snapDy = 0
    if (drag.elementStarts.size === 1) {
      const [entry] = drag.elementStarts
      if (entry) {
        const [elId, start] = entry
        const newBounds = { x: start.x + dx, y: start.y + dy, w: 0, h: 0 }
        // 找到原始元素获取 w/h
        const origEl = page.elements.find((e) => e.id === elId)
        if (origEl) {
          newBounds.w = origEl.w
          newBounds.h = origEl.h
          const otherBounds = page.elements
            .filter((e) => !drag.elementStarts.has(e.id))
            .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))
          const snap = computeSnap(newBounds, otherBounds, page.width, page.height)
          snapDx = snap.dx
          snapDy = snap.dy
          setSnapLines(snap.lines)
        }
      }
    }

    for (const [elementId, start] of drag.elementStarts) {
      updateElement(elementId, {
        x: Math.round(start.x + dx + snapDx),
        y: Math.round(start.y + dy + snapDy)
      })
    }
  }

  const handleMouseUp = (): void => {
    panStateRef.current = null
    if (isPanning) setIsPanning(false)
    const wasDragging = dragStateRef.current !== null
    const wasResizing = resizeStateRef.current !== null
    const wasRotating = rotateStateRef.current !== null
    dragStateRef.current = null
    resizeStateRef.current = null
    rotateStateRef.current = null
    if (isDragging) setIsDragging(false)
    if (isResizing) setIsResizing(false)
    if (isRotating) setIsRotating(false)
    if (wasDragging || wasResizing || wasRotating) endTransientChange()
    setSnapLines([])
  }

  const scale = manualScale ?? fitScale

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const next = stepDesignCanvasScale(scale, event.deltaY > 0 ? -1 : 1)
      setManualScale(next)
      return
    }
    setPan((current) => moveDesignCanvasPan(current, -event.deltaX, -event.deltaY))
  }

  const changeScale = (direction: -1 | 1): void => {
    setManualScale(stepDesignCanvasScale(scale, direction))
  }

  const fitCanvas = (): void => {
    setManualScale(null)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      ref={viewportRef}
      className={`ds-no-drag relative min-h-0 flex-1 overflow-hidden bg-ds-subtle/30 ${
        isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onMouseDown={handleViewportMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      <div
        className="absolute left-1/2 top-1/2 shadow-[0_8px_32px_rgba(15,23,42,0.12)]"
        style={{
          lineHeight: 0,
          width: page.width * scale,
          height: page.height * scale,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${page.width} ${page.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            background: formatSvgColor(page.background) ?? '#FFFFFF',
            cursor: isPanning || isDragging ? 'grabbing' : 'grab'
          }}
          onClick={handleBackgroundClick}
        >
          {sortedElements.map((element) => {
            const isSelected = selectedIdSet.has(element.id)
            return (
              <g
                key={element.id}
                onMouseDown={(event) => handleElementMouseDown(element, event)}
                style={{ cursor: element.locked ? 'default' : isDragging ? 'grabbing' : 'grab' }}
              >
                <DesignElementRenderer
                  element={element}
                  assetDataUrl={element.imageAssetId ? assetDataUrls[element.imageAssetId] : undefined}
                />
                {isSelected ? (
                  <SelectionOverlay
                    element={element}
                    showHandles={selectedElementIds.length === 1}
                    onResizeMouseDown={handleResizeMouseDown}
                    onRotateMouseDown={handleRotateMouseDown}
                  />
                ) : null}
              </g>
            )
          })}
          {/* 对齐吸附参考线 */}
          {snapLines.map((line, i) => line.orientation === 'vertical'
            ? <line key={`snap-${i}`} x1={line.position} y1={line.start} x2={line.position} y2={line.end} stroke="#E11D48" strokeWidth={1} strokeDasharray="3 3" style={{ pointerEvents: 'none' }} />
            : <line key={`snap-${i}`} x1={line.start} y1={line.position} x2={line.end} y2={line.position} stroke="#E11D48" strokeWidth={1} strokeDasharray="3 3" style={{ pointerEvents: 'none' }} />
          )}
        </svg>
      </div>
      <div className="ds-no-drag absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-ds-border bg-ds-card/95 p-1 text-ds-muted shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => changeScale(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-ds-hover hover:text-ds-ink"
          title={t('designZoomOut')}
          aria-label={t('designZoomOut')}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
        <span className="min-w-12 text-center text-[11px] tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => changeScale(1)}
          className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-ds-hover hover:text-ds-ink"
          title={t('designZoomIn')}
          aria-label={t('designZoomIn')}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={fitCanvas}
          className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-ds-hover hover:text-ds-ink"
          title={t('designFitCanvas')}
          aria-label={t('designFitCanvas')}
        >
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}

/**
 * 选中元素的蓝色包围框 + 8 向缩放手柄。
 * showHandles=true（单选）时显示手柄；false（多选）只显示包围框。
 */
function SelectionOverlay({
  element,
  showHandles,
  onResizeMouseDown,
  onRotateMouseDown
}: {
  element: DesignElement
  showHandles: boolean
  onResizeMouseDown: (element: DesignElement, handle: ResizeHandle, event: React.MouseEvent) => void
  onRotateMouseDown: (element: DesignElement, event: React.MouseEvent) => void
}): ReactElement {
  const bounds: ElementBounds = { x: element.x, y: element.y, w: element.w, h: element.h }
  const padding = 1
  const transform = element.rotation !== 0
    ? `rotate(${element.rotation} ${element.x + element.w / 2} ${element.y + element.h / 2})`
    : undefined
  const handleSize = 8
  const rotPos = rotationHandlePosition(bounds)

  return (
    <g {...(transform ? { transform } : {})} style={{ pointerEvents: 'none' }}>
      <rect
        x={bounds.x - padding}
        y={bounds.y - padding}
        width={bounds.w + padding * 2}
        height={bounds.h + padding * 2}
        fill="none"
        stroke="#2563EB"
        strokeWidth={1.5}
      />
      {showHandles
        ? (
          <>
            {/* 旋转手柄连接线 */}
            <line
              x1={bounds.x + bounds.w / 2}
              y1={bounds.y - padding}
              x2={rotPos.x}
              y2={rotPos.y}
              stroke="#2563EB"
              strokeWidth={1.5}
            />
            {/* 旋转手柄（圆形） */}
            <circle
              cx={rotPos.x}
              cy={rotPos.y}
              r={handleSize / 2 + 1}
              fill="#FFFFFF"
              stroke="#2563EB"
              strokeWidth={1.5}
              style={{ pointerEvents: 'all', cursor: 'grab' }}
              onMouseDown={(event) => onRotateMouseDown(element, event)}
            />
            {/* 8 向缩放手柄 */}
            {RESIZE_HANDLES.map((handle) => {
              const pos = handlePosition(handle, bounds)
              return (
                <rect
                  key={handle}
                  x={pos.x - handleSize / 2}
                  y={pos.y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  fill="#FFFFFF"
                  stroke="#2563EB"
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'all', cursor: cursorForHandle(handle) }}
                  onMouseDown={(event) => onResizeMouseDown(element, handle, event)}
                />
              )
            })}
          </>
        )
        : null}
    </g>
  )
}
