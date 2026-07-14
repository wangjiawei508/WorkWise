import { describe, expect, it } from 'vitest'
import { readJsonBody } from '../src/server/read-json-body.js'

describe('readJsonBody', () => {
  it('returns an empty object for requests without a body', async () => {
    await expect(readJsonBody(new Request('http://localhost/v1/demo'))).resolves.toEqual({
      ok: true,
      value: {}
    })
  })

  it('parses valid JSON bodies', async () => {
    await expect(
      readJsonBody(new Request('http://localhost/v1/demo', {
        method: 'POST',
        body: JSON.stringify({ ok: true })
      }))
    ).resolves.toEqual({
      ok: true,
      value: { ok: true }
    })
  })

  it('returns a structured 400 response for invalid JSON bodies', async () => {
    const result = await readJsonBody(new Request('http://localhost/v1/demo', {
      method: 'POST',
      body: '{'
    }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(400)
    expect(JSON.parse(result.response.body)).toMatchObject({
      code: 'validation_error',
      message: 'invalid JSON body'
    })
  })

  it('accepts the exact byte limit and rejects one byte over it', async () => {
    const body = JSON.stringify({ value: 'safe' })
    const limit = Buffer.byteLength(body)
    await expect(readJsonBody(new Request('http://localhost/v1/demo', {
      method: 'POST',
      body
    }), limit)).resolves.toMatchObject({ ok: true })

    const tooLarge = await readJsonBody(new Request('http://localhost/v1/demo', {
      method: 'POST',
      body: `${body} `
    }), limit)
    expect(tooLarge.ok).toBe(false)
    if (tooLarge.ok) return
    expect(tooLarge.response.status).toBe(413)
    expect(JSON.parse(tooLarge.response.body)).toMatchObject({ code: 'payload_too_large' })
  })

  it('rejects an oversized Content-Length before reading the stream', async () => {
    const result = await readJsonBody(new Request('http://localhost/v1/demo', {
      method: 'POST',
      headers: { 'content-length': '101' },
      body: '{}'
    }), 100)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(413)
  })
})
