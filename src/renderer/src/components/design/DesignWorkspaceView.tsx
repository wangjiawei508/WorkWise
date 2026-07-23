import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import {
  Circle,
  Download,
  Copy,
  Group,
  ImagePlus,
  Loader2,
  Minus,
  Palette,
  Plus,
  MousePointer2,
  Redo2,
  Share2,
  Sparkles,
  Shapes,
  Square,
  Trash2,
  Type,
  Ungroup,
  Undo2,
  Upload
} from 'lucide-react'
import { SidebarTitlebarToggleButton } from '../sidebar/SidebarPrimitives'
import { useDesignWorkspaceStore, type DesignTool } from '../../design/design-workspace-store'
import {
  designExportFileStem,
  designPageToPngBase64,
  designPageToSvg,
  encodeUtf8Base64
} from '../../design/design-export'
import { insertDesignMarkdownIntoWrite } from '../../design/design-write-insertion'
import { useWriteWorkspaceStore } from '../../write/write-workspace-store'
import { parsePresetPathsFromSvg } from '@shared/design-svg-parser'
import { DesignCanvas } from './DesignCanvas'
import { DesignAssistantPanel } from './DesignAssistantPanel'
import { DesignLayersPanel } from './DesignLayersPanel'
import { DesignNewDocumentDialog } from './DesignNewDocumentDialog'
import { DesignPropertiesPanel } from './DesignPropertiesPanel'
import { DesignShapeLibraryPanel } from './DesignShapeLibraryPanel'
import type { DesignCanvasFormat } from '@shared/design-document'
import type { DesignCanvasCommandV1 } from '@shared/design-workspace'
import { useChatStore } from '../../store/chat-store'

type Props = {
  leftSidebarCollapsed: boolean
  onToggleLeftSidebar: () => void
  onOpenWrite: () => void
  workspaceRoot: string
}

const TOOL_BUTTONS: ReadonlyArray<{ tool: DesignTool; icon: typeof Square; labelKey: string }> = [
  { tool: 'select', icon: MousePointer2, labelKey: 'designToolSelect' },
  { tool: 'rect', icon: Square, labelKey: 'designToolRect' },
  { tool: 'ellipse', icon: Circle, labelKey: 'designToolEllipse' },
  { tool: 'line', icon: Minus, labelKey: 'designToolLine' },
  { tool: 'text', icon: Type, labelKey: 'designToolText' }
]

function canvasCommandFromMeta(meta: Record<string, unknown> | undefined): DesignCanvasCommandV1 | null {
  const candidate = meta?.designCanvasCommand
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    (candidate as Record<string, unknown>).schema !== 'workwise.design.command' ||
    (candidate as Record<string, unknown>).version !== 1
  ) {
    return null
  }
  return candidate as DesignCanvasCommandV1
}

/**
 * Design 工作区主组件。
 *
 * Design 画布、属性、图层和导出工作台。
 * Design 工作台已接通持久化、单一运行时助手、Write、PPTX、PNG 与 SVG。
 *
 * 架构详见 docs/DESIGN_WORKSPACE_ARCHITECTURE.md。
 */
