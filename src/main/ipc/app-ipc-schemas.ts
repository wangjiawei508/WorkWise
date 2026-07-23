import { z } from 'zod'
import {
  RUNTIME_APPROVAL_TEMPLATE,
  RUNTIME_ATTACHMENT_CONTENT_TEMPLATE,
  RUNTIME_ATTACHMENT_DIAGNOSTICS_TEMPLATE,
  RUNTIME_ATTACHMENTS_TEMPLATE,
  RUNTIME_ATTACHMENT_TEMPLATE,
  RUNTIME_HEALTH_TEMPLATE,
  RUNTIME_MEMORY_DIAGNOSTICS_TEMPLATE,
  RUNTIME_MEMORY_RECORD_TEMPLATE,
  RUNTIME_MEMORY_TEMPLATE,
  RUNTIME_INFO_TEMPLATE,
  RUNTIME_TOOLS_TEMPLATE,
  RUNTIME_SESSION_RESUME_TEMPLATE,
  RUNTIME_SKILLS_TEMPLATE,
  RUNTIME_TASKS_TEMPLATE,
  RUNTIME_TASK_TEMPLATE,
  RUNTIME_TASK_RESUME_TEMPLATE,
  RUNTIME_TASK_RETRY_TEMPLATE,
  RUNTIME_TASK_CANCEL_TEMPLATE,
  RUNTIME_TASK_DIAGNOSTICS_TEMPLATE,
  RUNTIME_SHELL_SESSIONS_TEMPLATE,
  RUNTIME_SHELL_SESSION_TERMINATE_TEMPLATE,
  RUNTIME_THREADS_TEMPLATE,
  RUNTIME_THREAD_COMPACT_TEMPLATE,
  RUNTIME_THREAD_AGENT_TEMPLATE,
  RUNTIME_THREAD_FORK_TEMPLATE,
  RUNTIME_THREAD_GOAL_TEMPLATE,
  RUNTIME_THREAD_REVIEW_TEMPLATE,
  RUNTIME_THREAD_TODOS_TEMPLATE,
  RUNTIME_THREAD_INTERRUPT_TEMPLATE,
  RUNTIME_THREAD_STEER_TEMPLATE,
  RUNTIME_THREAD_TURNS_TEMPLATE,
  RUNTIME_THREAD_TEMPLATE,
  RUNTIME_USER_INPUT_TEMPLATE,
  RUNTIME_USAGE_TEMPLATE
} from '../../shared/runtime-endpoints'
import {
  CLAW_MODEL_IDS,
  IMAGE_GENERATION_PROTOCOLS,
  MODEL_ENDPOINT_FORMATS,
  SCHEDULE_MODEL_IDS,
  SCHEDULE_REASONING_EFFORT_IDS,
  WRITE_INLINE_COMPLETION_MODEL_IDS
} from '../../shared/app-settings'
import { DESKTOP_COMMANDS } from '../../shared/workwise-api'
import { GUI_UPDATE_CHANNELS } from '../../shared/gui-update'
import { KEYBOARD_SHORTCUT_COMMANDS } from '../../shared/keyboard-shortcuts'
import { WRITE_EXPORT_FORMATS } from '../../shared/write-export'
import {
  EXPORT_ELEMENT_TYPES,
  EXPORT_INDENTATION_TYPES,
  EXPORT_LINE_SPACING_TYPES,
  EXPORT_TEXT_ALIGNMENTS
} from '../../shared/write-export-templates'
import { WRITE_INFOGRAPHIC_MAX_TEXT_CHARS } from '../../shared/write-infographic'
import { AGNES_IMAGE_SIZES } from '../../shared/agnes-image'
import { CANCELLATION_SCOPES } from '../../shared/cancellation'
import { RUNTIME_RESOURCE_LIMITS_V1 } from '../../shared/runtime-resource-limits'

const MAX_BODY_BYTES = RUNTIME_RESOURCE_LIMITS_V1.jsonRequestBodyBytes
const MAX_PATH_LENGTH = 4_096
const MAX_URL_LENGTH = 4_096
const MAX_IMAGE_PROMPT_TEXT = 8_000
const MAX_ID_LENGTH = 256
const MAX_BRANCH_LENGTH = 255
const MAX_EDITOR_ID_LENGTH = 64
const MAX_NOTIFICATION_TITLE_LENGTH = 200
const MAX_NOTIFICATION_BODY_LENGTH = 5_000
const MAX_CHANNEL_TEXT_LENGTH = 100_000
const MAX_SKILL_FILE_BYTES = 1_000_000
const MAX_CONFIG_FILE_BYTES = 2_000_000
const MAX_DEVICE_CODE_LENGTH = 8_192
const MAX_EDITOR_COMPLETION_TEXT = 200_000
const MAX_SAVE_FILE_BASE64_BYTES = 64 * 1024 * 1024

const SAFE_OPEN_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function trimmedString(max: number): z.ZodString {
  return z.string().trim().min(1).max(max)
}

function optionalTrimmedString(max: number): z.ZodOptional<z.ZodString> {
  return z.string().trim().max(max).optional()
}

export function isSafeOpenExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return SAFE_OPEN_EXTERNAL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

export const defaultPathSchema = optionalTrimmedString(MAX_PATH_LENGTH)
export const diagnosticsExportPayloadSchema = z.object({
  taskId: trimmedString(MAX_ID_LENGTH)
}).strict()

export const confirmDialogPayloadSchema = z
  .object({
    message: trimmedString(4_000),
    detail: z.string().max(8_000).optional(),
    confirmLabel: z.string().trim().max(200).optional(),
    cancelLabel: z.string().trim().max(200).optional()
  })
  .strict()

interface EndpointTemplate {
  /** Compiled path matcher. */
  match(path: string): boolean
  allowedMethods: readonly string[]
}

