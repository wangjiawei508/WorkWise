/**
 * Design 工作区 kun 工具 provider。
 *
 * 让 AI agent 能通过工具操作 Design 画布：
 * - design.apply_canvas_commands：向当前 Design 画板提交结构化操作
 * - design.export_pptx：导出 PPTX
 * - design.list_presets：列出可用预设形状
 *
 * 模式抄自 ppt-master-tool-provider（✅ 已核实其 provider/tool/host 结构）。
 * shouldAdvertise 基于 activeSkillIds['design']，只在 design skill 激活时暴露。
 * 输出用 generatedFiles 格式（让 task 系统自动收 artifact）。
 */

import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { CapabilityToolProvider } from './capability-registry.js'
import type { LocalTool } from './local-tool-host.js'
import { LocalToolHost } from './local-tool-host.js'
import {
  resolveWorkspacePath,
  withToolBoundary
} from './builtin-tool-utils.js'

export type DesignToolProviderOptions = {
  /** git checkpoint 前置钩子（与 ppt-master 同款） */
  beforeMutation?: (input: { absolutePath: string; relativePath: string; workspaceRoot: string; threadId: string }) => Promise<void>
}

export type DesignToolProviderBuildResult = {
  providers: CapabilityToolProvider[]
  available: boolean
  reason?: string
}

export function buildDesignToolProviders(
  options: DesignToolProviderOptions = {}
): DesignToolProviderBuildResult {
  const provider: CapabilityToolProvider = {
    id: 'design',
    kind: 'skill',
    enabled: true,
    available: true,
    tools: [
      createDesignApplyCanvasCommandsTool(),
      createDesignExportTool(options),
      createDesignListPresetsTool()
    ]
  }
  return { providers: [provider], available: true }
}

// ---------------------------------------------------------------------------
// design.apply_canvas_commands
// ---------------------------------------------------------------------------

function createDesignApplyCanvasCommandsTool(): LocalTool {
  return LocalToolHost.defineTool({
    name: 'design_apply_canvas_commands',
    description:
      'Apply one atomic batch of structured operations to the currently open WorkWise Design canvas. ' +
      'Use this instead of writing SVG or HTML files. The renderer validates the active document, page, ' +
      'workspace and revision before changing the canvas. Supported operations are add, update, remove, ' +
      'group and ungroup.',
    toolKind: 'tool_call',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'Active Design document id supplied in the user context.'
        },
        page_id: {
          type: 'string',
          description: 'Active Design page id supplied in the user context.'
        },
        expected_revision: {
          type: 'integer',
          minimum: 0,
          description: 'Exact active document revision supplied in the user context.'
        },
        idempotency_key: {
          type: 'string',
          description: 'Unique key for this operation batch. Reusing it is a no-op.'
        },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          description:
            'Atomic canvas operations. add.element may omit id, rotation and z_index; safe defaults are assigned.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['add', 'update', 'remove', 'group', 'ungroup']
              },
              element: {
                type: 'object',
                description:
                  'For add: rect, ellipse, line, path or text with x/y/w/h plus optional style and type fields.'
              },
              element_id: { type: 'string' },
              patch: { type: 'object' },
              element_ids: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 64
              },
              group_ids: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 64
              },
              name: { type: 'string' }
            },
            required: ['kind'],
            additionalProperties: false
          }
        }
      },
      required: ['document_id', 'page_id', 'expected_revision', 'idempotency_key', 'operations'],
      additionalProperties: false
    },
    policy: 'auto',
    // The tool remains harmless outside Design because the renderer rejects a
    // command unless its active document/page/workspace/revision all match.
    // Keeping it advertised avoids a skill-selection race in the Design rail.
    shouldAdvertise: () => true,
    execute: async (args: Record<string, unknown>, context: Record<string, unknown>) => withToolBoundary(async () => {
      const documentId = requiredIdentifier(args.document_id, 'document_id')
      const pageId = requiredIdentifier(args.page_id, 'page_id')
      const expectedRevision = boundedInteger(args.expected_revision, 'expected_revision', 0, 1_000_000_000)
      const idempotencyKey = requiredIdentifier(args.idempotency_key, 'idempotency_key', 160)
      const operations = normalizeCanvasOperations(args.operations)
      const workspaceRoot = typeof context.workspace === 'string' ? context.workspace : ''
      if (!workspaceRoot) throw new Error('invalid_context: active workspace is unavailable')

      return {
        output: {
          ok: true,
          message: `Prepared ${operations.length} Design canvas operation(s).`,
          designCanvasCommand: {
            schema: 'workwise.design.command',
            version: 1,
            idempotencyKey,
            workspaceRoot,
            documentId,
            pageId,
            expectedRevision,
            operations
          }
        }
      }
    })
  })
}

