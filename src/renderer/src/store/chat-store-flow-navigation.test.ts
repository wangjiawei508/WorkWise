import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chat-store'
describe('Flow navigation', () => { beforeEach(() => useChatStore.setState({ route: 'chat', flowFilter: 'all' })); it('redirects Scheduled tasks to the scheduled Flow filter', () => { useChatStore.getState().openSchedule(); expect(useChatStore.getState()).toMatchObject({ route: 'flow', flowFilter: 'scheduled' }); useChatStore.getState().openFlow(); expect(useChatStore.getState()).toMatchObject({ route: 'flow', flowFilter: 'all' }) }) })