function compileEndpoint(
  template: string,
  allowedMethods: readonly string[]
): EndpointTemplate {
  // Build a regex from the template by escaping the literal parts and
  // substituting the `{id}` / `{turn}` placeholders with `[^/]+`. The
  // template fragments are URL-encoded by the path helpers, so they
  // contain only characters that are safe to escape directly.
  const pattern = template.replace(/[.+*?^$()|[\]\\]/g, '\\$&').replace(/\{(?:id|turn)\}/g, '[^/]+')
  const regex = new RegExp(`^${pattern}$`)
  return {
    match: (path: string) => regex.test(path),
    allowedMethods
  }
}

const ENDPOINTS: readonly EndpointTemplate[] = [
  compileEndpoint(RUNTIME_HEALTH_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_INFO_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_TOOLS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_SKILLS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_TASKS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_TASK_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_TASK_RESUME_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_TASK_RETRY_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_TASK_CANCEL_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_TASK_DIAGNOSTICS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_SHELL_SESSIONS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_SHELL_SESSION_TERMINATE_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_ATTACHMENTS_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_ATTACHMENT_DIAGNOSTICS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_ATTACHMENT_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_ATTACHMENT_CONTENT_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_MEMORY_TEMPLATE, ['GET', 'POST']),
  compileEndpoint(RUNTIME_MEMORY_DIAGNOSTICS_TEMPLATE, ['GET']),
  compileEndpoint(RUNTIME_MEMORY_RECORD_TEMPLATE, ['PATCH', 'DELETE']),
  compileEndpoint(RUNTIME_THREADS_TEMPLATE, ['GET', 'POST']),
  compileEndpoint(RUNTIME_THREAD_TEMPLATE, ['GET', 'PATCH', 'DELETE']),
  compileEndpoint(RUNTIME_THREAD_FORK_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_THREAD_AGENT_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_THREAD_GOAL_TEMPLATE, ['GET', 'POST', 'DELETE']),
  compileEndpoint(RUNTIME_THREAD_TODOS_TEMPLATE, ['GET', 'POST', 'DELETE']),
  compileEndpoint(RUNTIME_THREAD_COMPACT_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_THREAD_REVIEW_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_THREAD_TURNS_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_THREAD_STEER_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_THREAD_INTERRUPT_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_APPROVAL_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_USER_INPUT_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_SESSION_RESUME_TEMPLATE, ['POST']),
  compileEndpoint(RUNTIME_USAGE_TEMPLATE, ['GET'])
]

function isAllowedRuntimeRequest(value: { path: string; method?: string }): boolean {
  try {
    const url = new URL(value.path, 'http://localhost')
    const path = url.pathname
    const method = value.method ?? 'GET'
    for (const endpoint of ENDPOINTS) {
      if (endpoint.match(path)) {
        return endpoint.allowedMethods.includes(method)
      }
    }
    return false
  } catch {
    return false
  }
}

export const runtimeRequestPayloadSchema = z
  .object({
    path: trimmedString(MAX_URL_LENGTH).transform((value) =>
      value.startsWith('/') ? value : `/${value}`
    ),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    body: z.string().optional()
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.body === undefined) return
    let pathname = ''
    try {
      pathname = new URL(payload.path, 'http://localhost').pathname
    } catch {
      return
    }
    const limit = compileEndpoint(RUNTIME_ATTACHMENTS_TEMPLATE, ['POST']).match(pathname)
      ? RUNTIME_RESOURCE_LIMITS_V1.attachmentRequestBodyBytes
      : RUNTIME_RESOURCE_LIMITS_V1.jsonRequestBodyBytes
    if (Buffer.byteLength(payload.body, 'utf8') > limit) {
      context.addIssue({
        code: 'custom',
        path: ['body'],
        message: `request body exceeds the ${limit}-byte hard limit`
      })
    }
  })
  .refine((payload) => isAllowedRuntimeRequest(payload), {
    message: 'runtime request path is not allowed'
  })

const localeSchema = z.enum(['en', 'zh'])
const themeSchema = z.enum(['system', 'light', 'dark'])
const uiFontScaleSchema = z.enum(['small', 'medium', 'large'])
const approvalPolicySchema = z.enum(['on-request', 'untrusted', 'never', 'auto', 'suggest'])
const sandboxModeSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access', 'external-sandbox'])
const mcpSearchModeSchema = z.enum(['direct', 'search', 'auto'])
const kunStorageBackendSchema = z.enum(['hybrid', 'file'])
const kunCompactionSummaryModeSchema = z.enum(['heuristic', 'model'])
const clawRunModeSchema = z.enum(['agent', 'plan'])
const clawImProviderSchema = z.enum(['feishu', 'weixin'])
const clawScheduleKindSchema = z.enum(['manual', 'interval', 'daily', 'at'])
const clawTaskStatusSchema = z.enum(['idle', 'running', 'success', 'error'])
const clawModelSchema = z.enum(CLAW_MODEL_IDS)
const scheduleReasoningEffortSchema = z.enum(SCHEDULE_REASONING_EFFORT_IDS)
const writeInlineCompletionModelSchema = z.union([
  z.enum(WRITE_INLINE_COMPLETION_MODEL_IDS),
  trimmedString(128)
])
const modelEndpointFormatSchema = z.enum(MODEL_ENDPOINT_FORMATS)
const imageGenerationProtocolSchema = z.enum(IMAGE_GENERATION_PROTOCOLS)

const modelProviderPatchSchema = z.object({
  apiKey: z.string().max(MAX_BODY_BYTES).optional(),
  baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  providers: z.array(z.object({
    id: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    apiKey: z.string().max(MAX_BODY_BYTES).optional(),
    baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    endpointFormat: modelEndpointFormatSchema.optional(),
    models: z.array(z.string().trim().min(1).max(128)).max(200).optional(),
    image: z.object({
      protocol: imageGenerationProtocolSchema.optional(),
      baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
      models: z.array(z.string().trim().min(1).max(128)).max(50).optional()
    }).strict().nullable().optional()
  }).strict()).max(50).optional()
}).strict()

