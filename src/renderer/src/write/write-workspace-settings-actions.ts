import { resolveKunImageGenerationSettings, resolveWriteInlineCompletionApiKey } from '@shared/app-settings'
import { rendererRuntimeClient } from '../agent/runtime-client'
import type { WriteWorkspaceGet, WriteWorkspaceSet, WriteWorkspaceState } from './write-workspace-store-types'
import {
  compactWorkspaceRoots,
  normalizePath,
  normalizeWriteSettings,
  withResolvedInlineCompletionSettings
} from './write-workspace-store-helpers'

type WriteSettingsActions = Pick<
  WriteWorkspaceState,
  'loadWriteSettings' | 'selectWriteWorkspace' | 'addWriteWorkspace' | 'removeWriteWorkspace'
>

type WriteSettingsActionContext = {
  set: WriteWorkspaceSet
  get: WriteWorkspaceGet
}

function applyWriteSettingsState(
  set: WriteWorkspaceSet,
  settings: Awaited<ReturnType<typeof rendererRuntimeClient.getSettings>>
): ReturnType<typeof withResolvedInlineCompletionSettings> {
  const write = withResolvedInlineCompletionSettings(normalizeWriteSettings(settings.write), settings)
  const imageGeneration = resolveKunImageGenerationSettings(settings)
  set({
    defaultWorkspaceRoot: write.defaultWorkspaceRoot,
    workspaceRoots: write.workspaces,
    inlineCompletion: write.inlineCompletion,
    knowledgeBase: write.knowledgeBase,
    inlineCompletionApiReady: Boolean(resolveWriteInlineCompletionApiKey(settings).trim()),
    imageGenReady: Boolean(
      imageGeneration?.enabled &&
      imageGeneration.baseUrl.trim() &&
      imageGeneration.apiKey.trim() &&
      imageGeneration.model.trim()
    ),
    settingsError: null
  })
  return write
}

export function createWriteSettingsActions({ set, get }: WriteSettingsActionContext): WriteSettingsActions {
  let generation = 0
  const beginRequest = (): number => ++generation
  const isCurrent = (token: number): boolean => token === generation
  return {
    loadWriteSettings: async () => {
      const token = beginRequest()
      set({ settingsLoading: true, settingsError: null })
      try {
        const settings = await rendererRuntimeClient.getSettings({ forceRefresh: true })
        if (!isCurrent(token)) return
        const write = applyWriteSettingsState(set, settings)
        set({ settingsLoading: false })
        await get().initializeWorkspace(write.activeWorkspaceRoot)
      } catch (error) {
        if (!isCurrent(token)) return
        set({
          settingsLoading: false,
          settingsError: error instanceof Error ? error.message : String(error)
        })
      }
    },

    selectWriteWorkspace: async (workspaceRoot) => {
      const token = beginRequest()
      const normalized = normalizePath(workspaceRoot)
      if (!normalized) return
      const roots = compactWorkspaceRoots([normalized, ...get().workspaceRoots])
      set({ workspaceRoots: roots })
      try {
        const settings = await rendererRuntimeClient.setSettings({
          write: {
            activeWorkspaceRoot: normalized,
            workspaces: roots
          }
        })
        if (!isCurrent(token)) return
        const write = applyWriteSettingsState(set, settings)
        await get().initializeWorkspace(write.activeWorkspaceRoot)
      } catch (error) {
        if (!isCurrent(token)) return
        set({ settingsError: error instanceof Error ? error.message : String(error) })
      }
    },

    addWriteWorkspace: async (workspaceRoot) => {
      const token = beginRequest()
      const normalized = normalizePath(workspaceRoot)
      if (!normalized) return
      const roots = compactWorkspaceRoots([normalized, ...get().workspaceRoots])
      try {
        const settings = await rendererRuntimeClient.setSettings({
          write: {
            activeWorkspaceRoot: normalized,
            workspaces: roots
          }
        })
        if (!isCurrent(token)) return
        const write = applyWriteSettingsState(set, settings)
        await get().initializeWorkspace(write.activeWorkspaceRoot)
      } catch (error) {
        if (!isCurrent(token)) return
        set({ settingsError: error instanceof Error ? error.message : String(error) })
      }
    },

    removeWriteWorkspace: async (workspaceRoot) => {
      const token = beginRequest()
      const normalized = normalizePath(workspaceRoot)
      if (!normalized) return
      const state = get()
      const fallback = state.defaultWorkspaceRoot ||
        state.workspaceRoots.find((item) => item !== normalized) ||
        state.workspaceRoot
      const roots = compactWorkspaceRoots([
        fallback,
        ...state.workspaceRoots.filter((item) => normalizePath(item) !== normalized)
      ])
      const activeWorkspaceRoot = normalizePath(state.workspaceRoot) === normalized
        ? fallback
        : state.workspaceRoot
      try {
        const settings = await rendererRuntimeClient.setSettings({
          write: {
            activeWorkspaceRoot,
            workspaces: roots
          }
        })
        if (!isCurrent(token)) return
        const write = applyWriteSettingsState(set, settings)
        if (normalizePath(get().workspaceRoot) === normalized) {
          await get().initializeWorkspace(write.activeWorkspaceRoot)
        }
      } catch (error) {
        if (!isCurrent(token)) return
        set({ settingsError: error instanceof Error ? error.message : String(error) })
      }
    }
  }
}
