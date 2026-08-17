import { z } from 'zod'

const relativeWorkspacePath = z.string().trim().min(1).max(4096).superRefine((value, ctx) => {
  const normalized = value.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized)) {
    ctx.addIssue({ code: 'custom', message: 'path must be relative to the workspace' })
  }
  if (normalized.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')) {
    ctx.addIssue({ code: 'custom', message: 'path must not escape the workspace' })
  }
  if (value.includes('\0')) {
    ctx.addIssue({ code: 'custom', message: 'path must not contain NUL bytes' })
  }
})

export const WorkspaceReferenceKindSchema = z.enum(['file', 'directory'])
export type WorkspaceReferenceKind = z.infer<typeof WorkspaceReferenceKindSchema>

export const WorkspaceReferenceSchema = z.object({
  path: relativeWorkspacePath,
  kind: WorkspaceReferenceKindSchema
})
export type WorkspaceReference = z.infer<typeof WorkspaceReferenceSchema>

export const WorkspaceReferenceSearchRequestSchema = z.object({
  query: z.string().max(256).default(''),
  limit: z.number().int().min(1).max(50).default(20)
})
export type WorkspaceReferenceSearchRequest = z.input<typeof WorkspaceReferenceSearchRequestSchema>

export const WorkspaceReferenceSearchEntrySchema = WorkspaceReferenceSchema.extend({
  name: z.string().min(1),
  depth: z.number().int().nonnegative()
})
export type WorkspaceReferenceSearchEntry = z.infer<typeof WorkspaceReferenceSearchEntrySchema>

export const WorkspaceReferenceSearchResponseSchema = z.object({
  entries: z.array(WorkspaceReferenceSearchEntrySchema),
  truncated: z.boolean(),
  indexedAt: z.string()
})
export type WorkspaceReferenceSearchResponse = z.infer<typeof WorkspaceReferenceSearchResponseSchema>
