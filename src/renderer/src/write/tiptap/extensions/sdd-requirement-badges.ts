import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { isSddRequirementStatus, type SddRequirementStatus } from '@shared/sdd-trace'

const HEADING_TEXT_RE = /^(R-\d+)\s*[:：]\s*(.+?)(\s*\{\s*(draft|planned|building|done|verified)\s*\})?\s*$/

const STATUS_LABEL: Record<SddRequirementStatus, string> = {
  draft: '草稿',
  planned: '已规划',
  building: '开发中',
  done: '已完成',
  verified: '已验收'
}

function statusPill(status: SddRequirementStatus): HTMLElement {
  const pill = document.createElement('span')
  pill.className = `sdd-req-pill sdd-req-pill-${status}`
  pill.textContent = STATUS_LABEL[status]
  pill.contentEditable = 'false'
  return pill
}

/**
 * Render SDD requirement headings (`### R-1: 标题 {building}`) with a status
 * pill instead of the raw `{status}` token. The raw token is revealed while
 * the cursor is inside the heading so it stays hand-editable; documents
 * remain plain markdown on disk.
 */
function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = []
  const selectionHead = state.selection.head

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return undefined
    const match = HEADING_TEXT_RE.exec(node.textContent)
    if (!match) return false

    const headingFrom = pos
    const headingTo = pos + node.nodeSize
    const cursorInside = selectionHead >= headingFrom && selectionHead <= headingTo
    const status: SddRequirementStatus =
      match[4] && isSddRequirementStatus(match[4]) ? match[4] : 'draft'

    if (!cursorInside && match[3]) {
      const tokenStart = pos + 1 + (match.index ?? 0) + match[0].lastIndexOf(match[3])
      decorations.push(
        Decoration.inline(tokenStart, tokenStart + match[3].length, {
          class: 'sdd-req-token-hidden'
        })
      )
    }
    decorations.push(
      Decoration.widget(pos + 1 + node.content.size, () => statusPill(status), { side: 1 })
    )
    return false
  })

  return DecorationSet.create(state.doc, decorations)
}

export const SddRequirementBadges = Extension.create({
  name: 'sddRequirementBadges',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('sddRequirementBadges'),
        props: {
          decorations: buildDecorations
        }
      })
    ]
  }
})
