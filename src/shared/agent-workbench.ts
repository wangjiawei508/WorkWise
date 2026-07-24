export const TASK_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_user',
  'waiting_approval',
  'retrying',
  'stalled',
  'completed',
  'failed',
  'cancelled'
] as const

export type TaskRunStatus = typeof TASK_RUN_STATUSES[number]
export type TaskNodeKind = 'plan' | 'execute' | 'verify' | 'deliver'
export type TaskNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked'
export type ConversationViewMode = 'concise' | 'standard' | 'developer'
export type WorkspaceTrustLevel = 'read-only' | 'workspace-write' | 'trusted' | 'full-access'
export type DocumentEngineId = 'markitdown' | 'mineru-local' | 'mineru-private'
export type DocumentParsingMode = 'auto' | 'fast' | 'accurate'

export type RevisionMutation = {
  expectedRevision: number
  idempotencyKey: string
}

export type TaskArtifactV1 = {
  id: string
  relativePath: string
  mediaType?: string
  format?: string
  sizeBytes?: number
  sha256?: string
  validation: 'pending' | 'valid' | 'invalid'
  validationMessage?: string
  createdAt: string
}

export type TaskAcceptanceV1 = {
  kind: 'answer' | 'files'
  requiredNodeKinds: TaskNodeKind[]
  requiredFormats?: string[]
  minimumArtifacts?: number
  requireFinalResponse: boolean
  requireActionableArtifactCard: boolean
}

export type TaskNodeV1 = {
  id: string
  taskId: string
  kind: TaskNodeKind
  title: string
  status: TaskNodeStatus
  dependsOn: string[]
  attempt: number
  maxAttempts: number
  idempotencyKey: string
  progressFingerprint?: string
  evidence: string[]
  errorCode?: string
  errorMessage?: string
  startedAt?: string
  finishedAt?: string
  revision: number
}

export type TaskCheckpointV1 = {
  id: string
  taskId: string
  completedNodeIds: string[]
  pendingNodeIds: string[]
  artifactIds: string[]
  eventSequence: number
  resumeSummary: string
  progressFingerprint?: string
  createdAt: string
  revision: number
}

export type TaskRunV1 = {
  id: string
  threadId: string
  activeTurnId?: string
  parentTaskId?: string
  childTaskIds: string[]
  workspaceRoot: string
  repositoryRoot?: string
  goal: string
  status: TaskRunStatus
  acceptance: TaskAcceptanceV1
  agentId: string
  model?: string
  budget: {
    maxAttempts: number
    maxDurationMs: number
    maxCostUsd?: number
  }
  attempts: number
  replans: number
  noProgressCount: number
  nodes: TaskNodeV1[]
  artifacts: TaskArtifactV1[]
  finalResponse?: string
  stalledReason?: string
  waitingReason?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string
  revision: number
}

export type TaskRunListQuery = {
  threadId?: string
  workspaceRoot?: string
  status?: TaskRunStatus
  limit?: number
}

export type AgentProfileV1 = {
  id: string
  name: string
  role: string
  color: string
  systemPrompt: string
  model?: string
  toolAllowlist: string[]
  mcpAllowlist: string[]
  preferredSkillIds?: string[]
  trustLevel: WorkspaceTrustLevel
  budget: {
    maxAttempts: number
    maxDurationMs: number
    maxCostUsd?: number
  }
  builtIn: boolean
  source: 'built-in' | 'global' | 'workspace'
  path?: string
  revision: number
}

export type AgentProfileDiagnosticV1 = {
  path: string
  code: 'invalid_frontmatter' | 'invalid_profile' | 'duplicate_id' | 'unsafe_path'
  message: string
}

export type AgentProfileSnapshotV1 = {
  generation: number
  profiles: AgentProfileV1[]
  diagnostics: AgentProfileDiagnosticV1[]
}

export type ThreadAgentSelectionV1 = {
  id: string
  workspace: string
  agentId: string
  agentRevision: number
  agentProfile?: Omit<AgentProfileV1, 'builtIn' | 'source' | 'path'>
}

export type WorkspaceTrustV1 = {
  canonicalRoot: string
  level: WorkspaceTrustLevel
  source: 'workwise-created' | 'external' | 'migrated' | 'user'
  confirmedAt?: string
  revision: number
}

export type McpCredentialReferenceV1 = {
  id: string
  storage: 'keychain' | 'dpapi' | 'safe-storage' | 'session'
}

export type McpServerConfigV2 = {
  id: string
  name: string
  scope: 'global' | 'workspace'
  workspaceRoot?: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  timeoutMs: number
  source: 'user' | 'skill' | 'managed-tool' | 'migration'
  credentialRef?: McpCredentialReferenceV1
  oauth?: {
    authorizationUrl: string
    tokenUrl: string
    clientId: string
    redirectUri: string
    scopes: string[]
  }
  toolPolicy: Record<string, 'allow' | 'ask' | 'deny'>
  enabled: boolean
  revision: number
}

export type McpServerStatusV1 = {
  id: string
  state: 'disconnected' | 'connecting' | 'connected' | 'needs_authorization' | 'error'
  authorized: boolean
  latencyMs?: number
  message?: string
  authorizationUrl?: string
  authorizationState?: string
}

