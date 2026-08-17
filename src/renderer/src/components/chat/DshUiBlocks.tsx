import { type KeyboardEvent, type ReactElement, useEffect, useState } from 'react'
import {
  runtimeUiActionClient,
  uiActionCardCacheKey,
  UiActionInteractionCache,
  type UiActionClient,
  type UiActionInput
} from '../../lib/ui-action-client'

type Node = Record<string, unknown>
type Block = { id: string; specFingerprint: string; root: Node }
type ActionClient = Pick<UiActionClient, 'submit'> & Partial<Pick<UiActionClient, 'isAvailable'>>
type ActionContext = Omit<UiActionInput, 'actionId' | 'value' | 'password'>
type ActionStatus = { pending: boolean; submitted: boolean; error: string | null }

const interactionCache = new UiActionInteractionCache()

export function DshUiBlocks({
  blocks,
  threadId,
  messageId,
  client = runtimeUiActionClient,
  cache = interactionCache
}: {
  blocks: unknown[]
  threadId: string | null
  messageId: string
  client?: ActionClient
  cache?: UiActionInteractionCache
}): ReactElement | null {
  const valid = blocks.filter(isBlock)
  const [available, setAvailable] = useState<boolean | null>(client.isAvailable ? null : true)
  useEffect(() => {
    let disposed = false
    if (!client.isAvailable) return
    void client.isAvailable().then((next) => {
      if (!disposed) setAvailable(next)
    })
    return () => {
      disposed = true
    }
  }, [client])
  if (valid.length === 0) return null
  return <div className="mt-3 space-y-2">{valid.map((block) => {
    const context: ActionContext | null = threadId ? {
      threadId,
      messageId,
      blockId: block.id,
      specFingerprint: block.specFingerprint
    } : null
    return <UiNode
      key={block.id}
      node={block.root}
      depth={1}
      context={context}
      cardId={context ? uiActionCardCacheKey(context) : ''}
      client={client}
      cache={cache}
      available={available === true}
    />
  })}</div>
}