const kunRuntimePatchSchema = z.object({
  binaryPath: defaultPathSchema,
  port: z.number().int().min(1).max(65_535).optional(),
  autoStart: z.boolean().optional(),
  apiKey: z.string().max(MAX_BODY_BYTES).optional(),
  baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  providerId: z.string().trim().max(64).optional(),
  endpointFormat: modelEndpointFormatSchema.optional(),
  runtimeToken: z.string().max(MAX_BODY_BYTES).optional(),
  dataDir: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  approvalPolicy: approvalPolicySchema.optional(),
  sandboxMode: sandboxModeSchema.optional(),
  tokenEconomyMode: z.boolean().optional(),
  tokenEconomy: z.object({
    enabled: z.boolean().optional(),
    compressToolDescriptions: z.boolean().optional(),
    compressToolResults: z.boolean().optional(),
    conciseResponses: z.boolean().optional(),
    historyHygiene: z.object({
      maxToolResultLines: z.number().int().positive().max(100_000).optional(),
      maxToolResultBytes: z.number().int().positive().max(8 * 1024 * 1024).optional(),
      maxToolResultTokens: z.number().int().positive().max(256_000).optional(),
      maxToolArgumentStringBytes: z.number().int().positive().max(8 * 1024 * 1024).optional(),
      maxToolArgumentStringTokens: z.number().int().positive().max(64_000).optional(),
      maxArrayItems: z.number().int().positive().max(10_000).optional()
    }).strict().optional()
  }).strict().optional(),
  insecure: z.boolean().optional(),
  mcpSearch: z.object({
    enabled: z.boolean().optional(),
    mode: mcpSearchModeSchema.optional(),
    autoThresholdToolCount: z.number().int().positive().optional(),
    topKDefault: z.number().int().positive().optional(),
    topKMax: z.number().int().positive().optional(),
    minScore: z.number().nonnegative().optional()
  }).strict().optional(),
  storage: z.object({
    backend: kunStorageBackendSchema.optional(),
    sqlitePath: defaultPathSchema
  }).strict().optional(),
  contextCompaction: z.object({
    defaultSoftThreshold: z.number().int().positive().optional(),
    defaultHardThreshold: z.number().int().positive().optional(),
    summaryMode: kunCompactionSummaryModeSchema.optional(),
    summaryTimeoutMs: z.number().int().positive().max(120_000).optional(),
    summaryMaxTokens: z.number().int().positive().max(16_000).optional(),
    summaryInputMaxBytes: z.number().int().positive().max(8 * 1024 * 1024).optional()
  }).strict().optional(),
  runtimeTuning: z.object({
    toolStorm: z.object({
      enabled: z.boolean().optional(),
      windowSize: z.number().int().positive().max(128).optional(),
      threshold: z.number().int().min(2).max(128).optional()
    }).strict().optional(),
    toolArgumentRepair: z.object({
      maxStringBytes: z.number().int().positive().max(16 * 1024 * 1024).optional()
    }).strict().optional()
  }).strict().optional(),
  imageGeneration: z.object({
    enabled: z.boolean().optional(),
    providerId: z.string().trim().max(64).optional(),
    protocol: imageGenerationProtocolSchema.optional(),
    baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    apiKey: z.string().max(MAX_BODY_BYTES).optional(),
    model: z.string().trim().max(128).optional(),
    defaultSize: z.string().trim().max(16).optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional()
  }).strict().optional()
}).strict()

const logPatchSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(365).optional()
}).strict()

const notificationsPatchSchema = z.object({
  turnComplete: z.boolean().optional()
}).strict()

const appBehaviorPatchSchema = z.object({
  openAtLogin: z.boolean().optional(),
  startMinimized: z.boolean().optional(),
  closeToTray: z.boolean().optional()
}).strict()

const keyboardShortcutCommandIds = KEYBOARD_SHORTCUT_COMMANDS.map((command) => command.id) as [
  typeof KEYBOARD_SHORTCUT_COMMANDS[number]['id'],
  ...Array<typeof KEYBOARD_SHORTCUT_COMMANDS[number]['id']>
]

const keyboardShortcutsPatchSchema = z.object({
  bindings: z.partialRecord(
    z.enum(keyboardShortcutCommandIds),
    z.array(z.string().trim().max(64)).max(4)
  ).optional()
}).strict()

const writeInlineCompletionPatchSchema = z.object({
  enabled: z.boolean().optional(),
  retrievalEnabled: z.boolean().optional(),
  longCompletionEnabled: z.boolean().optional(),
  inheritProvider: z.boolean().optional(),
  providerId: z.string().trim().max(64).optional(),
  apiKey: z.string().max(MAX_BODY_BYTES).optional(),
  baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  inheritModel: z.boolean().optional(),
  model: writeInlineCompletionModelSchema.optional(),
  debounceMs: z.number().int().min(150).max(5_000).optional(),
  longDebounceMs: z.number().int().min(1_000).max(15_000).optional(),
  minAcceptScore: z.number().min(0.1).max(0.95).optional(),
  longMinAcceptScore: z.number().min(0.1).max(0.95).optional(),
  maxTokens: z.number().int().min(16).max(512).optional(),
  longMaxTokens: z.number().int().min(64).max(1_024).optional()
}).strict()

/**
 * 导出元素样式 schema（用于 settings:set 的 write.exportTemplates 校验）。
 * 与 ExportElementStyle 类型对应，字段可放宽（normalizeWriteSettings 会补全）。
 */
const exportElementStyleSchema = z.object({
  fontFamilyAscii: z.string().max(64),
  fontFamilyEastAsia: z.string().max(64),
  fontSize: z.number().min(4).max(200),
  color: z.string().regex(/^[0-9A-Fa-f]{6}$/),
  bold: z.boolean(),
  italic: z.boolean(),
  spacingBefore: z.number().min(0).max(20),
  spacingAfter: z.number().min(0).max(20),
  lineSpacingType: z.enum(EXPORT_LINE_SPACING_TYPES),
  lineSpacingValue: z.number().min(0).max(200),
  alignment: z.enum(EXPORT_TEXT_ALIGNMENTS),
  indentationType: z.enum(EXPORT_INDENTATION_TYPES),
  indentationValue: z.number().min(0).max(40)
})

