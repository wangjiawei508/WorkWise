import { describe, expect, it, vi } from 'vitest'
import { readBoundedResponseBuffer } from './bounded-response'

describe('readBoundedResponseBuffer', () => {
  it('rejects an oversized streaming response without Content-Length', async () => {
    const cancel = vi.fn()
    let chunks = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(6))
        chunks += 1
        if (chunks === 3) controller.close()
      },
      cancel
    })

    await expect(readBoundedResponseBuffer(
      new Response(body, { status: 200 }),
      10,
      'Fixture download'
    )).rejects.toThrow(/exceeds its size limit/i)
    expect(cancel).toHaveBeenCalled()
  })

  it('rejects an oversized declared response before reading its body', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })

    await expect(readBoundedResponseBuffer(
      new Response(body, { headers: { 'content-length': '11' } }),
      10,
      'Fixture download'
    )).rejects.toThrow(/exceeds its size limit/i)
    expect(cancel).toHaveBeenCalled()
  })

  it('returns an in-limit streaming response', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]))
        controller.enqueue(Uint8Array.from([3]))
        controller.close()
      }
    })

    await expect(readBoundedResponseBuffer(
      new Response(body),
      3,
      'Fixture download'
    )).resolves.toEqual(Buffer.from([1, 2, 3]))
  })
})
