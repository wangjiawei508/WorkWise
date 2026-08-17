import { z } from 'zod'

export const AttachmentTextFallback = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  wasCompressed: z.boolean().optional()
}).strict()
export type AttachmentTextFallback = z.infer<typeof AttachmentTextFallback>

export const AttachmentMetadataV1 = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  hash: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  textFallback: AttachmentTextFallback.optional(),
  threadIds: z.array(z.string().min(1)).default([]),
  workspaces: z.array(z.string().min(1)).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()
export type AttachmentMetadataV1 = z.infer<typeof AttachmentMetadataV1>

export const ATTACHMENT_LIMITS_V2 = Object.freeze({
  maxPerTurn: 8,
  maxFileBytes: 200 * 1024 * 1024,
  maxBatchBytes: 500 * 1024 * 1024,
  abandonedImportMaxAgeMs: 24 * 60 * 60 * 1000,
  targetChunkTokens: 1200,
  chunkOverlapTokens: 150,
  maxSearchResults: 20,
  maxSectionCharacters: 24_000
})

export const AttachmentKind = z.enum(['image', 'pdf', 'docx', 'xlsx', 'pptx', 'text', 'markdown', 'csv'])
export type AttachmentKind = z.infer<typeof AttachmentKind>
export const AttachmentState = z.enum(['uploading', 'parsing', 'ready', 'degraded', 'failed', 'cancelled'])
export type AttachmentState = z.infer<typeof AttachmentState>
export const AttachmentIndexState = z.enum(['not_applicable', 'pending', 'ready', 'fallback', 'failed'])
export type AttachmentIndexState = z.infer<typeof AttachmentIndexState>

export const AttachmentParserProvenance = z.object({
  engine: z.enum([
    'image-native',
    'safe-text',
    'document-engine',
    'markitdown',
    'mineru',
    'unlimited-ocr-local',
    'mineru-local',
    'mineru-private'
  ]),
  version: z.string().min(1).optional(),
  local: z.boolean(),
  parsedAt: z.string().optional()
}).strict()

export const AttachmentSourceStructure = z.object({
  pageCount: z.number().int().nonnegative().optional(),
  headings: z.number().int().nonnegative().optional(),
  tables: z.number().int().nonnegative().optional(),
  worksheets: z.array(z.string()).optional(),
  slideCount: z.number().int().nonnegative().optional()
}).strict()

export const AttachmentMetadataV2 = AttachmentMetadataV1.extend({
  schemaVersion: z.literal(2),
  kind: AttachmentKind,
  state: AttachmentState,
  parser: AttachmentParserProvenance.optional(),
  sourceStructure: AttachmentSourceStructure.optional(),
  degradationReasons: z.array(z.string()).default([]),
  parserWarnings: z.array(z.string()).default([]),
  indexState: AttachmentIndexState,
  originalFileName: z.string().min(1),
  managedRelativePath: z.string().min(1).optional(),
  summary: z.string().max(4000).optional(),
  progress: z.number().min(0).max(1).optional()
}).strict()
export type AttachmentMetadataV2 = z.infer<typeof AttachmentMetadataV2>

// Existing image callers keep their source-compatible contract. Stores may
// read V1 and expose it through upgradeAttachmentMetadataV1 without retransmit.
export const AttachmentMetadata = AttachmentMetadataV1
export type AttachmentMetadata = AttachmentMetadataV1

export function upgradeAttachmentMetadataV1(value: AttachmentMetadataV1): AttachmentMetadataV2 {
  return AttachmentMetadataV2.parse({
    ...value,
    schemaVersion: 2,
    kind: 'image',
    state: 'ready',
    parser: { engine: 'image-native', local: true, parsedAt: value.updatedAt },
    degradationReasons: [],
    parserWarnings: [],
    indexState: 'not_applicable',
    originalFileName: value.name,
    progress: 1
  })
}

export const AttachmentSectionProvenance = z.object({
  page: z.number().int().positive().optional(),
  heading: z.string().optional(),
  table: z.string().optional(),
  worksheet: z.string().optional(),
  slide: z.number().int().positive().optional()
}).strict()
export type AttachmentSectionProvenance = z.infer<typeof AttachmentSectionProvenance>

export const AttachmentSectionV1 = z.object({
  id: z.string().min(1),
  attachmentId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  text: z.string(),
  tokenEstimate: z.number().int().nonnegative(),
  provenance: AttachmentSectionProvenance,
  createdAt: z.string()
}).strict()
export type AttachmentSectionV1 = z.infer<typeof AttachmentSectionV1>

export const AttachmentUploadRequest = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  dataBase64: z.string().min(1),
  textFallback: AttachmentTextFallback.optional(),
  threadId: z.string().min(1).optional(),
  workspace: z.string().min(1).optional()
}).strict().refine((value) => Boolean(value.threadId || value.workspace), {
  message: 'threadId or workspace is required'
})
export type AttachmentUploadRequest = z.infer<typeof AttachmentUploadRequest>

export const AttachmentUploadResponse = z.object({
  attachment: AttachmentMetadata
}).strict()
export type AttachmentUploadResponse = z.infer<typeof AttachmentUploadResponse>

export const AttachmentDocumentImportHeadersV1 = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  kind: AttachmentKind.exclude(['image']),
  threadId: z.string().min(1).optional(),
  workspace: z.string().min(1).optional()
}).strict().refine((value) => Boolean(value.threadId || value.workspace), { message: 'threadId or workspace is required' })

export const AttachmentDiagnostics = z.object({
  enabled: z.boolean(),
  rootDir: z.string(),
  count: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative()
}).strict()
export type AttachmentDiagnostics = z.infer<typeof AttachmentDiagnostics>