const exportPageLayoutSchema = z.object({
  marginTop: z.number().min(0).max(14_400),
  marginBottom: z.number().min(0).max(14_400),
  marginLeft: z.number().min(0).max(14_400),
  marginRight: z.number().min(0).max(14_400)
})

const exportStyleTemplateSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  nameEn: z.string().max(128).optional(),
  builtin: z.boolean(),
  isDefault: z.boolean(),
  pageLayout: exportPageLayoutSchema,
  styles: z.object({
    h1: exportElementStyleSchema,
    h2: exportElementStyleSchema,
    h3: exportElementStyleSchema,
    p: exportElementStyleSchema,
    table: exportElementStyleSchema,
    code: exportElementStyleSchema
  }),
  createdAt: z.number(),
  updatedAt: z.number()
})

const writeSettingsPatchSchema = z.object({
  defaultWorkspaceRoot: defaultPathSchema,
  activeWorkspaceRoot: defaultPathSchema,
  workspaces: z.array(trimmedString(MAX_PATH_LENGTH)).max(256).optional(),
  inlineCompletion: writeInlineCompletionPatchSchema.optional(),
  knowledgeBase: z.object({
    enabled: z.boolean().optional(),
    mode: z.literal('hybrid').optional(),
    apiBaseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    publicBaseUrl: z.string().trim().max(MAX_URL_LENGTH).optional()
  }).strict().optional(),
  exportTemplates: z.array(exportStyleTemplateSchema).max(32).optional(),
  defaultExportTemplateId: z.string().max(128).optional()
}).strict()

const clawSkillPatchSchema = z.object({
  defaultNames: z.array(trimmedString(128)).max(128).optional(),
  extraDirs: z.array(trimmedString(MAX_PATH_LENGTH)).max(128).optional(),
  promptPrefix: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
}).strict()

const clawImPatchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: clawImProviderSchema.optional(),
  port: z.number().int().min(1024).max(65_535).optional(),
  path: trimmedString(MAX_PATH_LENGTH).optional(),
  secret: z.string().max(MAX_BODY_BYTES).optional(),
  weixinBridgeUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  openClawGatewayUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  mode: clawRunModeSchema.optional(),
  responseTimeoutMs: z.number().int().min(5_000).max(600_000).optional()
}).strict()

const clawImAgentProfilePatchSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2_000).optional(),
  identity: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  personality: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  userContext: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  replyRules: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
}).strict()

const clawImPlatformCredentialPatchSchema = z.union([
  z.object({
    kind: z.literal('feishu').optional(),
    appId: z.string().max(512).optional(),
    appSecret: z.string().max(MAX_BODY_BYTES).optional(),
    domain: z.string().max(512).optional(),
    createdAt: z.string().max(128).optional()
  }).strict(),
  z.object({
    kind: z.literal('weixin'),
    accountId: z.string().max(512).optional(),
    sessionKey: z.string().max(MAX_BODY_BYTES).optional(),
    createdAt: z.string().max(128).optional()
  }).strict()
])

const clawImRemoteSessionPatchSchema = z.object({
  chatId: z.string().max(MAX_ID_LENGTH).optional(),
  messageId: z.string().max(MAX_ID_LENGTH).optional(),
  threadId: z.string().max(MAX_ID_LENGTH).optional(),
  senderId: z.string().max(MAX_ID_LENGTH).optional(),
  senderName: z.string().max(512).optional(),
  updatedAt: z.string().max(128).optional()
}).strict()

const clawImConversationPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  chatId: z.string().max(MAX_ID_LENGTH).optional(),
  remoteThreadId: z.string().max(MAX_ID_LENGTH).optional(),
  latestMessageId: z.string().max(MAX_ID_LENGTH).optional(),
  senderId: z.string().max(MAX_ID_LENGTH).optional(),
  senderName: z.string().max(512).optional(),
  localThreadId: z.string().max(MAX_ID_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional()
}).strict()

const clawImChannelPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  provider: clawImProviderSchema.optional(),
  label: z.string().max(512).optional(),
  enabled: z.boolean().optional(),
  model: z.string().trim().min(1).max(128).optional(),
  threadId: z.string().max(MAX_ID_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  agentProfile: clawImAgentProfilePatchSchema.optional(),
  platformCredential: clawImPlatformCredentialPatchSchema.optional(),
  remoteSession: clawImRemoteSessionPatchSchema.optional(),
  conversations: z.array(clawImConversationPatchSchema).max(512).optional(),
  welcomeSentAt: z.string().max(128).optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional()
}).strict()

const clawTaskSchedulePatchSchema = z.object({
  kind: clawScheduleKindSchema.optional(),
  everyMinutes: z.number().int().min(1).max(10_080).optional(),
  timeOfDay: z.string().max(16).optional(),
  atTime: z.string().max(128).optional()
}).strict()

const clawTaskPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  title: z.string().max(512).optional(),
  enabled: z.boolean().optional(),
  prompt: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  reasoningEffort: scheduleReasoningEffortSchema.optional(),
  mode: clawRunModeSchema.optional(),
  schedule: clawTaskSchedulePatchSchema.optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional(),
  lastRunAt: z.string().max(128).optional(),
  nextRunAt: z.string().max(128).optional(),
  lastStatus: clawTaskStatusSchema.optional(),
  lastMessage: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  lastThreadId: z.string().max(MAX_ID_LENGTH).optional()
}).strict()

const clawSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  skills: clawSkillPatchSchema.optional(),
  im: clawImPatchSchema.optional(),
  channels: z.array(clawImChannelPatchSchema).max(512).optional(),
  tasks: z.array(clawTaskPatchSchema).max(512).optional()
}).strict()

const scheduleSkillPatchSchema = z.object({
  defaultNames: z.array(trimmedString(128)).max(128).optional(),
  extraDirs: z.array(trimmedString(MAX_PATH_LENGTH)).max(128).optional()
}).strict()

