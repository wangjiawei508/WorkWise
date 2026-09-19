// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { EngineeringManifestVerification } from './EngineeringManifestVerification'

let host: HTMLDivElement
let root: Root
const request = vi.fn()
const result = { projectId: 'project', manifestId: 'manifest', checkedAt: '2026-09-19T07:00:00Z', valid: true, checks: [{ id: 'surveyReplay', status: 'passed' }] }
async function render(runtimeReady = true, manifestId = 'manifest'): Promise<void> {
  await act(async () => root.render(createElement(EngineeringManifestVerification, { projectId: 'project', manifestId, runtimeReady, request })))
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  await i18n.changeLanguage('en')
  request.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

it('checks only the selected manifest and explains the review boundary in both languages', async () => {
  request.mockResolvedValue({ verification: result })
  await render()
  await act(async () => host.querySelector('button')!.click())
  expect(request).toHaveBeenCalledExactlyOnceWith('/v1/engineering/projects/project/manifests/manifest/verify', 'POST')
  expect(host.textContent).toContain('Exact Survey recomputation: Passed')
  expect(host.textContent).toContain('not professional review')
  expect(host.querySelector('[role="status"]')).not.toBeNull()
  await act(async () => { await i18n.changeLanguage('zh') })
  expect(host.textContent).toContain('测量结果严格重算: 通过')
  expect(host.textContent).toContain('不是专业复核')
})

it('rejects mismatched results and clears an older success before retry failure', async () => {
  request.mockResolvedValueOnce({ verification: result }).mockRejectedValueOnce(new Error('output unavailable')).mockResolvedValueOnce({ verification: { ...result, manifestId: 'other' } })
  await render()
  await act(async () => host.querySelector('button')!.click())
  expect(host.textContent).toContain('Evidence checks passed')
  await act(async () => host.querySelector('button')!.click())
  expect(host.textContent).not.toContain('Evidence checks passed')
  expect(host.textContent).toContain('output unavailable')
  await act(async () => host.querySelector('button')!.click())
  expect(host.textContent).toContain('identity mismatch')
})

it('disables offline verification and ignores a response after connectivity changes', async () => {
  let complete!: (value: unknown) => void
  request.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  await render()
  await act(async () => host.querySelector('button')!.click())
  await render(false)
  await act(async () => complete({ verification: result }))
  expect(host.querySelector('button')!.disabled).toBe(true)
  expect(host.textContent).not.toContain('Evidence checks passed')
})
