export type WorkbenchTabDescriptor<Context, Module, Rendered> = {
  id: string
  order: number
  single: boolean
  dedupeKey: (context: Context) => string
  availability: (context: Context) => boolean
  load: () => Promise<Module>
  render: (module: Module, context: Context) => Rendered
  onOpen: (context: Context) => void
  onClose: (context: Context) => void
}

export type FileViewerInput = {
  fileName: string
  bytes?: Uint8Array
}

export type FileViewerDescriptor<Context, Module, Rendered> = {
  id: string
  priority: number
  extensions: string[]
  sniff: (input: FileViewerInput) => boolean
  load: () => Promise<Module>
  render: (module: Module, context: Context) => Rendered
}

export class WorkbenchRegistry<TabContext, ViewerContext, Rendered = unknown> {
  private readonly tabs = new Map<string, WorkbenchTabDescriptor<TabContext, unknown, Rendered>>()
  private readonly viewers = new Map<string, FileViewerDescriptor<ViewerContext, unknown, Rendered>>()
  private readonly loads = new Map<string, Promise<unknown>>()
  private readonly activeTabs = new Map<string, {
    count: number
    context: TabContext
    onClose: (context: TabContext) => void
  }>()

  registerTab<Module>(descriptor: WorkbenchTabDescriptor<TabContext, Module, Rendered>): () => void {
    if (this.tabs.has(descriptor.id)) throw new Error(`Duplicate Workbench tab id: ${descriptor.id}`)
    const stored = descriptor as WorkbenchTabDescriptor<TabContext, unknown, Rendered>
    this.tabs.set(descriptor.id, stored)
    return () => {
      if (this.tabs.get(descriptor.id) !== stored) return
      for (const [key, active] of this.activeTabs) {
        if (!key.startsWith(`${descriptor.id}\u0000`)) continue
        active.onClose(active.context)
        this.activeTabs.delete(key)
      }
      this.tabs.delete(descriptor.id)
      this.loads.delete(`tab:${descriptor.id}`)
    }
  }

  registerFileViewer<Module>(descriptor: FileViewerDescriptor<ViewerContext, Module, Rendered>): () => void {
    if (this.viewers.has(descriptor.id)) throw new Error(`Duplicate Workbench viewer id: ${descriptor.id}`)
    const stored = descriptor as FileViewerDescriptor<ViewerContext, unknown, Rendered>
    this.viewers.set(descriptor.id, stored)
    return () => {
      if (this.viewers.get(descriptor.id) !== stored) return
      this.viewers.delete(descriptor.id)
      this.loads.delete(`viewer:${descriptor.id}`)
    }
  }

  resolveTab(context: TabContext): WorkbenchTabDescriptor<TabContext, unknown, Rendered> | null {
    return [...this.tabs.values()]
      .filter((descriptor) => descriptor.availability(context))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))[0] ?? null
  }

  renderTab<Module = unknown>(id: string, module: Module, context: unknown): Rendered {
    const descriptor = this.tabs.get(id)
    if (!descriptor) throw new Error(`Unknown Workbench tab id: ${id}`)
    return descriptor.render(module, context as TabContext)
  }

  resolveFileViewer(input: FileViewerInput): FileViewerDescriptor<ViewerContext, unknown, Rendered> | null {
    const ordered = [...this.viewers.values()]
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
    const sniffed = ordered.find((descriptor) => descriptor.sniff(input))
    if (sniffed) return sniffed
    const extension = input.fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
    return ordered.find((descriptor) => descriptor.extensions.some((candidate) => {
      const normalized = candidate.toLowerCase()
      return normalized.startsWith('.') ? normalized === extension : `.${normalized}` === extension
    })) ?? null
  }

  activateTab(id: string, context: TabContext): () => void {
    const descriptor = this.tabs.get(id)
    if (!descriptor) return () => undefined
    const activationKey = `${id}\u0000${descriptor.single ? 'single' : descriptor.dedupeKey(context)}`
    const existing = this.activeTabs.get(activationKey)
    if (existing) {
      existing.count += 1
    } else {
      descriptor.onOpen(context)
      this.activeTabs.set(activationKey, { count: 1, context, onClose: descriptor.onClose })
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const current = this.activeTabs.get(activationKey)
      if (!current) return
      current.count -= 1
      if (current.count <= 0) {
        current.onClose(current.context)
        this.activeTabs.delete(activationKey)
      }
    }
  }

  loadTab<Module = unknown>(id: string): Promise<Module> {
    const descriptor = this.tabs.get(id)
    if (!descriptor) return Promise.reject(new Error(`Unknown Workbench tab id: ${id}`))
    return this.load(`tab:${id}`, descriptor.load) as Promise<Module>
  }

  loadFileViewer<Module = unknown>(id: string): Promise<Module> {
    const descriptor = this.viewers.get(id)
    if (!descriptor) return Promise.reject(new Error(`Unknown Workbench viewer id: ${id}`))
    return this.load(`viewer:${id}`, descriptor.load) as Promise<Module>
  }

  retry(id: string, kind: 'tab' | 'viewer'): void {
    this.loads.delete(`${kind}:${id}`)
  }

  private load(key: string, loader: () => Promise<unknown>): Promise<unknown> {
    const existing = this.loads.get(key)
    if (existing) return existing
    const pending = loader().catch((error) => {
      this.loads.delete(key)
      throw error
    })
    this.loads.set(key, pending)
    return pending
  }
}