const scheduleInternalPatchSchema = z.object({
  port: z.number().int().min(1024).max(65_535).optional(),
  secret: z.string().max(MAX_BODY_BYTES).optional()
}).strict()

const scheduledTaskSchedulePatchSchema = z.object({
  kind: clawScheduleKindSchema.optional(),
  everyMinutes: z.number().int().min(1).max(10_080).optional(),
  timeOfDay: z.string().max(16).optional(),
  atTime: z.string().max(128).optional()
}).strict()

const scheduledTaskPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  title: z.string().max(512).optional(),
  enabled: z.boolean().optional(),
  prompt: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  reasoningEffort: scheduleReasoningEffortSchema.optional(),
  mode: clawRunModeSchema.optional(),
  schedule: scheduledTaskSchedulePatchSchema.optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional(),
  lastRunAt: z.string().max(128).optional(),
  nextRunAt: z.string().max(128).optional(),
  lastStatus: clawTaskStatusSchema.optional(),
  lastMessage: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  lastThreadId: z.string().max(MAX_ID_LENGTH).optional()
}).strict()

const scheduleSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  defaultWorkspaceRoot: defaultPathSchema,
  model: z.union([z.enum(SCHEDULE_MODEL_IDS), trimmedString(128)]).optional(),
  mode: clawRunModeSchema.optional(),
  promptPrefix: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  skills: scheduleSkillPatchSchema.optional(),
  keepAwake: z.boolean().optional(),
  internal: scheduleInternalPatchSchema.optional(),
  tasks: z.array(scheduledTaskPatchSchema).max(512).optional()
}).strict()

function stripLegacySettingsPatchKeys(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const source = payload as Record<string, unknown>
  const next: Record<string, unknown> = { ...source }

  delete next.agentProvider
  delete next.deepseek
  delete next.reasonix
  delete next.quickChat

  if (typeof next.agents === 'object' && next.agents !== null && !Array.isArray(next.agents)) {
    const agents = { ...(next.agents as Record<string, unknown>) }
    delete agents.codewhale
    delete agents.reasonix
    delete agents.quickChat
    next.agents = agents
  }

  return next
}

const settingsPatchObjectSchema = z.object({
  schema: z.literal('workwise.settings').optional(),
  version: z.union([z.literal(1), z.literal(2)]).optional(),
  revision: z.number().int().nonnegative().optional(),
  locale: localeSchema.optional(),
  theme: themeSchema.optional(),
  uiFontScale: uiFontScaleSchema.optional(),
  provider: modelProviderPatchSchema.optional(),
  agents: z.object({
    kun: kunRuntimePatchSchema.optional()
  }).strict().optional(),
  workspaceRoot: defaultPathSchema,
  log: logPatchSchema.optional(),
  notifications: notificationsPatchSchema.optional(),
  appBehavior: appBehaviorPatchSchema.optional(),
  keyboardShortcuts: keyboardShortcutsPatchSchema.optional(),
  write: writeSettingsPatchSchema.optional(),
  claw: clawSettingsPatchSchema.optional(),
  schedule: scheduleSettingsPatchSchema.optional(),
  guiUpdate: z.object({
    channel: z.enum(GUI_UPDATE_CHANNELS).optional()
  }).strict().optional(),
  conversation: z.object({
    viewMode: z.enum(['concise', 'standard', 'developer']).optional()
  }).strict().optional(),
  documents: z.object({
    parsingMode: z.enum(['auto', 'fast', 'accurate']).optional(),
    privateMineruServerUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    allowPrivateServerUploadByWorkspace: z.record(z.string().trim().min(1).max(MAX_PATH_LENGTH), z.boolean()).optional()
  }).strict().optional(),
  codePromptPrefix: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
}).strict()

export const settingsPatchSchema = z.preprocess(stripLegacySettingsPatchKeys, settingsPatchObjectSchema)
export const settingsSetPayloadSchema = z.union([
  z.object({
    patch: settingsPatchSchema,
    expectedRevision: z.number().int().nonnegative().optional()
  }).strict(),
  // Compatibility for 0.2.x preload callers. New callers send the envelope above.
  settingsPatchSchema.transform((patch) => ({ patch, expectedRevision: undefined }))
])

export const skillSaveFilePayloadSchema = z
  .object({
    rootPath: trimmedString(MAX_PATH_LENGTH),
    skillName: trimmedString(128),
    content: z.string().max(MAX_SKILL_FILE_BYTES)
  })
  .strict()

export const githubSkillSourceSchema = z.object({
  owner: trimmedString(128),
  repo: trimmedString(128),
  path: z.string().trim().max(MAX_PATH_LENGTH),
  ref: z.string().trim().max(256).optional(),
  skillName: z.string().trim().max(128).optional(),
  autoUpdate: z.boolean().optional(),
  includePaths: z.array(z.string().trim().max(MAX_PATH_LENGTH)).max(64).optional(),
  overlaySkillId: z.string().trim().max(128).optional()
}).strict()

export const githubSkillInstallPayloadSchema = z.object({
  rootPath: trimmedString(MAX_PATH_LENGTH),
  source: githubSkillSourceSchema
}).strict()

export const bundledSkillInstallPayloadSchema = z.object({
  rootPath: trimmedString(MAX_PATH_LENGTH),
  source: z.object({
    id: trimmedString(128),
    skillName: z.string().trim().max(128).optional()
  }).strict()
}).strict()

export const bundledAgentPackInstallPayloadSchema = z.object({
  source: z.object({
    id: trimmedString(128),
    rootPath: z.string().trim().max(MAX_PATH_LENGTH).optional()
  }).strict()
}).strict()

export const githubSkillSyncPayloadSchema = z.object({
  workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
}).strict()

export const managedToolIdSchema = z.enum(['lark-cli', 'officecli', 'ego-browser'])

export const skillListPayloadSchema = z
  .object({
    workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
  })
  .strict()

export const rootPathSchema = trimmedString(MAX_PATH_LENGTH)
export const runtimeConfigContentSchema = z.string().max(MAX_CONFIG_FILE_BYTES)

