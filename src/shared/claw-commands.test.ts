import { describe, expect, it } from 'vitest'
import { parseClawCommand } from './claw-commands'

describe('parseClawCommand', () => {
  it('recognizes local connection status commands', () => {
    expect(parseClawCommand('/status')).toEqual({ kind: 'status' })
    expect(parseClawCommand('-状态')).toEqual({ kind: 'status' })
    expect(parseClawCommand('／微信状态')).toEqual({ kind: 'status' })
  })
})
