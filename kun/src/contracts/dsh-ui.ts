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

export type DshUiNode = z.infer<typeof LeafNode> | {
  id: string
  type: 'row' | 'col' | 'grid' | 'tabs'
  children: DshUiNode[]
}

/** Credential-shaped names are treated as secrets even when a model lies about inputType. */
export function isSensitiveDshUiFieldName(name: string): boolean {
  return /(?:password|passwd|passcode|token|secret|apikey|api[-_]?key|authorization|cookie)/i.test(name)
}

const ContainerNode: z.ZodType<DshUiNode> = z.lazy(() => z.discriminatedUnion('type', [
  LeafNode,
  z.object({ id: UiId, type: z.enum(['row', 'col', 'grid', 'tabs']), children: z.array(ContainerNode).min(1).max(50) }).strict()
]))

export const DshUiBlock = z.object({
  id: UiId,
  root: ContainerNode,
  /** Added by the Runtime after parsing; model-supplied values are overwritten. */
  specFingerprint: z.string().regex(/^[a-f0-9]{16}$/).optional()
}).strict().superRefine((block, context) => {
  const visit = (node: DshUiNode): void => {
    if (node.type === 'input' && (node.inputType === 'password' || isSensitiveDshUiFieldName(node.name)) && node.value !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'credential controls cannot define persisted values'
      })
    }
    if ('children' in node) node.children.forEach(visit)
  }
  visit(block.root)
})
export type DshUiBlock = z.infer<typeof DshUiBlock>

export type DshUiActionNode = Extract<DshUiNode, { actionId: string }>

const MAX_DEPTH = 8
const MAX_NODES = 200
const MAX_BLOCKS = 20

export function parseDshUiBlocks(text: string): DshUiBlock[] {
  const blocks: DshUiBlock[] = []
  const seenBlockIds = new Set<string>()
  const fence = /```dsh-ui\s*\n([\s\S]*?)```/g
  for (const match of text.matchAll(fence)) {
    if (blocks.length >= MAX_BLOCKS) break
    let raw: unknown
    try {
      raw = JSON.parse(match[1] ?? '')
    } catch {
      continue
    }
    if (!isDshUiRawTreeWithinBounds(raw)) continue
    const parsed = DshUiBlock.safeParse(raw)
    if (!parsed.success || seenBlockIds.has(parsed.data?.id ?? '')) continue
    try {
      validateTree(parsed.data.root)
      seenBlockIds.add(parsed.data.id)
      blocks.push({
        ...parsed.data,
        specFingerprint: fingerprintDshUiBlock(parsed.data)
      })
    } catch {
      continue
    }
  }
  return blocks
}

function isDshUiRawTreeWithinBounds(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const root = (raw as Record<string, unknown>).root
  if (!root || typeof root !== 'object' || Array.isArray(root)) return false
  const pending: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 1 }]
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    if (!current.node || typeof current.node !== 'object' || Array.isArray(current.node)) return false
    if (current.depth > MAX_DEPTH) return false
    nodes += 1
    if (nodes > MAX_NODES) return false
    const children = (current.node as Record<string, unknown>).children
    if (children === undefined) continue
    if (!Array.isArray(children) || children.length > MAX_NODES) return false
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: children[index], depth: current.depth + 1 })
    }
  }
  return true
}

/**
 * Produces the stable short fingerprint used to bind a client action to the
 * exact persisted card it was rendered from. It deliberately ignores an
 * optional prior fingerprint so replays remain stable.
 */
export function fingerprintDshUiBlock(block: DshUiBlock): string {
  const { specFingerprint: _ignored, ...spec } = DshUiBlock.parse(block)
  return stableFingerprint(stableStringify(spec))
}

export function findDshUiActionNode(
  block: DshUiBlock,
  actionId: string
): DshUiActionNode | undefined {
  const visit = (node: DshUiNode): DshUiActionNode | undefined => {
    if ('actionId' in node && node.actionId === actionId) return node as DshUiActionNode
    if ('children' in node) {
      for (const child of node.children) {
        const found = visit(child)
        if (found) return found
      }
    }
    return undefined
  }
  return visit(block.root)
}

function validateTree(root: DshUiNode): void {
  const ids = new Set<string>()
  const actionIds = new Set<string>()
  let nodes = 0
  const visit = (node: DshUiNode, depth: number): void => {
    if (depth > MAX_DEPTH) throw new Error('dsh-ui depth limit exceeded')
    if (ids.has(node.id)) throw new Error('dsh-ui node ids must be unique')
    ids.add(node.id)
    if ('actionId' in node) {
      if (actionIds.has(node.actionId)) throw new Error('dsh-ui action ids must be unique within a block')
      actionIds.add(node.actionId)
    }
    nodes += 1
    if (nodes > MAX_NODES) throw new Error('dsh-ui node limit exceeded')
    if ('children' in node) node.children.forEach((child) => visit(child, depth + 1))
    if (node.type === 'table' && node.rows.some((row) => row.length > node.columns.length)) {
      throw new Error('dsh-ui table row exceeds column count')
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

/**
 * UI block fingerprints bind an action to the exact persisted declarative
 * block; they are not an authorization primitive. Keep this synchronous and
 * platform-neutral because the same item contract is type-checked by the
 * browser renderer as well as the Node Runtime.
 */
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
