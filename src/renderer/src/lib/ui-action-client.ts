import { RUNTIME_INFO_PATH, runtimeThreadUiActionsPath } from '@shared/runtime-endpoints'
import { rendererRuntimeClient } from '../agent/runtime-client'

export type UiActionInput = {
  threadId: string
  messageId: string
  blockId: string
  actionId: string
  specFingerprint: string
  value?: string | boolean
  /** Password actions are deliberately rejected until an ephemeral transport exists. */
  password?: string
}

export type UiActionResponse = {
  threadId: string
  turnId: string
  uiActionItemId: string
}

export type UiActionTransport = {
  post: (threadId: string, body: Omit<UiActionInput, 'threadId' | 'password'> & { idempotencyKey: string }) => Promise<UiActionResponse>
  isAvailable?: () => Promise<boolean>
}

type CachedInteraction = {
  idempotencyKey: string
  pending?: Promise<UiActionResponse>
}

/**
 * Renderer-local interaction state. It retains the generated key after an
 * uncertain transport failure, so a retry resolves to the same Runtime Turn
 * instead of creating another one.
 */
export class UiActionClient {
  private readonly interactions = new Map<string, CachedInteraction>()
  private readonly makeId: () => string
  private readonly maxInteractions = 200
  private availabilityPromise: Promise<boolean> | null = null

  constructor(private readonly deps: { transport: UiActionTransport; makeId?: () => string }) {
    this.makeId = deps.makeId ?? defaultId
  }

  submit(input: UiActionInput): Promise<UiActionResponse> {
    if (input.password !== undefined) {
      return Promise.reject(new Error('password UI actions require an ephemeral secret transport'))
    }
    const key = interactionKey(input)
    const existing = this.interactions.get(key)
    if (!existing && this.interactions.size >= this.maxInteractions && ![...this.interactions.values()].some((entry) => !entry.pending)) {
      return Promise.reject(new Error('UI action interaction capacity is full; wait for pending actions to finish.'))
    }
    const cached = existing ?? { idempotencyKey: this.makeId() }
    if (cached.pending) return cached.pending
    this.interactions.delete(key)
    this.interactions.set(key, cached)
    this.trimInteractions()
    const { threadId, password: _password, ...body } = input
    const pending = this.deps.transport.post(threadId, { ...body, idempotencyKey: cached.idempotencyKey })
    cached.pending = pending
    void pending.then(
      () => {
        if (this.interactions.get(key) === cached) this.interactions.delete(key)
      },
      () => {
        if (this.interactions.get(key) === cached) cached.pending = undefined
        this.trimInteractions()
      }
    ).catch(() => undefined)
    return pending
  }

  get size(): number {
    return this.interactions.size
  }

  async isAvailable(): Promise<boolean> {
    if (this.availabilityPromise) return this.availabilityPromise
    const probe = this.deps.transport.isAvailable?.() ?? Promise.resolve(true)
    const availability = probe.then(Boolean, () => false)
    this.availabilityPromise = availability
    void availability.then(() => {
      if (this.availabilityPromise === availability) this.availabilityPromise = null
    })
    return availability
  }

  hasInteraction(input: Omit<UiActionInput, 'password'>): boolean {
    return this.interactions.has(interactionKey(input))
  }

  private trimInteractions(): void {
    while (this.interactions.size > this.maxInteractions) {
      const evictable = [...this.interactions.entries()].find(([, value]) => !value.pending)
      if (!evictable) break
      this.interactions.delete(evictable[0])
    }
  }
}

export class UiActionInteractionCache {
  private readonly values = new Map<string, string | boolean>()

  constructor(private readonly capacity = 200) {}

  get size(): number {
    return this.values.size
  }

  getValue(cardId: string, fieldName: string): string | boolean | undefined {
    return this.values.get(cacheKey(cardId, fieldName))
  }

  setValue(cardId: string, fieldName: string, value: string | boolean): void {
    const key = cacheKey(cardId, fieldName)
    this.values.delete(key)
    this.values.set(key, value)
    while (this.values.size > Math.max(1, this.capacity)) {
      const oldest = this.values.keys().next().value
      if (oldest === undefined) break
      this.values.delete(oldest)
    }
  }
}

export function uiActionCardCacheKey(input: {
  threadId: string
  messageId: string
  blockId: string
  specFingerprint: string
}): string {
  return JSON.stringify([
    input.threadId,
    input.messageId,
    input.blockId,
    input.specFingerprint
  ])
}

export const runtimeUiActionClient = new UiActionClient({
  transport: {
    async isAvailable() {
      const response = await rendererRuntimeClient.runtimeRequest(RUNTIME_INFO_PATH, 'GET')
      if (!response.ok) return false
      try {
        const parsed = JSON.parse(response.body) as {
          capabilities?: { uiActions?: { available?: unknown } }
        }
        return parsed.capabilities?.uiActions?.available === true
      } catch {
        return false
      }
    },
    async post(threadId, body) {
      const response = await rendererRuntimeClient.runtimeRequest(
        runtimeThreadUiActionsPath(threadId),
        'POST',
        JSON.stringify(body)
      )
      if (!response.ok) throw new Error(readUiActionError(response.body))
      let parsed: unknown
      try {
        parsed = JSON.parse(response.body)
      } catch {
        throw new Error('Runtime returned an invalid UI action response')
      }
      if (!isUiActionResponse(parsed)) {
        throw new Error('Runtime returned an invalid UI action response')
      }
      return parsed
    }
  }
})

function interactionKey(input: Omit<UiActionInput, 'password'>): string {
  return JSON.stringify([
    input.threadId,
    input.messageId,
    input.blockId,
    input.actionId,
    input.specFingerprint,
    input.value
  ])
}

function cacheKey(cardId: string, fieldName: string): string {
  return `${cardId}\u0000${fieldName}`
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  throw new Error('secure random UUID generation is unavailable')
}

function readUiActionError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown }
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
  } catch {
    // Fall through to the stable renderer error.
  }
  return 'UI action failed'
}

function isUiActionResponse(value: unknown): value is UiActionResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return [record.threadId, record.turnId, record.uiActionItemId]
    .every((field) => typeof field === 'string' && field.length > 0)
}
