import { describe, expect, it, vi } from 'vitest'
import { WorkbenchRegistry } from './workbench-registry'

describe('WorkbenchRegistry', () => {
  it('rejects duplicate ids and unregisters with a disposer', () => {
    const registry = new WorkbenchRegistry<{ enabled: boolean }, void>()
    const descriptor = {
      id: 'changes', order: 1, single: true,
      dedupeKey: () => 'changes', availability: (context: { enabled: boolean }) => context.enabled,
      load: async () => 'module', render: () => 'rendered', onOpen: () => undefined, onClose: () => undefined
    }
    const dispose = registry.registerTab(descriptor)
    expect(() => registry.registerTab(descriptor)).toThrow('Duplicate Workbench tab id')
    expect(registry.resolveTab({ enabled: true })?.id).toBe('changes')
    dispose()
    expect(registry.resolveTab({ enabled: true })).toBeNull()
  })

  it('shares in-flight loads and clears failed loads for retry', async () => {
    const registry = new WorkbenchRegistry<void, void>()
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce('module')
    registry.registerTab({
      id: 'plan', order: 1, single: true, dedupeKey: () => 'plan', availability: () => true,
      load, render: () => null, onOpen: () => undefined, onClose: () => undefined
    })
    const first = registry.loadTab('plan')
    expect(registry.loadTab('plan')).toBe(first)
    await expect(first).rejects.toThrow('chunk failed')
    await expect(registry.loadTab('plan')).resolves.toBe('module')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('runs tab open and close lifecycle hooks exactly once per activation', () => {
    const registry = new WorkbenchRegistry<{ route: string }, void>()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    registry.registerTab({
      id: 'plan', order: 1, single: true, dedupeKey: ({ route }) => route,
      availability: () => true, load: async () => null, render: () => null,
      onOpen, onClose
    })
    const context = { route: 'chat' }

    const deactivate = registry.activateTab('plan', context)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith(context)
    deactivate()
    deactivate()

    expect(onClose).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledWith(context)
  })

  it('deduplicates non-single activations by dedupeKey and closes after the last lease', () => {
    const registry = new WorkbenchRegistry<{ route: string }, void>()
    const onOpen = vi.fn()
    const onClose = vi.fn()
    registry.registerTab({
      id: 'preview', order: 1, single: false, dedupeKey: ({ route }) => route,
      availability: () => true, load: async () => null, render: () => null,
      onOpen, onClose
    })

    const first = registry.activateTab('preview', { route: 'same' })
    const second = registry.activateTab('preview', { route: 'same' })
    expect(onOpen).toHaveBeenCalledOnce()
    first()
    expect(onClose).not.toHaveBeenCalled()
    second()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('prefers content sniffing, then stable priority and extension matching', () => {
    const registry = new WorkbenchRegistry<void, void>()
    const base = { load: async () => null, render: () => null }
    registry.registerFileViewer({ id: 'text', priority: 10, extensions: ['txt'], sniff: () => false, ...base })
    registry.registerFileViewer({ id: 'json', priority: 20, extensions: ['json'], sniff: ({ bytes }) => bytes?.[0] === 0x7b, ...base })
    expect(registry.resolveFileViewer({ fileName: 'data.txt', bytes: new Uint8Array([0x7b]) })?.id).toBe('json')
    expect(registry.resolveFileViewer({ fileName: 'notes.txt' })?.id).toBe('text')
  })
})