export function DesignWorkspaceView({
  leftSidebarCollapsed,
  onToggleLeftSidebar,
  onOpenWrite,
  workspaceRoot
}: Props): ReactElement {
  const { t } = useTranslation('common')
  const {
    document,
    activeTool,
    createNewDocument,
    addDefaultElement,
    removeSelectedElements,
    setActiveTool,
    selectedElementIds,
    undo,
    redo,
    historyUndoCount,
    historyRedoCount,
    activePageId,
    addPage,
    removePage,
    setActivePage
    ,
    persistedRevision,
    saveState,
    saveError,
    markSaving,
    markSaved,
    markSaveError,
    closeDocument,
    loadDocument,
    assetDataUrls,
    setAssetDataUrl,
    addImageAsset,
    groupSelectedElements,
    ungroupSelectedElements,
    duplicateSelectedElements,
    applyCanvasCommand
  } = useDesignWorkspaceStore(
    useShallow((s) => ({
      document: s.document,
      activeTool: s.activeTool,
      createNewDocument: s.createNewDocument,
      addDefaultElement: s.addDefaultElement,
      removeSelectedElements: s.removeSelectedElements,
      setActiveTool: s.setActiveTool,
      selectedElementIds: s.selectedElementIds,
      undo: s.undo,
      redo: s.redo,
      historyUndoCount: s.history.undoStack.length,
      historyRedoCount: s.history.redoStack.length,
      activePageId: s.activePageId,
      addPage: s.addPage,
      removePage: s.removePage,
      setActivePage: s.setActivePage
      ,
      persistedRevision: s.persistedRevision,
      saveState: s.saveState,
      saveError: s.saveError,
      markSaving: s.markSaving,
      markSaved: s.markSaved,
      markSaveError: s.markSaveError,
      closeDocument: s.closeDocument,
      loadDocument: s.loadDocument,
      assetDataUrls: s.assetDataUrls,
      setAssetDataUrl: s.setAssetDataUrl,
      addImageAsset: s.addImageAsset,
      groupSelectedElements: s.groupSelectedElements,
      ungroupSelectedElements: s.ungroupSelectedElements,
      duplicateSelectedElements: s.duplicateSelectedElements,
      applyCanvasCommand: s.applyCanvasCommand
    }))
  )
  const runtimeBlocks = useChatStore((state) => state.blocks)

  const handleToolClick = (tool: DesignTool): void => {
    if (tool === 'select') {
      setActiveTool('select')
    } else {
      // 点击元素工具直接添加该类型元素（简化交互，A5 改为画布拖拽创建）
      addDefaultElement(tool)
      setActiveTool('select')
    }
  }

  const [newDocDialogOpen, setNewDocDialogOpen] = useState(false)
  const [exporting, setExporting] = useState<'pptx' | 'png' | 'svg' | 'write' | null>(null)
  const [importing, setImporting] = useState(false)
  const [importingImage, setImportingImage] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [presetShapes, setPresetShapes] = useState<string[]>([])
  const [presetPanelOpen, setPresetPanelOpen] = useState(false)
  const [presetSearch, setPresetSearch] = useState('')
  const [renderingPreset, setRenderingPreset] = useState(false)
  const [operationNotice, setOperationNotice] = useState<{
    tone: 'success' | 'warning' | 'error'
    message: string
  } | null>(null)
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const restoreGenerationRef = useRef(0)
  const processedCanvasCommandsRef = useRef(new Set<string>())
  const canvasCommandBridgeInitializedRef = useRef(false)
  const [assistantCommandNotice, setAssistantCommandNotice] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  const flushDesignSave = useCallback((): Promise<boolean> => {
    const operation = saveQueueRef.current
      .catch(() => false)
      .then(async () => {
        const state = useDesignWorkspaceStore.getState()
        const currentDocument = state.document
        const currentPageId = state.activePageId
        if (!workspaceRoot || !currentDocument || !currentPageId) return true
        if (
          state.persistedRevision !== null &&
          state.persistedRevision === currentDocument.revision
        ) {
          return true
        }
        if (typeof window.workwise?.saveDesignDocument !== 'function') {
          state.markSaveError(t('designSaveUnavailable'))
          return false
        }
        state.markSaving()
        const result = await window.workwise.saveDesignDocument({
          workspaceRoot,
          document: currentDocument,
          activePageId: currentPageId,
          expectedRevision: state.persistedRevision
        })
        if (!result.ok || !result.document) {
          state.markSaveError(result.message || t('designSaveFailed'))
          return false
        }
        state.markSaved(result.document)
        return true
      })
    saveQueueRef.current = operation
    return operation
  }, [t, workspaceRoot])

  useEffect(() => {
    const generation = ++restoreGenerationRef.current
    closeDocument()
    if (!workspaceRoot || typeof window.workwise?.loadDesignDocument !== 'function') return
    setRestoring(true)
    void window.workwise.loadDesignDocument({ workspaceRoot }).then(async (result) => {
      if (generation !== restoreGenerationRef.current) return
      if (result.ok && result.document) {
        loadDocument(result.document, {
          activePageId: result.activePageId,
          persistedRevision: result.revision ?? result.document.revision
        })
        await Promise.all(result.document.assets.map(async (asset) => {
          const assetResult = await window.workwise.readDesignAsset({
            workspaceRoot,
            documentId: result.document!.id,
            asset
          })
          if (
            generation === restoreGenerationRef.current &&
            assetResult.ok &&
            assetResult.dataUrl
          ) {
            setAssetDataUrl(asset.id, assetResult.dataUrl)
          }
        }))
      } else if (result.code !== 'not_found') {
        setOperationNotice({
          tone: 'error',
          message: result.message || t('designRestoreFailed')
        })
      }
    }).catch((error) => {
      if (generation === restoreGenerationRef.current) {
        setOperationNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
      }
    }).finally(() => {
      if (generation === restoreGenerationRef.current) setRestoring(false)
    })
    return () => {
      restoreGenerationRef.current += 1
    }
  }, [closeDocument, loadDocument, setAssetDataUrl, t, workspaceRoot])

  useEffect(() => {
    if (
      restoring ||
      !document ||
      !activePageId ||
      (persistedRevision !== null && persistedRevision === document.revision)
    ) return
    const timer = window.setTimeout(() => {
      void flushDesignSave()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [
    activePageId,
    document,
    flushDesignSave,
    persistedRevision,
    restoring
  ])

  useEffect(() => {
    const commands = runtimeBlocks
      .filter((block) => block.kind === 'tool')
      .map((block) => canvasCommandFromMeta(block.meta))
      .filter((command): command is DesignCanvasCommandV1 => command !== null)

    if (!canvasCommandBridgeInitializedRef.current) {
      for (const command of commands) {
        processedCanvasCommandsRef.current.add(command.idempotencyKey)
      }
      canvasCommandBridgeInitializedRef.current = true
      return
    }

    for (const command of commands) {
      if (processedCanvasCommandsRef.current.has(command.idempotencyKey)) continue
      processedCanvasCommandsRef.current.add(command.idempotencyKey)
      const ack = applyCanvasCommand(command, workspaceRoot)
      if (ack.ok) {
        setAssistantCommandNotice({
          tone: 'success',
          message: t('designAssistantApplied', { count: ack.appliedOperations })
        })
        void flushDesignSave()
      } else {
        setAssistantCommandNotice({
          tone: 'error',
          message: ack.message || t('designAssistantApplyFailed')
        })
      }
    }
  }, [applyCanvasCommand, flushDesignSave, runtimeBlocks, t, workspaceRoot])

  const handleImportImage = async (): Promise<void> => {
    const currentDocument = useDesignWorkspaceStore.getState().document
    if (
      importingImage ||
      !workspaceRoot ||
      !currentDocument ||
      typeof window.workwise?.importDesignImageAsset !== 'function'
    ) return
    setImportingImage(true)
    try {
      const result = await window.workwise.importDesignImageAsset({
        workspaceRoot,
        documentId: currentDocument.id
      })
      if (result.ok && result.asset && result.dataUrl) {
        addImageAsset(result.asset, result.dataUrl)
      } else if (!result.canceled) {
        setOperationNotice({
          tone: 'error',
          message: result.message || t('designImageImportFailed')
        })
      }
    } catch (error) {
      setOperationNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setImportingImage(false)
    }
  }

  // 加载预设形状列表（首次打开面板时）
  const loadPresetShapes = async (): Promise<void> => {
    if (presetShapes.length > 0) return
    if (typeof window.workwise?.listPresetShapes !== 'function') return
    const shapes = await window.workwise.listPresetShapes()
    setPresetShapes(shapes)
  }

  // 插入预设形状到画布中心
  const handleInsertPreset = async (presetName: string): Promise<void> => {
    if (renderingPreset) return
    if (typeof window.workwise?.renderPresetShape !== 'function') return
    setRenderingPreset(true)
    try {
      const page = useDesignWorkspaceStore.getState().getActivePage()
      const cx = page ? Math.round(page.width / 2 - 100) : 540
      const cy = page ? Math.round(page.height / 2 - 75) : 285
      const result = await window.workwise.renderPresetShape({
        presetName,
        x: 0, y: 0, w: 200, h: 150,
        fill: '#1E3A5F'
      })
      if (result.ok && result.svg) {
        const presetPaths = parsePresetPathsFromSvg(result.svg)
        const pathData = presetPaths[0]?.d ?? ''
        if (presetPaths.length === 0) {
          setOperationNotice({ tone: 'error', message: t('designPresetInsertFailed') })
          return
        }
        useDesignWorkspaceStore.getState().addDefaultElement('preset')
        // 更新刚添加的元素
        const state = useDesignWorkspaceStore.getState()
        const elements = state.getActivePage()?.elements ?? []
        const last = elements[elements.length - 1]
        if (last) {
          state.updateElement(last.id, {
            presetName,
            pathData,
            presetPaths,
            w: 200,
            h: 150,
            x: cx,
            y: cy
          })
        }
      } else {
        setOperationNotice({
          tone: 'error',
          message: result.message || t('designPresetInsertFailed')
        })
      }
    } catch (error) {
      setOperationNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setRenderingPreset(false)
    }
  }

  // 导入 PPTX
  const handleImportPptx = async (): Promise<void> => {
    if (importing) return
    if (typeof window.workwise?.importPptxToDesign !== 'function') return
    setImporting(true)
    try {
      const result = await window.workwise.importPptxToDesign({ workspaceRoot })
      if (result.ok && result.document) {
        loadDocument(result.document, {
          activePageId: result.activePageId,
          persistedRevision: null
        })
        await Promise.all(result.document.assets.map(async (asset) => {
          const assetResult = await window.workwise.readDesignAsset({
            workspaceRoot,
            documentId: result.document!.id,
            asset
          })
          if (assetResult.ok && assetResult.dataUrl) {
            setAssetDataUrl(asset.id, assetResult.dataUrl)
          }
        }))
        if (result.warnings?.length) {
          setOperationNotice({
            tone: 'warning',
            message: `${t('designImportWarnings', { count: result.warnings.length })} ${
              result.warnings.slice(0, 3).map((warning) => warning.message).join(' ')
            }`
          })
        }
      } else if (!result.canceled) {
        setOperationNotice({
          tone: 'error',
          message: result.message || t('designImportFailed')
        })
      }
    } catch (error) {
      setOperationNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setImporting(false)
    }
  }

  // 导出 PPTX
  const handleExportPptx = async (): Promise<void> => {
    if (!document || exporting !== null) return
    if (typeof window.workwise?.exportDesignToPptx !== 'function') return
    setExporting('pptx')
    try {
      if (!(await flushDesignSave())) return
      const result = await window.workwise.exportDesignToPptx({
        name: document.name,
        workspaceRoot,
        document: document as unknown as Record<string, unknown>
      })
      if (!result.ok) {
        // 用户取消或失败（静默处理取消）
        if (!result.message?.includes('cancel')) {
          setOperationNotice({
            tone: 'error',
            message: result.message || t('designExportFailed')
          })
        }
      } else {
        setOperationNotice({ tone: 'success', message: t('designExportPptxSuccess') })
      }
    } catch (error) {
      setOperationNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExportImage = async (format: 'png' | 'svg'): Promise<void> => {
    if (!document || exporting !== null) return
    const page = useDesignWorkspaceStore.getState().getActivePage()
    if (!page) return
    setExporting(format)
    try {
      if (!(await flushDesignSave())) return
      const dataBase64 = format === 'svg'
        ? encodeUtf8Base64(designPageToSvg(page, assetDataUrls))
        : await designPageToPngBase64(page, assetDataUrls)
      const pageIndex = Math.max(0, document.pages.findIndex((item) => item.id === page.id))
      const suggestedName = `${designExportFileStem(document.name)}-${pageIndex + 1}.${format}`
      const result = await window.workwise.saveWorkspaceFileAs({
        suggestedName,
        dataBase64,
        mimeType: format === 'svg' ? 'image/svg+xml' : 'image/png'
      })
      if (result.ok) {
        setOperationNotice({
          tone: 'success',
          message: t('designExportImageSuccess', { format: format.toUpperCase() })
        })
      } else if (!result.canceled) {
        setOperationNotice({ tone: 'error', message: result.message })
      }
    } catch (error) {
      setOperationNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setExporting(null)
    }
  }

  const handleInsertIntoWrite = async (): Promise<void> => {
    if (!document || exporting !== null) return
    const page = useDesignWorkspaceStore.getState().getActivePage()
    const writeSnapshot = useWriteWorkspaceStore.getState()
    if (
      !page ||
      !writeSnapshot.workspaceRoot ||
      !writeSnapshot.activeFilePath ||
      writeSnapshot.activeFileKind !== 'text' ||
      writeSnapshot.fileTruncated
    ) {
      setOperationNotice({ tone: 'error', message: t('designWriteDocumentRequired') })
      return
    }

    setExporting('write')
    try {
      if (!(await flushDesignSave())) return
      const cleanupAsset = async (path: string): Promise<void> => {
        await window.workwise.deleteWorkspaceEntry({
          workspaceRoot: writeSnapshot.workspaceRoot,
          path
        }).catch(() => undefined)
      }
      const dataBase64 = await designPageToPngBase64(page, assetDataUrls)
      const result = await window.workwise.saveDesignAssetToWrite({
        workspaceRoot: writeSnapshot.workspaceRoot,
        currentFilePath: writeSnapshot.activeFilePath,
        fileName: `${designExportFileStem(document.name)}-${designExportFileStem(page.name)}.png`,
        dataBase64
      })
      if (!result.ok) {
        setOperationNotice({ tone: 'error', message: result.message })
        return
      }

      const latest = useWriteWorkspaceStore.getState()
      if (
        latest.workspaceRoot !== writeSnapshot.workspaceRoot ||
        latest.activeFilePath !== writeSnapshot.activeFilePath ||
        latest.activeFileKind !== 'text' ||
        latest.fileContent !== writeSnapshot.fileContent
      ) {
        await cleanupAsset(result.path)
        setOperationNotice({ tone: 'error', message: t('designWriteDocumentChanged') })
        return
      }
      const altText = (page.name || document.name).replaceAll(']', '\\]')
      const reference = `![${altText}](${result.markdownPath})`
      const insertion = insertDesignMarkdownIntoWrite(
        latest.fileContent,
        writeSnapshot.selection,
        reference
      )
      if (!insertion.ok) {
        await cleanupAsset(result.path)
        setOperationNotice({ tone: 'error', message: t('designWriteDocumentChanged') })
        return
      }
      latest.setFileContent(insertion.content)
      const saved = await latest.flushSave(writeSnapshot.workspaceRoot)
      if (!saved) {
        latest.setFileContent(writeSnapshot.fileContent)
        latest.setFileError(null)
        await cleanupAsset(result.path)
        setOperationNotice({ tone: 'error', message: t('designWriteSaveFailed') })
        return
      }
      await latest.refreshWorkspace(writeSnapshot.workspaceRoot)
      setOperationNotice({ tone: 'success', message: t('designWriteInsertSuccess') })
      onOpenWrite()
    } catch (error) {
      setOperationNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setExporting(null)
    }
  }

  // 键盘快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!document) return
      // 只在焦点不在 input/textarea 时响应（避免与文字编辑冲突）
      const target = event.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z'
      const isRedo = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z'
      const isRedoY = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'y'
      if (isUndo) {
        event.preventDefault()
        undo()
      } else if (isRedo || isRedoY) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [document, undo, redo])
  const [sidebarTab, setSidebarTab] = useState<'assistant' | 'properties' | 'layers' | 'shapes'>('assistant')

  // 右侧面板：属性/图层切换
  const DesignSidebarPanel = (): ReactElement => (
    <>
      <div className="flex shrink-0 border-b border-ds-border-muted">
        <button
          type="button"
          onClick={() => setSidebarTab('assistant')}
          className={`flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-medium transition ${
            sidebarTab === 'assistant'
              ? 'border-b-2 border-accent text-accent'
              : 'text-ds-faint hover:text-ds-ink'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
          {t('designAssistant')}
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('properties')}
          className={`flex-1 py-2 text-[12px] font-medium transition ${
            sidebarTab === 'properties'
              ? 'border-b-2 border-accent text-accent'
              : 'text-ds-faint hover:text-ds-ink'
          }`}
        >
          {t('designProperties')}
        </button>
        <button
          type="button"
          onClick={() => setSidebarTab('layers')}
          className={`flex-1 py-2 text-[12px] font-medium transition ${
            sidebarTab === 'layers'
              ? 'border-b-2 border-accent text-accent'
              : 'text-ds-faint hover:text-ds-ink'
          }`}
        >
          {t('designLayers')}
        </button>
        <button
          type="button"
          onClick={() => {
            void loadPresetShapes()
            setSidebarTab('shapes')
          }}
          className={`flex-1 py-2 text-[12px] font-medium transition ${
            sidebarTab === 'shapes'
              ? 'border-b-2 border-accent text-accent'
              : 'text-ds-faint hover:text-ds-ink'
          }`}
        >
          {t('designShapeLibraryTab')}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {sidebarTab === 'assistant'
          ? document && useDesignWorkspaceStore.getState().getActivePage()
            ? (
                <DesignAssistantPanel
                  document={document}
                  page={useDesignWorkspaceStore.getState().getActivePage()!}
                  selectedElementIds={selectedElementIds}
                  commandNotice={assistantCommandNotice}
                />
              )
            : null
          : sidebarTab === 'properties'
          ? <DesignPropertiesPanel />
          : sidebarTab === 'layers'
            ? <DesignLayersPanel />
            : <DesignShapeLibraryPanel presetShapes={presetShapes} onInsertPreset={handleInsertPreset} />}
      </div>
    </>
  )

  // 底部页面导航条：显示页面缩略条 + 增删
  const DesignPageBar = (): ReactElement => {
    const allPages = document?.pages ?? []
    return (
      <div className="flex h-10 shrink-0 items-center gap-1 border-t border-ds-border-muted bg-ds-card/95 px-2">
        <button
          type="button"
          onClick={() => addPage()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink"
          title={t('designAddPage')}
          aria-label={t('designAddPage')}
        >
          <Plus className="h-4 w-4" strokeWidth={1.85} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {allPages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setActivePage(page.id)}
              className={`flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11.5px] transition ${
                page.id === activePageId
                  ? 'bg-accent/15 text-accent'
                  : 'text-ds-faint hover:bg-ds-hover/50 hover:text-ds-ink'
              }`}
              title={page.name}
            >
              <span className="font-mono opacity-60">{index + 1}</span>
              <span className="max-w-[80px] truncate">{page.name}</span>
            </button>
          ))}
        </div>
        {allPages.length > 1 ? (
          <button
            type="button"
            onClick={() => activePageId && removePage(activePageId)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ds-faint transition hover:bg-red-500/10 hover:text-red-600"
            title={t('designRemovePage')}
            aria-label={t('designRemovePage')}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.85} />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ds-main">
      {/* 顶栏 */}
      <header className="ds-no-drag flex h-12 shrink-0 items-center gap-2 border-b border-ds-border-muted px-3">
        {leftSidebarCollapsed ? (
          <SidebarTitlebarToggleButton
            onClick={onToggleLeftSidebar}
            title={t('sidebarExpand')}
            ariaLabel={t('sidebarExpand')}
          />
        ) : null}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
          <Palette className="h-[18px] w-[18px]" strokeWidth={1.85} />
        </span>
        <span className="truncate text-[15px] font-semibold text-ds-ink">{t('design')}</span>
        {document ? (
          <span className="ml-2 truncate text-[13px] text-ds-faint">{document.name}</span>
        ) : null}
        <span
          className={`ml-auto text-[11px] ${
            saveState === 'error' ? 'text-red-600' : 'text-ds-faint'
          }`}
          title={saveError ?? undefined}
        >
          {restoring
            ? t('designRestoring')
            : saveState === 'saving'
              ? t('designSaving')
              : saveState === 'error'
                ? t('designSaveFailed')
                : saveState === 'saved'
                  ? t('designSaved')
                  : ''}
        </span>
      </header>

      {!document && restoring ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-ds-faint">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.8} />
        </div>
      ) : !document ? (
        /* 无文档：新建引导 */
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
              <Palette className="h-8 w-8 text-accent" strokeWidth={1.6} />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-ds-ink">{t('designEmptyTitle')}</h2>
            <p className="mb-6 text-[13px] leading-relaxed text-ds-faint">{t('designEmptyHint')}</p>
            <button
              type="button"
              onClick={() => setNewDocDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" strokeWidth={1.9} />
              {t('designNewDocument')}
            </button>
          </div>
        </div>
      ) : (
        /* 有文档：工具栏 + 画布 */
        <>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-ds-border-muted px-3">
            {TOOL_BUTTONS.map(({ tool, icon: Icon, labelKey }) => (
              <button
                key={tool}
                type="button"
                onClick={() => handleToolClick(tool)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                  activeTool === tool
                    ? 'bg-accent/15 text-accent'
                    : 'text-ds-faint hover:bg-ds-hover/60 hover:text-ds-ink'
                }`}
                title={t(labelKey)}
                aria-label={t(labelKey)}
              >
                <Icon className="h-4 w-4" strokeWidth={1.85} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => void handleImportImage()}
              disabled={importingImage}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-40"
              title={t('designImportImage')}
              aria-label={t('designImportImage')}
            >
              {importingImage
                ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.85} />
                : <ImagePlus className="h-4 w-4" strokeWidth={1.85} />}
            </button>
            <div className="mx-1 h-5 w-px bg-ds-border-muted" />
            <button
              type="button"
              onClick={() => { void loadPresetShapes(); setPresetPanelOpen((v) => !v) }}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                presetPanelOpen ? 'bg-accent/15 text-accent' : 'text-ds-faint hover:bg-ds-hover/60 hover:text-ds-ink'
              }`}
              title={t('designPresetShapes')}
              aria-label={t('designPresetShapes')}
            >
              <Shapes className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <button
              type="button"
              onClick={groupSelectedElements}
              disabled={selectedElementIds.length < 2}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-30"
              title={t('designGroup')}
              aria-label={t('designGroup')}
            >
              <Group className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <button
              type="button"
              onClick={ungroupSelectedElements}
              disabled={selectedElementIds.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-30"
              title={t('designUngroup')}
              aria-label={t('designUngroup')}
            >
              <Ungroup className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <button
              type="button"
              onClick={duplicateSelectedElements}
              disabled={selectedElementIds.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-30"
              title={t('designDuplicateSelected')}
              aria-label={t('designDuplicateSelected')}
            >
              <Copy className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <button
              type="button"
              onClick={() => void removeSelectedElements()}
              disabled={selectedElementIds.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              title={t('designDeleteSelected')}
              aria-label={t('designDeleteSelected')}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <div className="mx-1 h-5 w-px bg-ds-border-muted" />
            <button
              type="button"
              onClick={undo}
              disabled={historyUndoCount === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-30"
              title={t('designUndo')}
              aria-label={t('designUndo')}
            >
              <Undo2 className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={historyRedoCount === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-30"
              title={t('designRedo')}
              aria-label={t('designRedo')}
            >
              <Redo2 className="h-4 w-4" strokeWidth={1.85} />
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => void handleImportPptx()}
                disabled={importing}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink disabled:cursor-not-allowed disabled:opacity-40"
                title={t('designImportPptx')}
                aria-label={t('designImportPptx')}
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.85} /> : <Upload className="h-3.5 w-3.5" strokeWidth={1.85} />}
                <span className="text-[12px]">{t('designImportPptx')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportPptx()}
                disabled={exporting !== null}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-ds-faint transition hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                title={t('designExportPptx')}
                aria-label={t('designExportPptx')}
              >
                {exporting === 'pptx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.85} /> : <Download className="h-3.5 w-3.5" strokeWidth={1.85} />}
                <span className="text-[12px]">{t('designExportPptx')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportImage('png')}
                disabled={exporting !== null}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-ds-faint transition hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                title={t('designExportPng')}
                aria-label={t('designExportPng')}
              >
                {exporting === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.85} /> : <Download className="h-3.5 w-3.5" strokeWidth={1.85} />}
                <span className="text-[12px]">PNG</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportImage('svg')}
                disabled={exporting !== null}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-ds-faint transition hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                title={t('designExportSvg')}
                aria-label={t('designExportSvg')}
              >
                {exporting === 'svg' ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.85} /> : <Download className="h-3.5 w-3.5" strokeWidth={1.85} />}
                <span className="text-[12px]">SVG</span>
              </button>
              <button
                type="button"
                onClick={() => void handleInsertIntoWrite()}
                disabled={exporting !== null}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-ds-faint transition hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                title={t('designInsertWrite')}
                aria-label={t('designInsertWrite')}
              >
                {exporting === 'write' ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.85} /> : <Share2 className="h-3.5 w-3.5" strokeWidth={1.85} />}
                <span className="text-[12px]">{t('designInsertWrite')}</span>
              </button>
              <button
                type="button"
                onClick={() => setNewDocDialogOpen(true)}
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-ds-faint transition hover:bg-ds-hover/60 hover:text-ds-ink"
                title={t('designNewDocument')}
                aria-label={t('designNewDocument')}
              >
                <Plus className="h-4 w-4" strokeWidth={1.85} />
                <span className="text-[12px]">{t('designNew')}</span>
              </button>
            </div>
          </div>
          {operationNotice ? (
            <div
              role={operationNotice.tone === 'error' ? 'alert' : 'status'}
              className={`flex min-h-8 shrink-0 items-center justify-between border-b px-3 text-[12px] ${
                operationNotice.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : operationNotice.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <span className="truncate">{operationNotice.message}</span>
              <button
                type="button"
                onClick={() => setOperationNotice(null)}
                className="ml-3 shrink-0 font-medium opacity-70 hover:opacity-100"
              >
                {t('close')}
              </button>
            </div>
          ) : null}
          {/* 预设形状面板（可折叠） */}
          {presetPanelOpen ? (
            <div className="flex max-h-48 shrink-0 flex-col border-b border-ds-border-muted bg-ds-card/95">
              <div className="flex items-center gap-2 border-b border-ds-border-muted px-3 py-1.5">
                <input
                  type="text"
                  value={presetSearch}
                  onChange={(e) => setPresetSearch(e.target.value)}
                  placeholder={t('designPresetSearch')}
                  className="min-w-0 flex-1 rounded-md border border-ds-border bg-ds-card px-2 py-1 text-[12px] text-ds-ink outline-none focus:border-accent"
                />
                <span className="text-[11px] text-ds-faint">{presetShapes.length}</span>
              </div>
              <div className="flex flex-wrap content-start gap-1 overflow-y-auto p-2">
                {presetShapes
                  .filter((name) => !presetSearch || name.toLowerCase().includes(presetSearch.toLowerCase()))
                  .slice(0, 60)
                  .map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => void handleInsertPreset(name)}
                      disabled={renderingPreset}
                      className="rounded-md border border-ds-border bg-ds-card px-2 py-1 text-[11px] text-ds-faint transition hover:border-accent hover:text-accent disabled:opacity-40"
                    >
                      {name}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
          {/* 画布 + 右侧面板（属性/图层） */}
          <div className="flex min-h-0 flex-1">
            <DesignCanvas />
            {/* 右侧面板区：切换属性/图层 */}
            <div className="flex w-72 shrink-0 flex-col border-l border-ds-border-muted bg-ds-card/95">
              <DesignSidebarPanel />
            </div>
          </div>
          {/* 底部页面导航条 */}
          <DesignPageBar />
        </>
      )}

      <DesignNewDocumentDialog
        open={newDocDialogOpen}
        onClose={() => setNewDocDialogOpen(false)}
        onCreate={(options) => {
          createNewDocument({
            name: options.name,
            format: options.format as DesignCanvasFormat,
            customSize: options.customSize
          })
          setNewDocDialogOpen(false)
        }}
      />
    </div>
  )
}