export const workspaceRootSchema = trimmedString(MAX_PATH_LENGTH)
export const gitBranchPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    branch: trimmedString(MAX_BRANCH_LENGTH)
  })
  .strict()

export const gitCheckpointCreatePayloadSchema = z.object({
  taskId: trimmedString(MAX_ID_LENGTH),
  workspaceRoot: workspaceRootSchema,
  repositoryRoot: defaultPathSchema,
  relatedPaths: z.array(trimmedString(MAX_PATH_LENGTH)).max(512).optional(),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const gitRollbackPreviewPayloadSchema = z.object({
  checkpointId: trimmedString(MAX_ID_LENGTH),
  relatedPaths: z.array(trimmedString(MAX_PATH_LENGTH)).max(512).optional()
}).strict()

export const gitRollbackApplyPayloadSchema = gitRollbackPreviewPayloadSchema.extend({
  expectedRevision: z.number().int().min(0),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const repoMapBuildPayloadSchema = z.object({
  workspaceRoot: workspaceRootSchema,
  repositoryRoot: workspaceRootSchema,
  maxFiles: z.number().int().min(1).max(4_000).optional(),
  maxBytes: z.number().int().min(1).max(20 * 1024 * 1024).optional(),
  maxDurationMs: z.number().int().min(250).max(5_000).optional(),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const repoMapQueryPayloadSchema = z.object({
  repositoryRoot: workspaceRootSchema,
  query: z.string().trim().max(1_000),
  limit: z.number().int().min(1).max(500).optional()
}).strict()

export const lspRequestPayloadSchema = z.object({
  workspaceRoot: workspaceRootSchema,
  repositoryRoot: workspaceRootSchema,
  relativePath: trimmedString(MAX_PATH_LENGTH),
  line: z.number().int().min(1).max(1_000_000),
  column: z.number().int().min(1).max(1_000_000),
  kind: z.enum(['definition', 'references', 'symbols', 'diagnostics', 'hover'])
}).strict()

export const openEditorPathPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    editorId: optionalTrimmedString(MAX_EDITOR_ID_LENGTH),
    line: z.number().int().positive().max(1_000_000).optional(),
    column: z.number().int().positive().max(1_000_000).optional()
  })
  .strict()

export const workspaceFileTargetPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    line: z.number().int().positive().max(1_000_000).optional(),
    column: z.number().int().positive().max(1_000_000).optional()
  })
  .strict()

export const workspaceDirectoryTargetPayloadSchema = z
  .object({
    path: optionalTrimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceFileWritePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    content: z.string().max(MAX_BODY_BYTES)
  })
  .strict()

export const workspaceFileSaveAsPayloadSchema = z
  .object({
    suggestedName: optionalTrimmedString(255),
    sourcePath: optionalTrimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    dataBase64: z.string().max(MAX_SAVE_FILE_BASE64_BYTES).optional(),
    mimeType: optionalTrimmedString(255)
  })
  .strict()
  .refine((payload) => Boolean(payload.sourcePath || payload.dataBase64), {
    message: 'Either sourcePath or dataBase64 is required.'
  })

export const workspaceFileCreatePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    content: z.string().max(MAX_BODY_BYTES).optional()
  })
  .strict()

export const workspaceDirectoryCreatePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceClipboardImageSavePayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    currentFilePath: trimmedString(MAX_PATH_LENGTH),
    imageDirectory: optionalTrimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceEntryRenamePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    newName: trimmedString(255)
  })
  .strict()

export const workspaceEntryDeletePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceFileWatchPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

/**
 * 单元素样式覆盖的 schema。所有字段可选（只覆盖指定的字段）。
 * 用于 write:export 的 styleOverride：renderer 传本次导出的临时样式调整。
 */
const exportElementStyleOverrideSchema = z.object({
  fontFamilyAscii: z.string().max(64).optional(),
  fontFamilyEastAsia: z.string().max(64).optional(),
  fontSize: z.number().min(4).max(200).optional(),
  color: z.string().regex(/^[0-9A-Fa-f]{6}$/).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  spacingBefore: z.number().min(0).max(20).optional(),
  spacingAfter: z.number().min(0).max(20).optional(),
  lineSpacingType: z.enum(EXPORT_LINE_SPACING_TYPES).optional(),
  lineSpacingValue: z.number().min(0).max(200).optional(),
  alignment: z.enum(EXPORT_TEXT_ALIGNMENTS).optional(),
  indentationType: z.enum(EXPORT_INDENTATION_TYPES).optional(),
  indentationValue: z.number().min(0).max(40).optional()
})

export const writeExportPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    format: z.enum(WRITE_EXPORT_FORMATS),
    content: z.string().max(MAX_BODY_BYTES),
    templateId: z.string().max(128).optional(),
    styleOverride: z
      .record(z.enum(EXPORT_ELEMENT_TYPES), exportElementStyleOverrideSchema)
      .optional()
  })
  .strict()

export const writeRichClipboardPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    content: z.string().max(MAX_BODY_BYTES)
  })
  .strict()

export const designExportPayloadSchema = z
  .object({
    name: z.string().max(256).optional(),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    document: z.record(z.string(), z.unknown())
  })
  .strict()

const designAssetSchema = z
  .object({
    id: z.string().min(1).max(128),
    filename: z.string().min(1).max(255),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    width: z.number().int().positive().max(32_768),
    height: z.number().int().positive().max(32_768),
    byteSize: z.number().int().positive().max(12 * 1024 * 1024)
  })
  .strict()

export const designDocumentLoadPayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    documentId: z.string().trim().min(1).max(128).optional()
  })
  .strict()

export const designDocumentSavePayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    document: z.record(z.string(), z.unknown()),
    activePageId: z.string().trim().min(1).max(160),
    expectedRevision: z.number().int().min(0).nullable()
  })
  .strict()

export const designImageImportPayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    documentId: z.string().trim().min(1).max(128)
  })
  .strict()

export const designAssetReadPayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    documentId: z.string().trim().min(1).max(128),
    asset: designAssetSchema
  })
  .strict()

