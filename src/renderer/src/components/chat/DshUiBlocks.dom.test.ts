// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiActionClient } from '../../lib/ui-action-client'
import { DshUiBlocks } from './DshUiBlocks'

let container: HTMLDivElement
let root: Root

const fingerprint = '0123456789abcdef'

function client(submit: ReturnType<typeof vi.fn>): Pick<UiActionClient, 'submit'> {
  return { submit } as Pick<UiActionClient, 'submit'>
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('DshUiBlocks actions', () => {
  it('submits a valid persisted button through the Runtime action client', async () => {
    const submit = vi.fn(async () => ({
      threadId: 'thr_1',
      turnId: 'turn_1',
      uiActionItemId: 'item_action_1'
    }))
    await act(async () => {
      root.render(createElement(DshUiBlocks, {
        threadId: 'thr_1',
        messageId: 'item_card',
        client: client(submit),
        blocks: [{
          id: 'filters',
          specFingerprint: fingerprint,
          root: { id: 'apply', type: 'button', label: 'Apply', actionId: 'apply-filter' }
        }]
      }))
    })

    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    await act(async () => button.click())
    await settle()

    expect(submit).toHaveBeenCalledWith({
      threadId: 'thr_1',
      messageId: 'item_card',
      blockId: 'filters',
      actionId: 'apply-filter',
      specFingerprint: fingerprint
    })
    expect(container.textContent).toContain('已提交')
  })

  it('shows a transport error and permits a retry', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error('ui action is stale'))
      .mockResolvedValueOnce({ threadId: 'thr_1', turnId: 'turn_2', uiActionItemId: 'item_action_2' })
    await act(async () => {
      root.render(createElement(DshUiBlocks, {
        threadId: 'thr_1',
        messageId: 'item_card',
        client: client(submit),
        blocks: [{
          id: 'filters',
          specFingerprint: fingerprint,
          root: { id: 'apply', type: 'button', label: 'Apply', actionId: 'apply-filter' }
        }]
      }))
    })

    const button = container.querySelector('button') as HTMLButtonElement
    await act(async () => button.click())
    await settle()
    expect(container.textContent).toContain('ui action is stale')

    await act(async () => button.click())
    await settle()
    expect(submit).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('已提交')
  })

  it('keeps disabled, password, and context-free controls read-only', async () => {
    const submit = vi.fn()
    await act(async () => {
      root.render(createElement(DshUiBlocks, {
        threadId: 'thr_1',
        messageId: 'item_card',
        client: client(submit),
        blocks: [{
          id: 'credentials',
          specFingerprint: fingerprint,
          root: {
            id: 'fields',
            type: 'col',
            children: [
              { id: 'disabled', type: 'button', label: 'Disabled', actionId: 'disabled-action', disabled: true },
              { id: 'password', type: 'input', label: 'Password', name: 'password', actionId: 'save-password', inputType: 'password', value: 'must-not-render' }
            ]
          }
        }]
      }))
    })

    expect([...container.querySelectorAll('button, input')].every((control) => (
      control as HTMLButtonElement | HTMLInputElement
    ).disabled)).toBe(true)
    expect((container.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('')
    expect(submit).not.toHaveBeenCalled()

    await act(async () => {
      root.render(createElement(DshUiBlocks, {
        threadId: null,
        messageId: 'item_card',
        client: client(submit),
        blocks: [{
          id: 'filters',
          specFingerprint: fingerprint,
          root: { id: 'apply', type: 'button', label: 'Apply', actionId: 'apply-filter' }
        }]
      }))
    })
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
    expect(submit).not.toHaveBeenCalled()
  })

  it('disables controls when the Runtime UI action route is unavailable', async () => {
    const submit = vi.fn()
    const isAvailable = vi.fn(async () => false)
    await act(async () => {
      root.render(createElement(DshUiBlocks, {
        threadId: 'thr_1',
        messageId: 'item_card',
        client: { ...client(submit), isAvailable },
        blocks: [{
          id: 'filters',
          specFingerprint: fingerprint,
          root: { id: 'apply', type: 'button', label: 'Apply', actionId: 'apply-filter' }
        }]
      }))
    })

    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
    await settle()
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click())
    expect(submit).not.toHaveBeenCalled()
  })
})
