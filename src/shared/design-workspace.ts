import type { DesignAsset, DesignDocumentV1, DesignElement } from './design-document'

export type DesignFidelityWarningCode =
  | 'unsupported_filter'
  | 'unsupported_mask'
  | 'unsupported_effect'
  | 'flattened_group'
  | 'missing_image'
  | 'font_substitution'
  | 'layout_approximation'

export type DesignFidelityWarning = {
  code: DesignFidelityWarningCode
  message: string
  pageId?: string
  elementId?: string
}

export type DesignDocumentLoadPayload = {
  workspaceRoot: string
  documentId?: string
}

export type DesignDocumentLoadResult = {
  ok: boolean
  document?: DesignDocumentV1
  activePageId?: string
  revision?: number
  code?: 'not_found' | 'corrupt' | 'unsafe_path' | 'read_failed'
  message?: string
}

export type DesignDocumentSavePayload = {
  workspaceRoot: string
  document: DesignDocumentV1
  activePageId: string
  /** null means this is the first durable write for the document. */
  expectedRevision: number | null
}

export type DesignDocumentSaveResult = {
  ok: boolean
  document?: DesignDocumentV1
  revision?: number
  currentRevision?: number
  code?: 'stale_request' | 'invalid_document' | 'unsafe_path' | 'write_failed'
  message?: string
}

export type DesignImageImportPayload = {
  workspaceRoot: string
  documentId: string
}

export type DesignImageImportResult = {
  ok: boolean
  canceled?: boolean
  asset?: DesignAsset
  dataUrl?: string
  message?: string
}

export type DesignAssetReadPayload = {
  workspaceRoot: string
  documentId: string
  asset: DesignAsset
}

export type DesignAssetReadResult = {
  ok: boolean
  dataUrl?: string
  message?: string
}

export type DesignPptxImportPayload = {
  workspaceRoot: string
}

export type DesignPptxImportResult = {
  ok: boolean
  canceled?: boolean
  document?: DesignDocumentV1
  activePageId?: string
  warnings?: DesignFidelityWarning[]
  message?: string
}

export type DesignCanvasOperation =
  | { kind: 'add'; element: DesignElement }
  | { kind: 'update'; elementId: string; patch: Partial<DesignElement> }
  | { kind: 'remove'; elementIds: string[] }
  | { kind: 'group'; elementIds: string[]; name?: string }
  | { kind: 'ungroup'; groupIds: string[] }

export type DesignCanvasCommandV1 = {
  schema: 'workwise.design.command'
  version: 1
  idempotencyKey: string
  workspaceRoot: string
  documentId: string
  pageId: string
  expectedRevision: number
  operations: DesignCanvasOperation[]
}

export type DesignCanvasCommandAckV1 = {
  schema: 'workwise.design.command.ack'
  version: 1
  idempotencyKey: string
  ok: boolean
  documentId: string
  revision: number
  appliedOperations: number
  code?: 'stale_request' | 'document_unavailable' | 'invalid_command' | 'operation_failed'
  message?: string
}
