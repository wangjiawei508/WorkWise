export async function readBoundedResponseBuffer(
  response: Response,
  limit: number,
  label: string
): Promise<Buffer> {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error('Response size limit is invalid.')
  }
  const declaredHeader = response.headers.get('content-length')
  const declared = declaredHeader === null ? null : Number(declaredHeader)
  if (declared !== null && Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(`${label} exceeds its size limit.`)
  }
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => undefined)
        throw new Error(`${label} exceeds its size limit.`)
      }
      chunks.push(Buffer.from(result.value))
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}