export type ShellSessionV1 = {
  id: string
  taskId: string
  nodeId: string
  workspaceRoot: string
  commandSummary: string
  cwd: string
  status: 'starting' | 'running' | 'completed' | 'failed' | 'terminated' | 'interrupted'
  exitCode?: number
  outputPath: string
  outputBytes: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
  revision: number
}

export type GitCheckpointFileV1 = {
  relativePath: string
  beforeSha256?: string
  taskStartContentPath?: string
  originallyModified: boolean
}

export type GitCheckpointV1 = {
  id: string
  taskId: string
  workspaceRoot: string
  repositoryRoot: string
  head: string
  originalStatus: string
  files: GitCheckpointFileV1[]
  rescueRef?: string
  createdAt: string
  revision: number
}

export type GitRollbackPreviewV1 = {
  checkpointId: string
  safe: boolean
  changedFiles: Array<{ relativePath: string; diff: string; conflict: boolean }>
  rescueRef?: string
  message?: string
}

export type RuntimeSpanV1 = {
  id: string
  taskId?: string
  turnId?: string
  parentSpanId?: string
  kind: 'task' | 'turn' | 'model' | 'tool' | 'mcp' | 'child-task' | 'shell' | 'validation' | 'document'
  name: string
  status: 'running' | 'ok' | 'error' | 'cancelled'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  retryCount: number
  inputTokens?: number
  outputTokens?: number
  cacheHit?: boolean
  model?: string
  errorCode?: string
  attributes: Record<string, string | number | boolean>
}

export type DocumentPageReferenceV1 = {
  page: number
  blockId?: string
  kind?: 'text' | 'table' | 'formula' | 'image'
  boundingBox?: [number, number, number, number]
}

export type DocumentParseRequestV1 = {
  parseId?: string
  workspaceRoot: string
  relativePath: string
  outputDirectory?: string
  mode: DocumentParsingMode
  preferredEngine?: DocumentEngineId
  allowPrivateServerUpload?: boolean
  idempotencyKey: string
}

export type DocumentParseResultV1 = {
  id: string
  engine: DocumentEngineId
  engineVersion: string
  sourceSha256: string
  markdown: string
  headings: Array<{ level: number; text: string; page?: number }>
  tables: Array<{ markdown: string; page?: number }>
  media: Array<{ relativePath: string; mediaType?: string; page?: number }>
  references: DocumentPageReferenceV1[]
  warnings: string[]
  quality: {
    status: 'good' | 'degraded' | 'enhanced'
    reasons: string[]
  }
  route: {
    requestedMode: DocumentParsingMode
    selectedEngine: DocumentEngineId
    fallbackFrom?: DocumentEngineId
  }
  degradedFrom?: DocumentEngineId
  cacheHit: boolean
  durationMs: number
}

export type DocumentEngineStatusV1 = {
  id: DocumentEngineId
  state: 'available' | 'not_installed' | 'installing' | 'needs_configuration' | 'error'
  version?: string
  local: boolean
  capabilities: Array<'pdf' | 'docx' | 'pptx' | 'xlsx' | 'ocr' | 'layout' | 'formula'>
  message?: string
  attribution?: string
}

export type WorkspacePreviewResultV1 =
  | { kind: 'image'; mediaType: string; dataUrl: string; sizeBytes: number }
  | { kind: 'svg'; sanitizedSvg: string; sizeBytes: number }
  | { kind: 'markdown'; html: string; source: string; sizeBytes: number }
  | {
      kind: 'pdf'
      relativePath: string
      pageCount: number
      searchable: boolean
      pageTexts: Array<{ page: number; text: string }>
      dataUrl?: string
      truncated: boolean
      warnings: string[]
      sizeBytes: number
    }
  | {
      kind: 'office'
      format: 'docx' | 'pptx' | 'xlsx'
      markdown: string
      pageCount?: number
      sheetNames?: string[]
      warnings: string[]
      sizeBytes: number
    }
  | { kind: 'metadata'; name: string; mediaType?: string; sizeBytes: number; message: string }

export type RepoMapResultV1 = {
  repositoryRoot: string
  cacheKey: string
  filesIndexed: number
  bytesIndexed: number
  truncated: boolean
  symbols: Array<{
    name: string
    kind: string
    relativePath: string
    line: number
    exported: boolean
  }>
  imports: Array<{ from: string; to: string }>
}

export type LspRequestV1 = {
  workspaceRoot: string
  repositoryRoot: string
  relativePath: string
  line: number
  column: number
  kind: 'definition' | 'references' | 'symbols' | 'diagnostics' | 'hover'
}

export type LspResponseV1 = {
  kind: LspRequestV1['kind']
  items: Array<{
    relativePath: string
    line: number
    column: number
    name?: string
    kind?: string
    text?: string
    category?: string
  }>
  truncated: boolean
}

export type WorkbenchMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'stale_request' | 'unsafe_path' | 'resource_limit' | 'not_found' | 'invalid_state' | 'error'; message: string }
