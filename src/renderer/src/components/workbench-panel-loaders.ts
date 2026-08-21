export const builtinRightPanelLoaders = {
  'sdd-ai': () => import('./sdd/SddAssistantPanel'),
  'write-assistant': () => import('./write/WriteAssistantPanel')
} as const
