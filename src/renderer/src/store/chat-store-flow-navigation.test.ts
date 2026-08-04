import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chat-store'
describe('Flow navigation', () => {
  beforeEach(() => useChatStore.setState({ route: 'chat', flowFilter: 'all' }))

  it('keeps Scheduled Tasks operable instead of silently redirecting to Flow', () => {
    useChatStore.getState().openSchedule()
    expect(useChatStore.getState()).toMatchObject({ route: 'schedule', flowFilter: 'all' })
    useChatStore.getState().openFlow('scheduled')
    expect(useChatStore.getState()).toMatchObject({ route: 'flow', flowFilter: 'scheduled' })
    useChatStore.getState().openFlow()
    expect(useChatStore.getState()).toMatchObject({ route: 'flow', flowFilter: 'all' })
  })
})
