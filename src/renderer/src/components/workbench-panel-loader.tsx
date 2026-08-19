import {
  Component,
  Fragment,
  Suspense,
  lazy,
  type ErrorInfo,
  type ReactElement,
  type ReactNode
} from 'react'
import { useMemo, useRef, useState } from 'react'

export type WorkbenchPanelRegistry = {
  loadTab: <Module = unknown>(id: string) => Promise<Module>
  loadFileViewer: <Module = unknown>(id: string) => Promise<Module>
  renderTab: <Module = unknown>(id: string, module: Module, context: unknown) => unknown
  retry: (id: string, kind: 'tab' | 'viewer') => void
}

type BoundaryProps = {
  children: ReactNode
  panelId: string
  resetKey: string
  title: string
  retryLabel: string
  onRetry: () => void
}

type BoundaryState = {
  error: Error | null
}

export class WorkbenchPanelErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[WorkbenchPanel:${this.props.panelId}] render failed:`, error, info.componentStack)
    if (typeof window !== 'undefined' && typeof window.workwise?.logError === 'function') {
      void window.workwise.logError('renderer', 'Workbench panel failed', {
        panelId: this.props.panelId,
        name: error.name,
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack
      }).catch(() => undefined)
    }
  }

  override componentDidUpdate(previous: BoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-ds-main px-6 text-center">
        <h2 className="text-[14px] font-semibold text-ds-text-primary">{this.props.title}</h2>
        <p className="mt-2 max-w-md text-[12px] leading-5 text-ds-text-secondary">
          {this.state.error.message}
        </p>
        <button
          type="button"
          className="mt-4 rounded-md border border-ds-border px-3 py-1.5 text-[12px] font-medium text-ds-text-primary hover:bg-ds-hover"
          onClick={this.props.onRetry}
        >
          {this.props.retryLabel}
        </button>
      </div>
    )
  }
}

export function WorkbenchPanelLoader<Module>({
  registry,
  panelId,
  kind = 'tab',
  title,
  retryLabel,
  fallback,
  context,
  children
}: {
  registry: WorkbenchPanelRegistry
  panelId: string
  kind?: 'tab' | 'viewer'
  title: string
  retryLabel: string
  fallback?: ReactNode
  context?: unknown
  children?: (module: Module) => ReactNode
}): ReactElement {
  const [generation, setGeneration] = useState(0)
  const renderRef = useRef(children)
  renderRef.current = children
  const contextRef = useRef(context)
  contextRef.current = context
  const LazyPanel = useMemo(() => lazy(async () => {
    const module = kind === 'viewer'
      ? await registry.loadFileViewer<Module>(panelId)
      : await registry.loadTab<Module>(panelId)
    return {
      default: () => (
        <Fragment key={generation}>
          {renderRef.current
            ? renderRef.current(module)
            : registry.renderTab(panelId, module, contextRef.current) as ReactNode}
        </Fragment>
      )
    }
  }), [generation, kind, panelId, registry])
  const resetKey = `${kind}:${panelId}:${generation}`

  return (
    <WorkbenchPanelErrorBoundary
      panelId={panelId}
      resetKey={resetKey}
      title={title}
      retryLabel={retryLabel}
      onRetry={() => {
        registry.retry(panelId, kind)
        setGeneration((current) => current + 1)
      }}
    >
      <Suspense fallback={fallback ?? <div className="h-full w-full bg-ds-main" />}>
        <LazyPanel />
      </Suspense>
    </WorkbenchPanelErrorBoundary>
  )
}
