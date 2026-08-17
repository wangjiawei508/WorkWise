import { describe, expect, it } from 'vitest'
import { makeAssistantTextItem } from '../src/domain/item.js'
import { fingerprintDshUiBlock, parseDshUiBlocks } from '../src/contracts/dsh-ui.js'
import { UiActionService } from '../src/services/ui-action-service.js'
import { buildHarness } from './http-server-test-harness.js'

const SELECT_CARD = '```dsh-ui\n{"id":"filters","root":{"id":"layout","type":"col","children":[{"id":"kind","type":"select","label":"Kind","name":"kind","actionId":"choose-kind","options":[{"label":"One","value":"one"},{"label":"Two","value":"two"}]}]}}\n```'
const PASSWORD_CARD = '```dsh-ui\n{"id":"secret","root":{"id":"layout","type":"col","children":[{"id":"password","type":"input","label":"Password","name":"password","actionId":"set-password","inputType":"password"}]}}\n```'

async function seededActionCard(card = SELECT_CARD) {
  const h = buildHarness()
  await h.threadService.create(
    { workspace: '/tmp', model: 'deepseek-chat', mode: 'agent' },
    { id: 'thr_ui_action', title: 'UI action' }
  )
  const { turnId } = await h.turnService.startTurn({
    threadId: 'thr_ui_action',
    request: { prompt: 'Show controls' }
  })
  const [block] = parseDshUiBlocks(card)
  if (!block) throw new Error('expected valid UI card')
  await h.turnService.applyItem(
    'thr_ui_action',
    makeAssistantTextItem({
      id: 'item_card',
      turnId,
      threadId: 'thr_ui_action',
      text: 'Choose one.',
      uiBlocks: [block],
      status: 'completed'
    })
  )
  await h.turnService.finishTurn({ threadId: 'thr_ui_action', turnId, status: 'completed' })
  return { h, block, service: new UiActionService({ sessionStore: h.sessionStore, turns: h.turnService }) }
}

describe('UiActionService', () => {
  it('validates a persisted select action, audits it, and deduplicates concurrent retries', async () => {
    const { h, block, service } = await seededActionCard()
    const request = {
      messageId: 'item_card',
      blockId: block.id,
      actionId: 'choose-kind',
      specFingerprint: fingerprintDshUiBlock(block),
      value: 'two',
      idempotencyKey: 'ui-action-click-1'
    }

    const [first, duplicate] = await Promise.all([
      service.execute({ threadId: 'thr_ui_action', request }),
      service.execute({ threadId: 'thr_ui_action', request })
    ])

    expect(duplicate).toEqual(first)
    const items = await h.sessionStore.loadItems('thr_ui_action')
    expect(items.filter((item) => item.kind === 'ui_action')).toMatchObject([
      {
        threadId: 'thr_ui_action',
        messageId: 'item_card',
        blockId: 'filters',
        actionId: 'choose-kind',
        value: 'two'
      }
    ])
    const events = await h.sessionStore.loadEventsSince('thr_ui_action', 0)
    expect(events.some((event) => event.kind === 'ui_action')).toBe(true)
    const turn = await h.turnService.getTurn('thr_ui_action', first.turnId)
    expect(turn?.items.map((item) => item.kind)).toEqual(['ui_action'])
    expect(turn?.prompt).toBe('')
    expect(turn?.uiAction).toMatchObject({
      messageId: 'item_card',
      blockId: 'filters',
      actionId: 'choose-kind',
      nodeType: 'select',
      fieldName: 'kind',
      value: 'two'
    })
  })

  it('rejects stale, mismatched, and secret-bearing actions without leaking their values', async () => {
    const { h, block, service } = await seededActionCard(PASSWORD_CARD)
    await expect(service.execute({
      threadId: 'thr_ui_action',
      request: {
        messageId: 'item_card',
        blockId: block.id,
        actionId: 'set-password',
        specFingerprint: fingerprintDshUiBlock(block),
        password: 'do-not-persist-this-secret',
        idempotencyKey: 'ui-action-password-1'
      }
    })).rejects.toThrow(/password/i)

    await expect(service.execute({
      threadId: 'thr_ui_action',
      request: {
        messageId: 'item_card',
        blockId: block.id,
        actionId: 'set-password',
        specFingerprint: '0'.repeat(16),
        idempotencyKey: 'ui-action-stale-1'
      }
    })).rejects.toThrow(/stale|fingerprint/i)

    const persisted = JSON.stringify({
      items: await h.sessionStore.loadItems('thr_ui_action'),
      events: await h.sessionStore.loadEventsSince('thr_ui_action', 0)
    })
    expect(persisted).not.toContain('do-not-persist-this-secret')
  })

  it('rejects reusing an idempotency key for a different persisted action value', async () => {
    const { block, service } = await seededActionCard()
    const request = {
      messageId: 'item_card',
      blockId: block.id,
      actionId: 'choose-kind',
      specFingerprint: fingerprintDshUiBlock(block),
      value: 'one',
      idempotencyKey: 'ui-action-conflict-1'
    }
    await service.execute({ threadId: 'thr_ui_action', request })

    await expect(service.execute({
      threadId: 'thr_ui_action',
      request: { ...request, value: 'two' }
    })).rejects.toMatchObject({ code: 'idempotency_conflict' })
  })

  it('rejects reusing a UI action idempotency key for a generic Turn', async () => {
    const { h, block, service } = await seededActionCard()
    const idempotencyKey = 'ui-action-to-turn-conflict-1'
    await service.execute({
      threadId: 'thr_ui_action',
      request: {
        messageId: 'item_card',
        blockId: block.id,
        actionId: 'choose-kind',
        specFingerprint: fingerprintDshUiBlock(block),
        value: 'one',
        idempotencyKey
      }
    })

    await expect(h.turnService.startTurn({
      threadId: 'thr_ui_action',
      request: { prompt: 'must not replace the action', idempotencyKey }
    })).rejects.toMatchObject({ code: 'idempotency_conflict' })
  })
})