// ---------------------------------------------------------------------------
// design.export_pptx
// ---------------------------------------------------------------------------

function createDesignExportTool(options: DesignToolProviderOptions): LocalTool {
  return LocalToolHost.defineTool({
    name: 'design_export_pptx',
    description:
      'Export a Design workspace SVG file (or a directory of SVG files) as a native editable PPTX. ' +
      'Uses PPT Master svg_to_pptx.py to convert SVG elements to DrawingML shapes. ' +
      'Use when the user asks to export their design as PowerPoint.',
    toolKind: 'file_change',
    inputSchema: {
      type: 'object',
      properties: {
        source_path: {
          type: 'string',
          description: 'Workspace-relative path to a .svg file or a directory containing .svg files.'
        },
        output_path: {
          type: 'string',
          description: 'Workspace-relative path for the output .pptx file. Optional.'
        }
      },
      required: ['source_path'],
      additionalProperties: false
    },
    policy: 'auto',
    shouldAdvertise: (ctx: { activeSkillIds?: readonly string[] }) => ctx.activeSkillIds?.includes('design') === true,
    execute: async (args: Record<string, unknown>, context: Record<string, unknown>) => withToolBoundary(async () => {
      const sourceResolved = await resolveWorkspacePath(args.source_path as string, context as any)
      if (!sourceResolved || !existsSync(sourceResolved.absolutePath)) {
        throw new Error('invalid_input: source_path does not exist')
      }
      const sourcePath = sourceResolved.absolutePath

      const outputName = (args.output_path as string) ?? (args.source_path as string).replace(/\.(svg|\/)$/, '') + '.pptx'
      const outputResolved = await resolveWorkspacePath(outputName, context as any)
      if (!outputResolved) throw new Error('invalid_input: output_path is required')
      const outputPath = outputResolved.absolutePath

      if (options.beforeMutation) {
        await options.beforeMutation({
          absolutePath: outputResolved.absolutePath,
          relativePath: outputResolved.relativePath,
          workspaceRoot: outputResolved.workspaceRoot,
          threadId: (context as any).threadId
        })
      }

      // 调用 exportDesignToPptx（通过临时项目目录 + svg_to_pptx.py）
      // 这里复用 main 进程的 design-export-service 逻辑
      // 但 kun 在自己的进程里，需要独立调用
      const { exportDesignSvgToPptx } = await import('./design-export-runner.js')
      await exportDesignSvgToPptx(sourcePath, outputPath)

      const { stat } = await import('node:fs/promises')
      const statResult = await stat(outputPath)
      if (!statResult.isFile() || statResult.size === 0) {
        throw new Error('design_export_failed: output file is empty or missing')
      }

      return {
        output: {
          ok: true,
          format: 'pptx',
          generatedFiles: [{
            name: outputResolved.relativePath.split(/[\\/]/).pop() ?? 'export.pptx',
            path: outputResolved.relativePath,
            relativePath: outputResolved.relativePath,
            absolutePath: outputResolved.absolutePath,
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            byteSize: statResult.size
          }]
        }
      }
    })
  })
}

// ---------------------------------------------------------------------------
// design.list_presets（只读，不需要 git checkpoint）
// ---------------------------------------------------------------------------

