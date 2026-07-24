import type { DesignCanvasCommandV1 } from '@shared/design-workspace'

export type ActiveDesignCanvasTarget = {
  workspaceRoot: string
  documentId: string
  pageId: string
}

export function selectActiveCanvasCommandForLatestRequest(
  commands: DesignCanvasCommandV1[],
  target: ActiveDesignCanvasTarget
): {
  command: DesignCanvasCommandV1 | null
  ignoredCommandIds: string[]
} {
  const activeCommandIndex = commands.findIndex((command) =>
    command.workspaceRoot === target.workspaceRoot &&
    command.documentId === target.documentId &&
    command.pageId === target.pageId
  )
  if (activeCommandIndex < 0) {
    return {
      command: null,
      ignoredCommandIds: commands.map((command) => command.idempotencyKey)
    }
  }
  return {
    command: commands[activeCommandIndex],
    ignoredCommandIds: commands
      .filter((_, index) => index !== activeCommandIndex)
      .map((command) => command.idempotencyKey)
  }
}
