// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CosaIn1MappingForm } from './CosaIn1MappingForm'
import { CosaIn1MappingRequestV1 } from '../../../../../kun/src/contracts/survey'
import i18n from '../../i18n'

let container: HTMLDivElement
let root: Root
const confirm = vi.fn()
const cancel = vi.fn()

async function change(selector: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!
  const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

beforeEach(async () => {
  confirm.mockReset(); cancel.mockReset()
  await i18n.changeLanguage('zh')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(CosaIn1MappingForm, { fileName: 'field.in1', disabled: false, onConfirm: confirm, onCancel: cancel })))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('COSA mapping confirmation', () => {
  it('sends explicit section boundaries, column roles and units in the Runtime contract', async () => {
    expect(confirm).not.toHaveBeenCalled()
    await change('input[type=number]', '2')
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    const mapping = CosaIn1MappingRequestV1.parse(confirm.mock.calls[0]![0])
    expect(mapping.knownPointRecordCount).toBe(2)
    expect(mapping).toMatchObject({ heightUnit: 'm', routeLengthUnit: 'km', textEncoding: 'ascii' })
    expect(mapping.knownPoints.bindings).toEqual([{ field: 'point', columnIndex: 0 }, { field: 'height', columnIndex: 1 }])
    expect(mapping.observations.bindings).toEqual([{ field: 'from', columnIndex: 0 }, { field: 'to', columnIndex: 1 }, { field: 'value', columnIndex: 2 }, { field: 'routeLengthKm', columnIndex: 3 }])
  })

  it('blocks duplicate columns and preserves explicit choices across language changes', async () => {
    const selects = container.querySelectorAll('select')
    await act(async () => { selects[3]!.value = '0'; selects[3]!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(confirm).not.toHaveBeenCalled()
    await act(async () => i18n.changeLanguage('en'))
    expect(container.querySelector('form')!.getAttribute('aria-label')).toBe('Confirm COSA leveling fields')
    expect(container.querySelector('[role=alert]')!.textContent).toBe('Each column must map to one field within its section.')
    expect(selects[3]!.value).toBe('0')
  })

  it('does not silently treat an invalid count as a section separator', async () => {
    await change('input[type=number]', '0')
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(confirm).not.toHaveBeenCalled()
    expect(container.querySelector('[role=alert]')).not.toBeNull()
    await act(async () => container.querySelector<HTMLButtonElement>('button[type=button]')!.click())
    expect(cancel).toHaveBeenCalledOnce()
  })
})
