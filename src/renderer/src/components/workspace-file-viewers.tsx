import type { WorkspacePreviewResultV1 } from '@shared/agent-workbench'
import type { WorkspaceFileReadResult } from '@shared/workspace-file'
import type { ReactElement } from 'react'
import { WorkbenchRegistry } from './workbench-registry'

type WorkspaceFileReadSuccess = Extract<WorkspaceFileReadResult, { ok: true }>

export type WorkspaceFileViewerContext = {
  richResult: WorkspacePreviewResultV1 | null
  textResult: WorkspaceFileReadSuccess | null
  language: string
  onRequestAccuratePdf?: () => void
}

export const builtinWorkspaceFileViewers = new WorkbenchRegistry<void, WorkspaceFileViewerContext, ReactElement>()

builtinWorkspaceFileViewers.registerFileViewer({
  id: 'rich',
  priority: 100,
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'md', 'markdown', 'txt', 'pdf', 'docx', 'pptx', 'xlsx'],
  sniff: ({ bytes }) => isRichPreviewSignature(bytes),
  load: () => import('./WorkspaceRichPreview'),
  render: (module, context) => {
    if (!context.richResult) throw new Error('Rich file preview data is unavailable.')
    const { WorkspaceRichPreview } = module as typeof import('./WorkspaceRichPreview')
    return <WorkspaceRichPreview result={context.richResult} onRequestAccuratePdf={context.onRequestAccuratePdf} />
  }
})

builtinWorkspaceFileViewers.registerFileViewer({
  id: 'code',
  priority: 10,
  extensions: [
    'txt', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log',
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'sh', 'zsh', 'py',
    'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'sql'
  ],
  sniff: () => false,
  load: () => import('./WorkspaceCodePreview'),
  render: (module, context) => {
    if (!context.textResult) throw new Error('Text file preview data is unavailable.')
    const { WorkspaceCodePreview } = module as typeof import('./WorkspaceCodePreview')
    return <WorkspaceCodePreview result={context.textResult} language={context.language} />
  }
})

export function resolveBuiltinWorkspaceFileViewer(input: {
  fileName: string
  bytes?: Uint8Array
}) {
  return builtinWorkspaceFileViewers.resolveFileViewer(input)
    ?? builtinWorkspaceFileViewers.resolveFileViewer({ fileName: 'fallback.txt' })
}

function isRichPreviewSignature(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.length < 4) return false
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
}
