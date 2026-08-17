import { z } from 'zod'

const UiId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const UiText = z.string().max(2_000)
const UiActionId = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)

const LeafNode = z.discriminatedUnion('type', [
  z.object({ id: UiId, type: z.literal('text'), text: UiText }).strict(),
  z.object({ id: UiId, type: z.literal('stat'), label: UiText, value: UiText }).strict(),
  z.object({ id: UiId, type: z.literal('progress'), label: UiText.optional(), value: z.number().min(0).max(1_000_000), max: z.number().positive().max(1_000_000) }).strict(),
  z.object({ id: UiId, type: z.literal('table'), columns: z.array(UiText).max(12), rows: z.array(z.array(UiText).max(12)).max(50) }).strict(),
  z.object({ id: UiId, type: z.literal('keyvalue'), items: z.array(z.object({ key: UiText, value: UiText }).strict()).max(50) }).strict(),
  z.object({ id: UiId, type: z.literal('callout'), tone: z.enum(['info', 'success', 'warning', 'danger']), title: UiText.optional(), text: UiText }).strict(),
  z.object({ id: UiId, type: z.literal('button'), label: UiText, actionId: UiActionId, disabled: z.boolean().optional() }).strict(),
  z.object({ id: UiId, type: z.literal('input'), label: UiText, name: UiId, actionId: UiActionId, value: UiText.optional(), placeholder: UiText.optional(), inputType: z.enum(['text', 'password']).optional(), disabled: z.boolean().optional() }).strict(),
  z.object({ id: UiId, type: z.literal('select'), label: UiText, name: UiId, actionId: UiActionId, options: z.array(z.object({ label: UiText, value: UiText }).strict()).max(50), value: UiText.optional(), disabled: z.boolean().optional() }).strict(),
  z.object({ id: UiId, type: z.literal('checkbox'), label: UiText, name: UiId, actionId: UiActionId, checked: z.boolean().optional(), disabled: z.boolean().optional() }).strict(),
  z.object({ id: UiId, type: z.literal('switch'), label: UiText, name: UiId, actionId: UiActionId, checked: z.boolean().optional(), disabled: z.boolean().optional() }).strict()
])

type DshUiNode = z.infer<typeof LeafNode> | {
  id: string
  type: 'row' | 'col' | 'grid' | 'tabs'
  children: DshUiNode[]
}

const ContainerNode: z.ZodType<DshUiNode> = z.lazy(() => z.discriminatedUnion('type', [
  LeafNode,
  z.object({ id: UiId, type: z.enum(['row', 'col', 'grid', 'tabs']), children: z.array(ContainerNode).min(1).max(50) }).strict()
]))

const DshUiBlock = z.object({
  id: UiId,
  root: ContainerNode,
  specFingerprint: z.string().regex(/^[a-f0-9]{16}$/).optional()
}).strict().superRefine((block, context) => {
  const visit = (node: DshUiNode): void => {
    if (node.type === 'input' && node.inputType === 'password' && node.value !== undefined) {
      context.addIssue({ code: 'custom', message: 'password controls cannot define persisted values' })
    }
    if ('children' in node) node.children.forEach(visit)
  }
  visit(block.root)
})

export type StreamingDshUiBlock = z.infer<typeof DshUiBlock> & { specFingerprint: string }
export type DshUiProjectionDiagnostic = {
  code: 'invalid_block' | 'unclosed_fence' | 'runtime_rejected'
  blockId?: string
}

const MAX_DEPTH = 8
const MAX_NODES = 200
const MAX_BLOCKS = 20
const CLOSED_FENCE = /```dsh-ui[ \t]*\n([\s\S]*?)```/g
const OPEN_FENCE = /```dsh-ui[ \t]*\n/g

export function projectDshUiText(
  text: string,
  options: { settled: boolean; persistedBlockIds?: readonly string[] }
): {
  markdown: string
  blocks: StreamingDshUiBlock[]
  diagnostics: DshUiProjectionDiagnostic[]
} {
  const persisted = new Set(options.persistedBlockIds ?? [])
  const seenBlockIds = new Set<string>()
  const closedStarts = new Set<number>()
  const blocks: StreamingDshUiBlock[] = []
  const diagnostics: DshUiProjectionDiagnostic[] = []
  const output: string[] = []
  let cursor = 0

  for (const match of text.matchAll(CLOSED_FENCE)) {
    const start = match.index
    const source = match[0]
    if (start === undefined || !source) continue
    closedStarts.add(start)
    output.push(text.slice(cursor, start))
    cursor = start + source.length

    const parsed = parseBlock(match[1] ?? '')
    const duplicate = parsed ? seenBlockIds.has(parsed.id) : false
    const withinLimit = blocks.length < MAX_BLOCKS
    if (!parsed || duplicate || !withinLimit) {
      output.push(source)
      if (options.settled) diagnostics.push({ code: 'invalid_block' })
      continue
    }
    seenBlockIds.add(parsed.id)

    if (options.settled) {
      if (persisted.has(parsed.id)) {
        continue
      }
      output.push(source)
      diagnostics.push({ code: 'runtime_rejected', blockId: parsed.id })
      continue
    }
    blocks.push(parsed)
  }
  output.push(text.slice(cursor))

  if (options.settled) {
    const hasUnclosedFence = [...text.matchAll(OPEN_FENCE)].some((match) =>
      match.index !== undefined && !closedStarts.has(match.index)
    )
    if (hasUnclosedFence) diagnostics.push({ code: 'unclosed_fence' })
  }

  return { markdown: output.join(''), blocks, diagnostics }
}

function parseBlock(source: string): StreamingDshUiBlock | null {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch {
    return null
  }
  const parsed = DshUiBlock.safeParse(raw)
  if (!parsed.success) return null
  try {
    validateTree(parsed.data.root)
  } catch {
    return null
  }
  const { specFingerprint: _ignored, ...spec } = parsed.data
  return {
    ...spec,
    specFingerprint: stableFingerprint(stableStringify(spec))
  }
}

function validateTree(root: DshUiNode): void {
  const ids = new Set<string>()
  const actionIds = new Set<string>()
  let nodes = 0
  const visit = (node: DshUiNode, depth: number): void => {
    if (depth > MAX_DEPTH) throw new Error('depth limit exceeded')
    if (ids.has(node.id)) throw new Error('duplicate node id')
    ids.add(node.id)
    if ('actionId' in node) {
      if (actionIds.has(node.actionId)) throw new Error('duplicate action id')
      actionIds.add(node.actionId)
    }
    nodes += 1
    if (nodes > MAX_NODES) throw new Error('node limit exceeded')
    if ('children' in node) node.children.forEach((child) => visit(child, depth + 1))
    if (node.type === 'table' && node.rows.some((row) => row.length > node.columns.length)) {
      throw new Error('table row exceeds column count')
    }
  }
  visit(root, 1)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function stableFingerprint(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
    second ^= second >>> 13
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}
