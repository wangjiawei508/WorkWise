import type { AnyExtension, JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { WriteLocalImage } from './local-image'

export type WriteRichFidelity =
  | { eligible: true; normalized: string }
  | { eligible: false; reason: 'parse-error' | 'unstable' | 'text-loss'; detail?: string }

// Rich mode refuses documents above this size; CodeMirror handles them better
// and the open-time fidelity audit below would get expensive.
export const WRITE_RICH_MAX_CHARS = 300_000

export function buildWriteRichExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      link: { openOnClick: false },
      // The rich editor manages undo depth like the CodeMirror history()
      undoRedo: { depth: 200 }
    }),
    TableKit.configure({
      table: { resizable: false }
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    WriteLocalImage
  ]
}

let sharedManager: MarkdownManager | null = null

export function getWriteMarkdownManager(): MarkdownManager {
  if (!sharedManager) {
    sharedManager = new MarkdownManager({
      markedOptions: { gfm: true },
      extensions: buildWriteRichExtensions()
    })
  }
  return sharedManager
}

export function parseWriteMarkdown(markdown: string): JSONContent {
  return getWriteMarkdownManager().parse(markdown)
}

export function serializeWriteMarkdown(doc: JSONContent): string {
  return getWriteMarkdownManager().serialize(doc)
}

function collectPlainText(node: JSONContent | undefined, acc: string[]): string[] {
  if (!node) return acc
  if (node.type === 'text' && node.text) acc.push(node.text)
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectPlainText(child, acc)
  }
  return acc
}

function normalizedPlainText(doc: JSONContent): string {
  return collectPlainText(doc, []).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Open-time gate for the rich editor. A document is eligible only when the
 * markdown round-trip is idempotent after one pass and loses no plain text;
 * everything else (hard-wrapped list continuations, raw HTML blocks, syntax
 * the schema cannot represent) stays in the CodeMirror editor so the file on
 * disk is never silently rewritten.
 */
export function auditWriteMarkdownFidelity(markdown: string): WriteRichFidelity {
  if (markdown.length > WRITE_RICH_MAX_CHARS) {
    return { eligible: false, reason: 'text-loss', detail: 'document too large for rich mode' }
  }
  const manager = getWriteMarkdownManager()
  let firstDoc: JSONContent
  let firstPass: string
  let secondPass: string
  let secondDoc: JSONContent
  try {
    firstDoc = manager.parse(markdown)
    firstPass = manager.serialize(firstDoc)
    secondDoc = manager.parse(firstPass)
    secondPass = manager.serialize(secondDoc)
  } catch (error) {
    return {
      eligible: false,
      reason: 'parse-error',
      detail: error instanceof Error ? error.message : String(error)
    }
  }
  if (firstPass !== secondPass) {
    return { eligible: false, reason: 'unstable' }
  }
  if (normalizedPlainText(firstDoc) !== normalizedPlainText(secondDoc)) {
    return { eligible: false, reason: 'text-loss' }
  }
  return { eligible: true, normalized: firstPass }
}
