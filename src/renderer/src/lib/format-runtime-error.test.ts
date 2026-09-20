import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { describeRuntimeError, formatRuntimeError, getRuntimeErrorCode } from './format-runtime-error'

describe('format runtime error', () => {
  it.each(['en', 'zh'])('localizes stale engineering approval by exact code and legacy message in %s', async language => {
    await i18n.changeLanguage(language)
    const legacy = 'engineering context changed after approval; refresh context and replan'
    const expected = i18n.t('common:runtimeEngineeringPlanStale')
    for (const message of [
      JSON.stringify({ code: 'engineering_plan_stale', message: 'PRIVATE backend content' }),
      JSON.stringify({ error: { code: 'engineering_plan_stale', message: 'PRIVATE backend content' } }),
      JSON.stringify({ code: 'conflict', message: legacy }),
      legacy
    ]) {
      const error = new Error(`Error invoking remote method 'runtime:request': Error: ${message}`)
      expect(getRuntimeErrorCode(error)).toBe('engineering_plan_stale')
      expect(formatRuntimeError(error, 'Fallback')).toBe(expected)
      expect(formatRuntimeError(error, 'Fallback')).not.toContain('PRIVATE')
      expect(describeRuntimeError(error).settingsAction).toBeUndefined()
    }
    expect(expected).not.toBe('runtimeEngineeringPlanStale')
    expect(formatRuntimeError(new Error(JSON.stringify({ code: 'engineering_plan_stale_extra', message: legacy + ' PRIVATE' })), 'Fallback')).toBe('Fallback')
    expect(formatRuntimeError(new Error('PRIVATE ' + legacy), 'Fallback')).toBe('Fallback')
    expect(formatRuntimeError(new Error(JSON.stringify({ code: 'internal_error', message: 'PRIVATE backend content' })), 'Fallback')).toBe('Fallback')
  })
  it.each(['en', 'zh'])('explains a removed provider with a settings recovery action in %s', async language => {
    await i18n.changeLanguage(language)
    for (const message of ['model_provider_unavailable: saved-provider', JSON.stringify({ code: 'model_provider_unavailable', message: 'saved-provider' })]) {
      expect(describeRuntimeError(new Error(message))).toMatchObject({ code: 'model_provider_unavailable', settingsAction: 'agents', summary: i18n.t('common:runtimeModelProviderUnavailable') })
    }
  })
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('uses code fields for localized summaries and settings actions', () => {
    const error = new Error(JSON.stringify({
      code: 'missing_api_key',
      message: 'api-key=sk-test is missing',
      details: { Authorization: 'Bearer runtime-token' }
    }))

    const view = describeRuntimeError(error)

    expect(view.summary).toBe(i18n.t('common:runtimeMissingApiKey'))
    expect(view.code).toBe('missing_api_key')
    expect(view.settingsAction).toBe('agents')
    expect(view.detail).toContain('<redacted>')
    expect(view.detail).not.toContain('sk-test')
    expect(view.detail).not.toContain('runtime-token')
  })

  it('supports legacy error envelopes and Electron IPC prefixes', () => {
    const error = new Error(
      `Error invoking remote method 'runtime:request': Error: ${JSON.stringify({
        error: 'fetch_failed',
        message: 'fetch failed'
      })}`
    )

    expect(getRuntimeErrorCode(error)).toBe('fetch_failed')
    expect(formatRuntimeError(error)).toBe(i18n.t('common:runtimeFetchFailed'))
  })
})