function createDesignListPresetsTool(): LocalTool {
  return LocalToolHost.defineTool({
    name: 'design_list_presets',
    description:
      'List all available DrawingML preset shape names (187 presets like rightArrow, star5, etc.). ' +
      'Use when the user wants to know what shapes are available for their design.',
    toolKind: 'tool_call',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Optional substring to filter shape names.'
        }
      },
      additionalProperties: false
    },
    policy: 'auto',
    shouldAdvertise: (ctx: { activeSkillIds?: readonly string[] }) => ctx.activeSkillIds?.includes('design') === true,
    execute: async (args: Record<string, unknown>) => withToolBoundary(async () => {
      const { listPresetShapes } = await import('./design-preset-runner.js')
      let shapes = await listPresetShapes()
      const search = args.search as string | undefined
      if (search) {
        shapes = shapes.filter((name) => name.toLowerCase().includes(search.toLowerCase()))
      }
      return {
        output: {
          ok: true,
          count: shapes.length,
          shapes: shapes.slice(0, 50) // 限制输出长度
        }
      }
    })
  })
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

type CanvasOperation =
  | { kind: 'add'; element: Record<string, unknown> }
  | { kind: 'update'; elementId: string; patch: Record<string, unknown> }
  | { kind: 'remove'; elementIds: string[] }
  | { kind: 'group'; elementIds: string[]; name?: string }
  | { kind: 'ungroup'; groupIds: string[] }

function recordOf(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid_input: ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredIdentifier(value: unknown, field: string, maxLength = 200): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9._:-]+$/.test(value) ||
    value.length > maxLength
  ) {
    throw new Error(`invalid_input: ${field} is invalid`)
  }
  return value
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`invalid_input: ${field} must be an integer between ${minimum} and ${maximum}`)
  }
  return number
}

function boundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fallback?: number
): number {
  if (value === undefined && fallback !== undefined) return fallback
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`invalid_input: ${field} must be between ${minimum} and ${maximum}`)
  }
  return number
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`invalid_input: ${field} is invalid`)
  }
  return value
}

function optionalColor(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`invalid_input: ${field} must be a 6-digit hex color without #`)
  }
  return value.toUpperCase()
}

function identifierArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new Error(`invalid_input: ${field} must contain 1-64 ids`)
  }
  return [...new Set(value.map((item) => requiredIdentifier(item, field)))]
}

function normalizeElement(value: unknown): Record<string, unknown> {
  const element = recordOf(value, 'element')
  const type = element.type
  if (!['rect', 'ellipse', 'line', 'path', 'text'].includes(String(type))) {
    throw new Error('invalid_input: add.element.type must be rect, ellipse, line, path or text')
  }
  const normalized: Record<string, unknown> = {
    id: element.id === undefined
      ? `el_agent_${randomUUID().replaceAll('-', '')}`
      : requiredIdentifier(element.id, 'element.id'),
    type,
    x: boundedNumber(element.x, 'element.x', -100_000, 100_000),
    y: boundedNumber(element.y, 'element.y', -100_000, 100_000),
    w: boundedNumber(element.w, 'element.w', 1, 100_000),
    h: boundedNumber(element.h, 'element.h', 1, 100_000),
    rotation: boundedNumber(element.rotation, 'element.rotation', -3600, 3600, 0),
    zIndex: boundedInteger(element.z_index ?? element.zIndex ?? 0, 'element.z_index', 0, 1_000_000)
  }
  const fill = optionalColor(element.fill, 'element.fill')
  const stroke = optionalColor(element.stroke, 'element.stroke')
  const name = optionalText(element.name, 'element.name', 200)
  if (fill) normalized.fill = fill
  if (stroke) normalized.stroke = stroke
  if (name) normalized.name = name
  if (element.stroke_width !== undefined || element.strokeWidth !== undefined) {
    normalized.strokeWidth = boundedNumber(
      element.stroke_width ?? element.strokeWidth,
      'element.stroke_width',
      0,
      100
    )
  }
  if (element.opacity !== undefined) {
    normalized.opacity = boundedNumber(element.opacity, 'element.opacity', 0, 1)
  }
  if (type === 'text') {
    normalized.text = optionalText(element.text, 'element.text', 20_000) ?? 'Text'
    normalized.fontSize = boundedNumber(
      element.font_size ?? element.fontSize,
      'element.font_size',
      1,
      1000,
      32
    )
    normalized.fontFamily =
      optionalText(element.font_family ?? element.fontFamily, 'element.font_family', 200) ??
      'system-ui'
    normalized.fontWeight =
      optionalText(element.font_weight ?? element.fontWeight, 'element.font_weight', 40) ??
      '400'
    const align = element.text_align ?? element.textAlign ?? 'left'
    if (!['left', 'center', 'right'].includes(String(align))) {
      throw new Error('invalid_input: element.text_align is invalid')
    }
    normalized.textAlign = align
  }
  if (type === 'path') {
    const pathData = optionalText(
      element.path_data ?? element.pathData,
      'element.path_data',
      100_000
    )
    if (!pathData || /[<>{};]/.test(pathData)) {
      throw new Error('invalid_input: element.path_data is invalid')
    }
    normalized.pathData = pathData
  }
  return normalized
}