export const designPptxImportPayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const designPresetRenderSchema = z
  .object({
    presetName: z.string().min(1).max(128),
    x: z.number().min(-10000).max(10000),
    y: z.number().min(-10000).max(10000),
    w: z.number().min(1).max(10000),
    h: z.number().min(1).max(10000),
    fill: z.string().max(16).optional()
  })
  .strict()

export const designWriteAssetPayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    currentFilePath: trimmedString(MAX_PATH_LENGTH),
    fileName: trimmedString(255),
    dataBase64: z.string().min(1).max(16 * 1024 * 1024)
  })
  .strict()

export const writeAgnesImageGenerationPayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    currentFilePath: trimmedString(MAX_PATH_LENGTH),
    prompt: trimmedString(MAX_IMAGE_PROMPT_TEXT),
    providerId: optionalTrimmedString(64),
    model: optionalTrimmedString(128),
    size: z.enum(AGNES_IMAGE_SIZES).optional(),
    imageDirectory: optionalTrimmedString(MAX_PATH_LENGTH)
  })
  .strict()

const writeInlineEditRecentEditSchema = z
  .object({
    source: z.enum(['user', 'inline-edit']),
    ageMs: z.number().int().min(0).max(24 * 60 * 60 * 1_000),
    filePath: optionalTrimmedString(MAX_PATH_LENGTH),
    from: z.number().int().min(0).max(MAX_BODY_BYTES),
    to: z.number().int().min(0).max(MAX_BODY_BYTES),
    deletedText: z.string().max(8_000),
    insertedText: z.string().max(8_000),
    beforeContext: z.string().max(4_000),
    afterContext: z.string().max(4_000),
    instruction: z.string().trim().min(1).max(10_000).optional(),
    scopeKind: z.enum(['selection', 'paragraph']).optional()
  })
  .strict()
  .refine((edit) => edit.to >= edit.from, {
    message: 'Recent edit end must be greater than or equal to start.'
  })

const writeInlineCompletionEditCandidateSchema = z
  .object({
    kind: z.enum(['selection', 'paragraph']),
    from: z.number().int().min(0).max(MAX_BODY_BYTES),
    to: z.number().int().min(0).max(MAX_BODY_BYTES),
    startLine: z.number().int().positive().max(1_000_000),
    startColumn: z.number().int().positive().max(1_000_000),
    endLine: z.number().int().positive().max(1_000_000),
    endColumn: z.number().int().positive().max(1_000_000),
    original: z.string().max(MAX_EDITOR_COMPLETION_TEXT),
    selectedText: z.string().max(50_000).optional()
  })
  .strict()
  .refine((scope) => scope.to >= scope.from, {
    message: 'Completion edit candidate end must be greater than or equal to start.'
  })

export const writeInlineCompletionPayloadSchema = z
  .object({
    prefix: z.string().max(MAX_EDITOR_COMPLETION_TEXT),
    suffix: z.string().max(MAX_EDITOR_COMPLETION_TEXT),
    mode: z.enum(['short', 'long', 'edit']).optional(),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    currentFilePath: optionalTrimmedString(MAX_PATH_LENGTH),
    cursor: z
      .object({
        line: z.number().int().positive().max(1_000_000),
        column: z.number().int().min(0).max(1_000_000)
      })
      .strict(),
    context: z
      .object({
        language: trimmedString(64),
        currentLinePrefix: z.string().max(20_000),
        currentLineSuffix: z.string().max(20_000),
        previousLine: z.string().max(20_000),
        previousNonEmptyLine: z.string().max(20_000),
        nextLine: z.string().max(20_000),
        indentation: z.string().max(2_000),
        signals: z
          .object({
            list: z.boolean(),
            quote: z.boolean(),
            heading: z.boolean(),
            table: z.boolean(),
            atLineEnd: z.boolean(),
            endsWithSentencePunctuation: z.boolean(),
            previousLineEndsWithSentencePunctuation: z.boolean(),
            prefersNewLineCompletion: z.boolean(),
            paragraphBreakOpportunity: z.boolean()
          })
          .strict()
      })
      .strict(),
    policy: z
      .object({
        name: trimmedString(128),
        instruction: z.string().max(50_000),
        acceptanceCriteria: z.array(z.string().max(5_000)).max(12),
        rejectionCriteria: z.array(z.string().max(5_000)).max(12)
      })
      .strict(),
    preview: z
      .object({
        local: z.string().max(5_000),
        documentTail: z.string().max(20_000)
      })
      .strict(),
    editCandidate: writeInlineCompletionEditCandidateSchema.optional(),
    recentEdits: z.array(writeInlineEditRecentEditSchema).max(12).optional(),
    model: optionalTrimmedString(128)
  })
  .strict()

export const writeKnowledgeSearchPayloadSchema = z
  .object({
    query: trimmedString(800)
  })
  .strict()

export const writeInfographicPayloadSchema = z
  .object({
    text: trimmedString(WRITE_INFOGRAPHIC_MAX_TEXT_CHARS),
    filePath: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const shellOpenExternalUrlSchema = trimmedString(MAX_URL_LENGTH).refine(
  isSafeOpenExternalUrl,
  { message: 'Only http, https, and mailto URLs are allowed.' }
)

export const notificationPayloadSchema = z
  .object({
    threadId: optionalTrimmedString(MAX_ID_LENGTH),
    title: trimmedString(MAX_NOTIFICATION_TITLE_LENGTH),
    body: trimmedString(MAX_NOTIFICATION_BODY_LENGTH)
  })
  .strict()

export const guiUpdateChannelSchema = z.enum(GUI_UPDATE_CHANNELS).optional()

export const desktopCommandSchema = z.enum(DESKTOP_COMMANDS)


export const logErrorPayloadSchema = z
  .object({
    category: trimmedString(128),
    message: trimmedString(2_000),
    detail: z.unknown().optional()
  })
  .strict()

export const clawMirrorPayloadSchema = z
  .object({
    threadId: trimmedString(MAX_ID_LENGTH),
    text: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    direction: z.enum(['user', 'assistant'])
  })
  .strict()

export const clawTaskFromTextPayloadSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    channelId: z.string().trim().min(1).max(MAX_ID_LENGTH).nullable().optional(),
    modelHint: z.string().trim().min(1).max(128).nullable().optional(),
    mode: z.enum(['agent', 'plan']).nullable().optional()
  })
  .strict()

export const scheduleTaskFromTextPayloadSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    workspaceRoot: defaultPathSchema,
    modelHint: z.string().trim().min(1).max(128).nullable().optional(),
    mode: z.enum(['agent', 'plan']).nullable().optional()
  })
  .strict()

export const clawImInstallPollPayloadSchema = z
  .object({
    provider: clawImProviderSchema,
    deviceCode: trimmedString(MAX_DEVICE_CODE_LENGTH)
  })
  .strict()

export const sseStartPayloadSchema = z
  .object({
    threadId: trimmedString(MAX_ID_LENGTH),
    sinceSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    streamId: optionalTrimmedString(MAX_ID_LENGTH)
  })
  .strict()

export const streamIdSchema = trimmedString(MAX_ID_LENGTH)

export const cancelOperationPayloadSchema = z.object({
  scope: z.enum(CANCELLATION_SCOPES),
  id: trimmedString(MAX_ID_LENGTH),
  reason: optionalTrimmedString(512)
}).strict()

export const agentProfileListPayloadSchema = z.object({
  workspaceRoot: defaultPathSchema
}).strict()

const trustLevelSchema = z.enum(['read-only', 'workspace-write', 'trusted', 'full-access'])
const agentProfileSchema = z.object({
  id: trimmedString(64),
  name: trimmedString(128),
  role: trimmedString(256),
  color: trimmedString(32),
  systemPrompt: z.string().trim().min(1).max(256 * 1024),
  model: optionalTrimmedString(128),
  toolAllowlist: z.array(trimmedString(256)).max(512),
  mcpAllowlist: z.array(trimmedString(256)).max(512),
  trustLevel: trustLevelSchema,
  budget: z.object({
    maxAttempts: z.number().int().min(1).max(128),
    maxDurationMs: z.number().int().min(1_000).max(24 * 60 * 60 * 1_000),
    maxCostUsd: z.number().positive().max(10_000).optional()
  }).strict(),
  revision: z.number().int().min(0).optional()
}).strict()

export const agentProfileSavePayloadSchema = z.object({
  scope: z.enum(['global', 'workspace']),
  workspaceRoot: defaultPathSchema,
  profile: agentProfileSchema,
  expectedRevision: z.number().int().min(0),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const workspaceTrustGetPayloadSchema = z.object({
  workspaceRoot: trimmedString(MAX_PATH_LENGTH)
}).strict()

export const workspaceTrustSetPayloadSchema = z.object({
  workspaceRoot: trimmedString(MAX_PATH_LENGTH),
  level: trustLevelSchema,
  expectedRevision: z.number().int().min(0),
  confirmed: z.boolean(),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const mcpServerListPayloadSchema = z.object({
  workspaceRoot: defaultPathSchema
}).strict()

const mcpServerConfigV2Schema = z.object({
  id: trimmedString(128),
  name: trimmedString(256),
  scope: z.enum(['global', 'workspace']),
  workspaceRoot: defaultPathSchema,
  transport: z.enum(['stdio', 'http']),
  command: optionalTrimmedString(MAX_PATH_LENGTH),
  args: z.array(z.string().max(8_192)).max(256).optional(),
  cwd: defaultPathSchema,
  url: optionalTrimmedString(MAX_URL_LENGTH),
  timeoutMs: z.number().int().min(1_000).max(120_000),
  source: z.enum(['user', 'skill', 'managed-tool', 'migration']),
  credentialRef: z.object({
    id: trimmedString(256),
    storage: z.enum(['keychain', 'dpapi', 'safe-storage', 'session'])
  }).strict().optional(),
  oauth: z.object({
    authorizationUrl: trimmedString(MAX_URL_LENGTH),
    tokenUrl: trimmedString(MAX_URL_LENGTH),
    clientId: trimmedString(512),
    redirectUri: trimmedString(MAX_URL_LENGTH),
    scopes: z.array(trimmedString(512)).max(128)
  }).strict().optional(),
  toolPolicy: z.record(trimmedString(512), z.enum(['allow', 'ask', 'deny'])),
  enabled: z.boolean(),
  revision: z.number().int().min(0).optional()
}).strict()

export const mcpServerSavePayloadSchema = z.object({
  config: mcpServerConfigV2Schema,
  expectedRevision: z.number().int().min(0),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const mcpServerActionPayloadSchema = z.object({
  serverId: trimmedString(128),
  workspaceRoot: defaultPathSchema
}).strict()

export const mcpServerAuthorizePayloadSchema = mcpServerActionPayloadSchema.extend({
  state: optionalTrimmedString(512),
  authorizationCode: optionalTrimmedString(8_192)
}).strict()

export const documentEngineIdSchema = z.enum(['markitdown', 'mineru-local', 'mineru-private'])

export const documentParsePayloadSchema = z.object({
  parseId: optionalTrimmedString(MAX_ID_LENGTH),
  workspaceRoot: trimmedString(MAX_PATH_LENGTH),
  relativePath: trimmedString(MAX_PATH_LENGTH),
  outputDirectory: optionalTrimmedString(MAX_PATH_LENGTH),
  mode: z.enum(['auto', 'fast', 'accurate']),
  preferredEngine: documentEngineIdSchema.optional(),
  allowPrivateServerUpload: z.boolean().optional(),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()

export const workspacePreviewPayloadSchema = z.object({
  workspaceRoot: trimmedString(MAX_PATH_LENGTH),
  relativePath: trimmedString(MAX_PATH_LENGTH),
  parsingMode: z.enum(['auto', 'fast', 'accurate']).optional(),
  idempotencyKey: trimmedString(MAX_ID_LENGTH)
}).strict()