function UiNode({
  node,
  depth,
  context,
  cardId,
  client,
  cache,
  available
}: {
  node: Node
  depth: number
  context: ActionContext | null
  cardId: string
  client: ActionClient
  cache: UiActionInteractionCache
  available: boolean
}): ReactElement | null {
  if (depth > 8 || !isNode(node)) return null
  const id = String(node.id)
  const type = String(node.type)
  if (type === 'text') return <p key={id} className="text-[13px] leading-6">{String(node.text)}</p>
  if (type === 'stat') return <div className="rounded border border-ds-border-muted px-3 py-2"><div className="text-[11px] text-ds-muted">{String(node.label)}</div><div className="text-[18px] font-semibold">{String(node.value)}</div></div>
  if (type === 'progress') {
    const max = number(node.max)
    const value = Math.min(max, Math.max(0, number(node.value)))
    return <div className="space-y-1"><div className="text-[12px] text-ds-muted">{String(node.label ?? '')}</div><div className="h-2 overflow-hidden rounded bg-ds-border-muted"><div className="h-full bg-accent" style={{ width: `${max ? (value / max) * 100 : 0}%` }} /></div></div>
  }
  if (type === 'table' && Array.isArray(node.columns) && Array.isArray(node.rows)) return <div className="overflow-auto"><table className="w-full border-collapse text-left text-[12px]"><thead><tr>{node.columns.slice(0, 12).map((column, index) => <th key={index} className="border-b border-ds-border-muted px-2 py-1.5 font-semibold">{String(column)}</th>)}</tr></thead><tbody>{node.rows.slice(0, 50).map((row, index) => <tr key={index}>{Array.isArray(row) ? row.slice(0, 12).map((cell, cellIndex) => <td key={cellIndex} className="border-b border-ds-border-muted px-2 py-1.5">{String(cell)}</td>) : null}</tr>)}</tbody></table></div>
  if (type === 'keyvalue' && Array.isArray(node.items)) return <dl className="space-y-1 text-[12px]">{node.items.slice(0, 50).map((item, index) => isObject(item) ? <div key={index} className="flex gap-3"><dt className="text-ds-muted">{String(item.key)}</dt><dd>{String(item.value)}</dd></div> : null)}</dl>
  if (type === 'callout') return <div className="rounded border border-ds-border-muted px-3 py-2 text-[12px]"><div className="font-semibold">{String(node.title ?? '')}</div><div>{String(node.text)}</div></div>
  if (['button', 'input', 'select', 'checkbox', 'switch'].includes(type)) return <InteractiveNode node={node} context={context} cardId={cardId} client={client} cache={cache} available={available} />
  if (['row', 'col', 'grid', 'tabs'].includes(type) && Array.isArray(node.children)) return <div className={type === 'row' ? 'flex flex-wrap gap-2' : type === 'grid' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-2'}>{node.children.slice(0, 50).map((child, index) => isObject(child) ? <UiNode key={String(child.id ?? index)} node={child} depth={depth + 1} context={context} cardId={cardId} client={client} cache={cache} available={available} /> : null)}</div>
  return null
}

function InteractiveNode({
  node,
  context,
  cardId,
  client,
  cache,
  available
}: {
  node: Node
  context: ActionContext | null
  cardId: string
  client: ActionClient
  cache: UiActionInteractionCache
  available: boolean
}): ReactElement {
  const type = String(node.type)
  const label = String(node.label ?? '')
  const fieldName = String(node.name ?? node.id)
  const cached = cardId ? cache.getValue(cardId, fieldName) : undefined
  const [value, setValue] = useState<string | boolean>(() => {
    if (cached !== undefined) return cached
    if (type === 'checkbox' || type === 'switch') return node.checked === true
    if (type === 'input' && node.inputType === 'password') return ''
    return String(node.value ?? '')
  })
  const [status, setStatus] = useState<ActionStatus>({ pending: false, submitted: false, error: null })
  const isPassword = type === 'input' && node.inputType === 'password'
  const disabled = !available || context === null || node.disabled === true || isPassword || status.pending

  const rememberValue = (next: string | boolean): void => {
    setValue(next)
    if (cardId) cache.setValue(cardId, fieldName, next)
  }
  const submit = async (nextValue?: string | boolean): Promise<void> => {
    if (disabled || !context) return
    setStatus({ pending: true, submitted: false, error: null })
    try {
      await client.submit({
        ...context,
        actionId: String(node.actionId),
        ...(nextValue !== undefined ? { value: nextValue } : {})
      })
      setStatus({ pending: false, submitted: true, error: null })
    } catch (error) {
      setStatus({
        pending: false,
        submitted: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  const statusText = status.pending ? '提交中...' : status.submitted ? '已提交' : status.error

  if (type === 'button') return <div className="space-y-1"><button type="button" disabled={disabled} onClick={() => void submit()} className="rounded border border-ds-border px-3 py-1.5 text-[12px] disabled:opacity-60">{label}</button>{statusText ? <ActionStatusText error={Boolean(status.error)}>{statusText}</ActionStatusText> : null}</div>
  if (type === 'select') return <label className="flex flex-col gap-1 text-[12px]">{label}<select disabled={disabled} value={String(value)} onChange={(event) => { const next = event.currentTarget.value; rememberValue(next); void submit(next) }} className="rounded border border-ds-border bg-ds-main px-2 py-1.5">{Array.isArray(node.options) ? node.options.slice(0, 50).map((option, index) => isObject(option) ? <option key={index} value={String(option.value)}>{String(option.label)}</option> : null) : null}</select>{statusText ? <ActionStatusText error={Boolean(status.error)}>{statusText}</ActionStatusText> : null}</label>
  if (type === 'checkbox' || type === 'switch') return <label className="flex flex-wrap items-center gap-2 text-[12px]"><input type="checkbox" disabled={disabled} checked={value === true} onChange={(event) => { const next = event.currentTarget.checked; rememberValue(next); void submit(next) }} />{label}{statusText ? <ActionStatusText error={Boolean(status.error)}>{statusText}</ActionStatusText> : null}</label>
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit(String(value))
  }
  return <label className="flex flex-col gap-1 text-[12px]">{label}<input disabled={disabled} type={isPassword ? 'password' : 'text'} value={String(value)} placeholder={String(node.placeholder ?? '')} onChange={(event) => rememberValue(event.currentTarget.value)} onKeyDown={onInputKeyDown} className="rounded border border-ds-border bg-ds-main px-2 py-1.5" />{statusText ? <ActionStatusText error={Boolean(status.error)}>{statusText}</ActionStatusText> : null}</label>
}

function ActionStatusText({ children, error }: { children: string; error: boolean }): ReactElement {
  return <span role="status" className={error ? 'text-[11px] text-red-700 dark:text-red-300' : 'text-[11px] text-ds-muted'}>{children}</span>
}

function isBlock(value: unknown): value is Block {
  return isObject(value) &&
    typeof value.id === 'string' &&
    /^[a-f0-9]{16}$/.test(String(value.specFingerprint ?? '')) &&
    isObject(value.root)
}
function isNode(value: Node): boolean { return typeof value.id === 'string' && typeof value.type === 'string' }
function isObject(value: unknown): value is Node { return !!value && typeof value === 'object' && !Array.isArray(value) }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0 }