function normalizePatch(value: unknown): Record<string, unknown> {
  const patch = recordOf(value, 'patch')
  const allowed = new Set([
    'x', 'y', 'w', 'h', 'rotation', 'fill', 'stroke', 'stroke_width', 'strokeWidth',
    'opacity', 'text', 'font_size', 'fontSize', 'font_family', 'fontFamily',
    'font_weight', 'fontWeight', 'text_align', 'textAlign', 'path_data', 'pathData',
    'name', 'locked', 'hidden', 'z_index', 'zIndex'
  ])
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) throw new Error(`invalid_input: patch.${key} is not editable`)
  }
  const probe = normalizeElement({
    id: 'el_probe',
    type: patch.path_data !== undefined || patch.pathData !== undefined ? 'path' : 'text',
    x: patch.x ?? 0,
    y: patch.y ?? 0,
    w: patch.w ?? 1,
    h: patch.h ?? 1,
    rotation: patch.rotation ?? 0,
    zIndex: patch.z_index ?? patch.zIndex ?? 0,
    ...(patch.path_data !== undefined || patch.pathData !== undefined
      ? { pathData: patch.path_data ?? patch.pathData }
      : { text: patch.text ?? '', fontSize: patch.font_size ?? patch.fontSize ?? 32 }),
    ...patch
  })
  const normalized: Record<string, unknown> = {}
  for (const [key, original] of Object.entries(patch)) {
    const camelKey =
      key === 'stroke_width' ? 'strokeWidth'
        : key === 'font_size' ? 'fontSize'
          : key === 'font_family' ? 'fontFamily'
            : key === 'font_weight' ? 'fontWeight'
              : key === 'text_align' ? 'textAlign'
                : key === 'path_data' ? 'pathData'
                  : key === 'z_index' ? 'zIndex'
                    : key
    normalized[camelKey] = probe[camelKey] ?? original
  }
  return normalized
}

function normalizeCanvasOperations(value: unknown): CanvasOperation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new Error('invalid_input: operations must contain 1-64 entries')
  }
  return value.map((entry, index) => {
    const operation = recordOf(entry, `operations[${index}]`)
    switch (operation.kind) {
      case 'add':
        return { kind: 'add', element: normalizeElement(operation.element) }
      case 'update':
        return {
          kind: 'update',
          elementId: requiredIdentifier(operation.element_id, `operations[${index}].element_id`),
          patch: normalizePatch(operation.patch)
        }
      case 'remove':
        return {
          kind: 'remove',
          elementIds: identifierArray(operation.element_ids, `operations[${index}].element_ids`)
        }
      case 'group': {
        const name = optionalText(operation.name, `operations[${index}].name`, 200)
        return {
          kind: 'group',
          elementIds: identifierArray(operation.element_ids, `operations[${index}].element_ids`),
          ...(name ? { name } : {})
        }
      }
      case 'ungroup':
        return {
          kind: 'ungroup',
          groupIds: identifierArray(operation.group_ids, `operations[${index}].group_ids`)
        }
      default:
        throw new Error(`invalid_input: operations[${index}].kind is invalid`)
    }
  })
}
